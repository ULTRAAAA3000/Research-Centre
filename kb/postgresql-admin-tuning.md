---
id: "postgresql-admin-tuning"
title: "PostgreSQL: настройка памяти и диагностические запросы"
category: "databases"
tags: ["postgresql", "postgres", "tuning", "sql", "pg_stat_activity", "dba", "index"]
sources:
  - title: "Офиц.: настройки ресурсов (shared_buffers, work_mem)"
    url: "https://www.postgresql.org/docs/current/runtime-config-resource.html"
  - title: "Офиц.: мониторинг и статистика (pg_stat_*)"
    url: "https://www.postgresql.org/docs/current/monitoring-stats.html"
  - title: "Вики: PostgreSQL Wiki — Tuning Your PostgreSQL Server"
    url: "https://wiki.postgresql.org/wiki/Tuning_Your_PostgreSQL_Server"
  - title: "Инструмент: PGTune — подбор параметров под железо"
    url: "https://pgtune.leopard.in.ua/"
  - title: "Форум: DBA Stack Exchange — тег postgresql"
    url: "https://dba.stackexchange.com/questions/tagged/postgresql"
  - title: "Сообщество: Reddit r/PostgreSQL"
    url: "https://www.reddit.com/r/PostgreSQL/"
  - title: "Хабр: свежие статьи про PostgreSQL"
    url: "https://habr.com/ru/search/?q=postgresql&target_type=posts&order=date"
---

# PostgreSQL: настройка и диагностика

Стартовые параметры памяти для сервера с 16 ГБ RAM и запросы администратора для поиска медленных и зависших запросов. Значения это отправная точка: подберите под свой сервер через PGTune и проверьте нагрузочным тестом.

## Параметры (postgresql.conf)

```ini
shared_buffers = 4GB
effective_cache_size = 12GB
maintenance_work_mem = 1GB
work_mem = 32MB
min_wal_size = 2GB
max_wal_size = 16GB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
```

- `shared_buffers` примерно 25% RAM, `effective_cache_size` подсказка планировщику (примерно 50-75% RAM), память по факту не выделяется.
- `work_mem` выделяется на каждую операцию сортировки или хеширования в каждом запросе. При многих одновременных запросах 32 МБ легко превращаются в гигабайты, поэтому с большим `max_connections` значение уменьшайте.
- `random_page_cost = 1.1` подходит для SSD и NVMe, для дисков HDD оставляйте 4.
- Часть параметров применяется после `SELECT pg_reload_conf();`, а `shared_buffers` и `wal_buffers` только после перезапуска.

## Диагностические запросы

Долгие и активные запросы:

```sql
SELECT pid, usename, pg_blocking_pids(pid) AS blocked_by, query_start,
       age(clock_timestamp(), query_start) AS duration, query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY query_start ASC;
```

Остановка запросов:

```sql
SELECT pg_cancel_backend(<pid>);
SELECT pg_terminate_backend(<pid>);
```

Кандидаты на недостающие индексы (много последовательных чтений):

```sql
SELECT relname, seq_scan, seq_tup_read, idx_scan, idx_tup_fetch
FROM pg_stat_user_tables
WHERE seq_scan > 0
ORDER BY seq_tup_read DESC
LIMIT 10;
```

- В `pg_stat_activity` имя пользователя хранится в колонке `usename`, а слово `user` вернуло бы только текущего пользователя вашей сессии.
- `pg_cancel_backend` отменяет текущий запрос и оставляет соединение, `pg_terminate_backend` закрывает соединение целиком. Сначала пробуйте cancel.
- Большой `seq_scan` на маленькой таблице нормален. Индекс нужен для больших таблиц, где запросы выбирают малую долю строк. Проверяйте план: `EXPLAIN (ANALYZE, BUFFERS) <запрос>;`.
- Для топа самых тяжёлых запросов включите расширение `pg_stat_statements`.
