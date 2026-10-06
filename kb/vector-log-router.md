---
id: "vector-log-router"
title: "Vector: сбор логов Docker и отправка в Loki"
category: "devops"
tags: ["vector", "logs", "loki", "docker", "observability", "vrl"]
sources:
  - title: "Офиц.: документация Vector"
    url: "https://vector.dev/docs/"
  - title: "Офиц.: язык преобразований VRL"
    url: "https://vector.dev/docs/reference/vrl/"
  - title: "Офиц.: источник docker_logs"
    url: "https://vector.dev/docs/reference/configuration/sources/docker_logs/"
  - title: "Офиц.: приёмник loki"
    url: "https://vector.dev/docs/reference/configuration/sinks/loki/"
  - title: "Офиц.: документация Grafana Loki"
    url: "https://grafana.com/docs/loki/latest/"
  - title: "Форум: Vector GitHub Discussions"
    url: "https://github.com/vectordotdev/vector/discussions"
  - title: "Хабр: свежие статьи про Vector"
    url: "https://habr.com/ru/search/?q=vector%20%D0%BB%D0%BE%D0%B3%D0%B8&target_type=posts&order=date"
---

# Vector: маршрутизация логов

Vector читает логи контейнеров Docker, оставляет только ошибки и отправляет их в Grafana Loki. Конфигурация состоит из источников (`sources`), преобразований (`transforms`) и приёмников (`sinks`).

## Конфиг (/etc/vector/vector.yaml)

```yaml
sources:
  docker_logs:
    type: docker_logs

transforms:
  filter_errors:
    type: filter
    inputs:
      - docker_logs
    condition: |
      match(string!(.message), r'(?i)\b(error|fatal|panic)\b')

sinks:
  loki_out:
    type: loki
    inputs:
      - filter_errors
    endpoint: "http://loki.internal:3100"
    encoding:
      codec: json
    labels:
      environment: "production"
      container: "{{ container_name }}"
```

```bash
vector validate /etc/vector/vector.yaml
sudo systemctl restart vector
journalctl -u vector -f
```

- Исходное условие `.message == "error" || .status >= 500` не подходит для docker_logs: у события нет поля `.status`, а точное равенство `"error"` почти никогда не сработает. В примере ищется слово error/fatal/panic в тексте сообщения без учёта регистра.
- VRL строго проверяет типы. `string!(.message)` приводит значение к строке и выдаёт ошибку, если это не строка, поэтому прогоните `vector validate` перед запуском.
- Vector должен иметь доступ к сокету Docker: `/var/run/docker.sock` (пользователь `vector` в группе `docker` или запуск контейнером с монтированием сокета).
- Для Loki нужна хотя бы одна метка. Не делайте метками значения с большим числом вариантов (идентификаторы запросов, адреса): это раздувает индекс Loki. Имя контейнера подходит.
- Чтобы отправлять все логи, а не только ошибки, уберите transform и подключите `inputs: [docker_logs]` напрямую к приёмнику.
- Отладка преобразований: временно добавьте приёмник `type: console` с `encoding.codec: json`.
