---
id: "redis-sentinel-ha"
title: "Redis: настройка кэша, безопасность и Sentinel"
category: "databases"
tags: ["redis", "sentinel", "cache", "high-availability", "slowlog", "valkey"]
sources:
  - title: "Офиц.: документация Redis"
    url: "https://redis.io/docs/latest/"
  - title: "Офиц.: Redis Sentinel"
    url: "https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/"
  - title: "Офиц.: безопасность Redis"
    url: "https://redis.io/docs/latest/operate/oss_and_stack/management/security/"
  - title: "Открытый форк: Valkey"
    url: "https://valkey.io/"
  - title: "Форум: Stack Overflow — тег redis"
    url: "https://stackoverflow.com/questions/tagged/redis"
  - title: "Сообщество: Reddit r/redis"
    url: "https://www.reddit.com/r/redis/"
  - title: "Хабр: свежие статьи про Redis"
    url: "https://habr.com/ru/search/?q=redis&target_type=posts&order=date"
---

# Redis: кэш и отказоустойчивость

Redis хранит данные в памяти и используется как кэш, хранилище сессий и очередь. Ниже безопасная конфигурация одного узла, диагностика и схема с Sentinel для автоматического переключения при отказе. Открытый форк Valkey совместим по командам.

## Конфиг (/etc/redis/redis.conf)

```ini
bind 127.0.0.1 10.0.0.5
protected-mode yes
port 6379
requirepass "StrongRedisPasswordHere"
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
appendonly yes
```

- `maxmemory-policy allkeys-lru` вытесняет давно не используемые ключи, это подходит для кэша. Если Redis хранит данные, которые нельзя терять (очереди, сессии), используйте `noeviction`, иначе данные удалятся молча.
- `save` делает снимки на диск, `appendonly yes` включает журнал операций и повышает надёжность данных ценой производительности.
- `bind` ограничивает интерфейсы. Не открывайте Redis в интернет: порт 6379 должен быть доступен только из приватной сети.
- `requirepass` это простой пароль. В Redis 6 и новее лучше заводить пользователей через ACL: `ACL SETUSER app on >пароль ~app:* +@read +@write`.

## Диагностика

```bash
export REDISCLI_AUTH="StrongRedisPasswordHere"
redis-cli info memory
redis-cli info replication
redis-cli --latency
redis-cli slowlog get 10
redis-cli monitor
```

- Параметр `-a пароль` оставляет пароль в списке процессов и истории, поэтому пароль передан через переменную `REDISCLI_AUTH`.
- `SLOWLOG GET 10` показывает 10 последних медленных команд, порог задаётся `slowlog-log-slower-than` (микросекунды).
- `MONITOR` показывает все команды и заметно замедляет сервер: используйте только для короткой отладки.

## Реплика и Sentinel

Реплика (redis.conf):

```ini
replicaof 10.0.0.5 6379
masterauth "StrongRedisPasswordHere"
requirepass "StrongRedisPasswordHere"
```

Sentinel (sentinel.conf, на трёх узлах):

```ini
port 26379
sentinel monitor mymaster 10.0.0.5 6379 2
sentinel auth-pass mymaster StrongRedisPasswordHere
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 60000
sentinel parallel-syncs mymaster 1
```

```bash
redis-sentinel /etc/redis/sentinel.conf
redis-cli -p 26379 sentinel get-master-addr-by-name mymaster
```

- Число `2` в `sentinel monitor` это кворум: сколько Sentinel должны согласиться, что мастер недоступен. Нужно минимум три Sentinel на разных серверах.
- Клиенты должны подключаться через Sentinel (запрашивать адрес мастера), а не по фиксированному адресу, иначе после переключения они будут писать в старый мастер.
