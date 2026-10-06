---
id: "mongodb-replica-backup"
title: "MongoDB: replica set, шардирование и бэкапы"
category: "databases"
tags: ["mongodb", "replica-set", "sharding", "mongodump", "mongorestore", "backup"]
sources:
  - title: "Офиц.: репликация MongoDB"
    url: "https://www.mongodb.com/docs/manual/replication/"
  - title: "Офиц.: шардирование MongoDB"
    url: "https://www.mongodb.com/docs/manual/sharding/"
  - title: "Офиц.: mongodump"
    url: "https://www.mongodb.com/docs/database-tools/mongodump/"
  - title: "Форум: MongoDB Community Forums"
    url: "https://www.mongodb.com/community/forums/"
  - title: "Форум: DBA Stack Exchange — тег mongodb"
    url: "https://dba.stackexchange.com/questions/tagged/mongodb"
  - title: "Форум: Stack Overflow — тег mongodb"
    url: "https://stackoverflow.com/questions/tagged/mongodb"
  - title: "Хабр: свежие статьи про MongoDB"
    url: "https://habr.com/ru/search/?q=mongodb&target_type=posts&order=date"
---

# MongoDB: реплики и резервные копии

Replica set из трёх узлов даёт отказоустойчивость: при падении основного узла (primary) другой автоматически становится новым. Перед инициализацией на каждом узле в `mongod.conf` должно быть `replication: replSetName: rs0`, а при включённой авторизации ещё общий `keyFile` для связи узлов.

## Инициализация replica set (mongosh)

```javascript
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "10.0.0.1:27017", priority: 2 },
    { _id: 1, host: "10.0.0.2:27017", priority: 1 },
    { _id: 2, host: "10.0.0.3:27017", priority: 0 }
  ]
});
rs.status();
rs.conf();
```

- `priority` задаёт желание стать primary: у узла с наибольшим значением шансов больше. `priority: 0` значит, что узел никогда не станет primary, но хранит копию данных и участвует в голосовании.
- Это не арбитр. Арбитр (не хранит данные, только голосует) задаётся полем `arbiterOnly: true`. Арбитры применяют редко: лучше полноценный третий узел.
- Нечётное число голосующих узлов (3 или 5) нужно, чтобы выборы primary были возможны при потере узла.

## Шардирование (кратко)

```javascript
sh.enableSharding("appdb");
sh.shardCollection("appdb.events", { user_id: "hashed" });
sh.status();
```

- Шардированный кластер требует конфигурационных серверов, процессов `mongos` и нескольких шардов (каждый тоже replica set). Не переходите на шардирование, пока одного replica set достаточно.
- Выбор ключа шардирования решает всё: хеш по `user_id` равномерно распределяет запись, но хуже для диапазонных запросов.

## Бэкап и восстановление

```bash
mongodump --uri="mongodb://admin@127.0.0.1:27017/appdb?authSource=admin" --gzip --archive=/backups/mongo_backup.gz
mongorestore --uri="mongodb://admin@127.0.0.1:27017/" --gzip --archive=/backups/mongo_backup.gz
mongorestore --uri="mongodb://admin@127.0.0.1:27017/" --gzip --archive=/backups/mongo_backup.gz --drop
```

- Пароль в URI виден в списке процессов и истории. Не указывайте его в команде: `mongodump` спросит пароль (опция `--password` без значения) или используйте конфигурационный файл.
- `--drop` удаляет существующие коллекции перед восстановлением, без него документы с совпадающими `_id` пропускаются.
- Для согласованной копии всего replica set в момент времени добавьте `--oplog` (не сочетается с `--db`).
- Проверяйте бэкап восстановлением на тестовом сервере: копия, которую ни разу не восстанавливали, это не бэкап. Для больших баз быстрее снимки файловой системы или Percona Backup for MongoDB.
