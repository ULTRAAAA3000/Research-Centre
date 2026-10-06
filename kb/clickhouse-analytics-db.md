---
id: "clickhouse-analytics-db"
title: "ClickHouse: настройка сервера и таблицы MergeTree"
category: "databases"
tags: ["clickhouse", "olap", "mergetree", "sql", "analytics", "partitions"]
sources:
  - title: "Офиц.: документация ClickHouse"
    url: "https://clickhouse.com/docs"
  - title: "Офиц.: движок MergeTree"
    url: "https://clickhouse.com/docs/en/engines/table-engines/mergetree-family/mergetree"
  - title: "Офиц.: параметры сервера"
    url: "https://clickhouse.com/docs/en/operations/server-configuration-parameters/settings"
  - title: "База знаний: Altinity Knowledge Base"
    url: "https://kb.altinity.com/"
  - title: "Форум: ClickHouse GitHub Discussions"
    url: "https://github.com/ClickHouse/ClickHouse/discussions"
  - title: "Форум: Stack Overflow — тег clickhouse"
    url: "https://stackoverflow.com/questions/tagged/clickhouse"
  - title: "Хабр: свежие статьи про ClickHouse"
    url: "https://habr.com/ru/search/?q=clickhouse&target_type=posts&order=date"
---

# ClickHouse: сервер и MergeTree

ClickHouse это колоночная аналитическая СУБД: быстрые агрегации по большим объёмам данных, но не для частых точечных обновлений. Ниже настройка сервера, таблица для событий с партиционированием по месяцам и запросы для диагностики.

## Параметры сервера (/etc/clickhouse-server/config.d/performance.xml)

```xml
<clickhouse>
    <max_connections>4096</max_connections>
    <max_concurrent_queries>500</max_concurrent_queries>
    <uncompressed_cache_size>8589934592</uncompressed_cache_size>
    <mark_cache_size>5368709120</mark_cache_size>
</clickhouse>
```

```bash
sudo systemctl restart clickhouse-server
clickhouse-client --query "SELECT version()"
```

- Размеры кэшей указаны в байтах: 8 589 934 592 это 8 ГиБ, 5 368 709 120 это 5 ГиБ.
- `uncompressed_cache_size` используется только запросами с включённой настройкой `use_uncompressed_cache = 1` (по умолчанию выключена), поэтому большой кэш без неё простаивает.
- `mark_cache_size` хранит метки индекса MergeTree и полезен почти всегда. Следите, чтобы сумма кэшей и рабочей памяти запросов помещалась в RAM.
- `max_concurrent_queries = 500` выше значения по умолчанию, много параллельных тяжёлых запросов быстро съедят память и CPU. Начните с меньшего значения.
- Файлы в `config.d/` переопределяют `config.xml` и не затираются при обновлении пакета.

## Таблица временных рядов

```sql
CREATE TABLE system_events (
    event_date Date,
    event_time DateTime,
    service_name String,
    user_id UInt64,
    message String
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (service_name, event_time, user_id);
```

- `ORDER BY` задаёт первичный ключ и порядок хранения: ставьте первыми столбцы, по которым чаще всего фильтруете.
- `PARTITION BY toYYYYMM(...)` режет таблицу на месячные партиции. Партиций должно быть десятки или сотни, а не тысячи: мелкие партиции замедляют запросы и слияния.
- Для автоудаления старых данных добавьте в определение таблицы, например, `TTL event_date + INTERVAL 90 DAY`.
- Вставляйте данные крупными пачками (тысячи строк и больше), а не по одной строке.

## Диагностика

```sql
SELECT partition, name, active, rows, bytes_on_disk
FROM system.parts
WHERE database = currentDatabase() AND table = 'system_events' AND active;

SELECT query_duration_ms, read_rows, formatReadableSize(memory_usage) AS mem, query
FROM system.query_log
WHERE type = 'QueryFinish'
ORDER BY query_duration_ms DESC
LIMIT 10;
```

- Фильтр `active` отбрасывает куски, уже объединённые слиянием, иначе строки посчитаются дважды.
- `system.query_log` показывает самые долгие запросы. Если таблицы нет или она пуста, проверьте, что включён `log_queries`.
