---
id: "loki-alloy-logging"
title: "Централизованные логи: Loki, Grafana Alloy (вместо Promtail)"
category: "devops"
tags: ["loki", "alloy", "promtail", "logql", "grafana", "logging"]
sources:
  - title: "Офиц.: документация Grafana Loki"
    url: "https://grafana.com/docs/loki/latest/"
  - title: "Офиц.: Promtail — статус EOL и миграция"
    url: "https://grafana.com/docs/loki/latest/send-data/promtail/"
  - title: "Офиц.: язык запросов LogQL"
    url: "https://grafana.com/docs/loki/latest/query/"
  - title: "Офиц.: Grafana Alloy"
    url: "https://grafana.com/docs/alloy/latest/"
  - title: "Статья: Promtail Is Dead — миграция на Alloy"
    url: "https://blog.elest.io/promtail-is-dead-how-to-migrate-your-log-pipeline-to-grafana-alloy-before-it-breaks/"
  - title: "Форум: Grafana Community"
    url: "https://community.grafana.com/"
  - title: "Хабр: свежие статьи про Loki"
    url: "https://habr.com/ru/search/?q=grafana%20loki&target_type=posts&order=date"
---

# Loki и Grafana Alloy

Loki хранит логи и индексирует только метки, а запросы к ним пишутся на LogQL. Агент доставки логов Promtail закончил жизненный цикл 2 марта 2026 года: обновлений и поддержки больше нет, новым стандартом стал Grafana Alloy. В этой статье новая схема и перевод старого конфига.

## Сбор логов через Alloy (/etc/alloy/config.alloy)

```ini
local.file_match "varlogs" {
  path_targets = [{ "__path__" = "/var/log/*.log", "job" = "varlogs" }]
}

loki.source.file "varlogs" {
  targets    = local.file_match.varlogs.targets
  forward_to = [loki.write.default.receiver]
}

loki.write "default" {
  endpoint {
    url = "http://loki.internal.local:3100/loki/api/v1/push"
  }
}
```

```bash
sudo systemctl enable --now alloy
sudo systemctl status alloy
```

- `local.file_match` ищет файлы, `loki.source.file` читает и отправляет строки, `loki.write` пишет в Loki. Метка `job` задаётся прямо в целях.
- Вместо ручного переписывания можно сконвертировать готовый конфиг Promtail: `alloy convert --source-format=promtail --output=/etc/alloy/config.alloy /etc/promtail/config.yml`.
- Запустите Alloy рядом со старым Promtail на время проверки доставки, потом отключите Promtail.
- Метрики Alloy называются иначе, чем у Promtail: обновите дашборды и алерты, которые на них опирались.

## Старый конфиг Promtail (только для справки)

```yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /var/lib/promtail/positions.yaml

clients:
  - url: http://loki.internal.local:3100/loki/api/v1/push

scrape_configs:
  - job_name: system_logs
    static_configs:
      - targets: [localhost]
        labels:
          job: varlogs
          __path__: /var/log/*.log
```

- Файл позиций лучше держать вне `/tmp`: после перезагрузки логи иначе прочитаются заново.
- Не используйте Promtail в новых установках.

## Запросы LogQL

```text
{job="nginx"} |~ " 5[0-9]{2} "
{job="varlogs"} |= "error"
sum(count_over_time({job="varlogs"} |= "error" [1m]))
sum by (job) (rate({job="varlogs"} |= "error" [5m]))
```

- Фильтр `|=` ищет подстроку, `|~` регулярное выражение. Первый запрос находит коды ответа 5xx в access-логе nginx: текст «500 Internal Server Error» в access-логе не пишется, поэтому ищут сам код.
- `rate()` возвращает количество строк в секунду, а не в минуту. Чтобы получить число ошибок за минуту, используйте `count_over_time(... [1m])`.
- Метки (`job`, `host`) делайте с небольшим числом значений: большое количество уникальных значений резко замедляет Loki.
