---
id: "opentelemetry-collector"
title: "OpenTelemetry Collector: приём трассировок и отправка в Jaeger"
category: "devops"
tags: ["opentelemetry", "otel", "tracing", "jaeger", "collector", "observability"]
sources:
  - title: "Офиц.: OpenTelemetry Collector"
    url: "https://opentelemetry.io/docs/collector/"
  - title: "Офиц.: конфигурация Collector"
    url: "https://opentelemetry.io/docs/collector/configuration/"
  - title: "Офиц.: документация Jaeger"
    url: "https://www.jaegertracing.io/docs/"
  - title: "Репозиторий: open-telemetry/opentelemetry-collector"
    url: "https://github.com/open-telemetry/opentelemetry-collector"
  - title: "Форум: Stack Overflow — тег opentelemetry"
    url: "https://stackoverflow.com/questions/tagged/opentelemetry"
  - title: "Хабр: свежие статьи про OpenTelemetry"
    url: "https://habr.com/ru/search/?q=opentelemetry&target_type=posts&order=date"
---

# OpenTelemetry Collector

Collector принимает телеметрию (трассировки, метрики, логи) от приложений, обрабатывает её и отправляет в хранилища (Jaeger, Tempo, Prometheus и другие). Конфигурация состоит из получателей (`receivers`), обработчиков (`processors`), экспортёров (`exporters`) и конвейеров (`service.pipelines`), которые их связывают.

## Конфиг (otel-collector.yaml)

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
  batch:
    timeout: 1s
    send_batch_size: 1024

exporters:
  otlp/jaeger:
    endpoint: "jaeger-collector:4317"
    tls:
      insecure: true
  debug:
    verbosity: basic

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp/jaeger, debug]
```

```bash
otelcol validate --config=otel-collector.yaml
otelcol --config=otel-collector.yaml
```

- Порт 4317 принимает OTLP по gRPC, порт 4318 по HTTP. Адрес `0.0.0.0` открывает их для всей сети: в современных версиях по умолчанию слушается только localhost, поэтому для приёма от других хостов он задаётся явно, а доступ ограничивайте файрволом или сетью.
- `memory_limiter` защищает от переполнения памяти и ставится первым в списке обработчиков. `batch` группирует данные перед отправкой, это снижает нагрузку.
- Jaeger принимает OTLP напрямую, отдельный экспортёр Jaeger не нужен. Параметр `tls.insecure: true` отключает шифрование: допустим только внутри доверенной сети.
- Экспортёр `debug` печатает данные в лог Collector: удобно при настройке, в продакшене уберите.
- Для метрик и логов добавьте свои конвейеры (`metrics`, `logs`) в `service.pipelines`.

## Подключение приложения

```bash
export OTEL_SERVICE_NAME=payment-api
export OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
```

- Переменные понимают официальные SDK и агенты OpenTelemetry (Java, Python, Node.js и др.). Имя сервиса отображается в Jaeger.
- Если трассировки не появились, смотрите вывод `debug`-экспортёра: он покажет, дошли ли данные до Collector.
