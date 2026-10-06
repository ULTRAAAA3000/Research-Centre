---
id: "prometheus-grafana-monitoring"
title: "Prometheus и Grafana: мониторинг серверов"
category: "devops"
tags: ["prometheus", "grafana", "node-exporter", "promql", "alerting", "monitoring"]
sources:
  - title: "Офиц.: документация Prometheus"
    url: "https://prometheus.io/docs/introduction/overview/"
  - title: "Офиц.: конфигурация Prometheus"
    url: "https://prometheus.io/docs/prometheus/latest/configuration/configuration/"
  - title: "Офиц.: документация Grafana"
    url: "https://grafana.com/docs/grafana/latest/"
  - title: "Репозиторий: prometheus/node_exporter"
    url: "https://github.com/prometheus/node_exporter"
  - title: "Форум: Grafana Community"
    url: "https://community.grafana.com/"
  - title: "Сообщество: Prometheus Community"
    url: "https://prometheus.io/community/"
  - title: "Форум: Stack Overflow — тег prometheus"
    url: "https://stackoverflow.com/questions/tagged/prometheus"
  - title: "Хабр: свежие статьи про Prometheus"
    url: "https://habr.com/ru/search/?q=prometheus%20grafana&target_type=posts&order=date"
---

# Prometheus и Grafana

Prometheus опрашивает экспортеры по HTTP и хранит метрики, Grafana рисует графики, а Alertmanager рассылает оповещения. Базовая связка: node_exporter на каждом сервере, Prometheus собирает метрики, Grafana подключается к Prometheus как к источнику данных.

## Конфиг Prometheus (prometheus.yml)

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - alerts.yml

scrape_configs:
  - job_name: 'node_exporter'
    static_configs:
      - targets: ['10.0.0.10:9100', '10.0.0.11:9100']

  - job_name: 'nginx_exporter'
    static_configs:
      - targets: ['10.0.0.10:9113']
```

```bash
promtool check config prometheus.yml
curl -X POST http://localhost:9090/-/reload
```

- Перезагрузка по HTTP работает, если Prometheus запущен с флагом `--web.enable-lifecycle`, иначе отправьте сигнал `SIGHUP`.
- Порт 9113 использует `nginx-prometheus-exporter`, которому нужен включённый `stub_status` в nginx.

## node_exporter в Docker

```bash
docker run -d --name=node-exporter --restart unless-stopped \
  --net="host" --pid="host" -v "/:/host:ro,rslave" \
  prom/node-exporter:latest --path.rootfs=/host
```

- Вместо `latest` закрепите конкретную версию образа, чтобы обновление не сломало дашборды неожиданно.
- Порт 9100 не открывайте в интернет: доступ только с адреса Prometheus (файрвол или приватная сеть).
- Для обычных серверов node_exporter проще и точнее ставить пакетом или бинарником под systemd, чем в контейнере.

## Запросы PromQL

```text
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100
100 - (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay"} * 100)
```

- Первый запрос даёт загрузку CPU в процентах, второй занятую память, третий занятое место на дисках.

## Правило оповещения (alerts.yml)

```yaml
groups:
  - name: node
    rules:
      - alert: HighCPU
        expr: 100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 85
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "CPU выше 85% на {{ $labels.instance }}"
```

- `for: 10m` отправляет оповещение, только если условие держится 10 минут: так меньше ложных срабатываний.
- Проверка правил: `promtool check rules alerts.yml`.
- Для готовых панелей импортируйте дашборд Node Exporter Full в Grafana (Dashboards → Import).
