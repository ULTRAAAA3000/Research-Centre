---
id: "kafka-cli-operations"
title: "Apache Kafka: CLI-команды, топики и лаг потребителей"
category: "devops"
tags: ["kafka", "kraft", "zookeeper", "topics", "consumer-group", "streaming"]
sources:
  - title: "Офиц.: документация Apache Kafka"
    url: "https://kafka.apache.org/documentation/"
  - title: "Офиц.: Quickstart"
    url: "https://kafka.apache.org/quickstart"
  - title: "Обучение: Confluent Developer"
    url: "https://developer.confluent.io/"
  - title: "Форум: Stack Overflow — тег apache-kafka"
    url: "https://stackoverflow.com/questions/tagged/apache-kafka"
  - title: "Сообщество: Reddit r/apachekafka"
    url: "https://www.reddit.com/r/apachekafka/"
  - title: "Хабр: свежие статьи про Kafka"
    url: "https://habr.com/ru/search/?q=apache%20kafka&target_type=posts&order=date"
---

# Apache Kafka: команды администратора

Основные команды для работы с топиками и группами потребителей. Скрипты лежат в каталоге `bin/` дистрибутива Apache Kafka (в дистрибутиве Confluent имена без `.sh`). Современные версии работают в режиме KRaft без ZooKeeper, а в Kafka 4.0 ZooKeeper удалён полностью.

## Топики

```bash
kafka-topics.sh --bootstrap-server localhost:9092 --create --topic app-events --partitions 3 --replication-factor 2
kafka-topics.sh --bootstrap-server localhost:9092 --list
kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic app-events
```

- `--replication-factor 2` требует минимум двух живых брокеров, иначе команда завершится ошибкой. Для продакшена обычно 3.
- `--describe` показывает лидера, реплики и ISR каждой партиции. Если ISR меньше числа реплик, часть брокеров отстаёт или недоступна.
- Число партиций можно увеличить, но не уменьшить: от него зависит максимальный параллелизм потребителей группы.

## Отправка и чтение сообщений

```bash
kafka-console-producer.sh --bootstrap-server localhost:9092 --topic app-events
kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic app-events --from-beginning
kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic app-events --group debug-reader --max-messages 10
```

- `--from-beginning` читает топик с самого начала (в пределах срока хранения), без него читаются только новые сообщения.
- Консольный потребитель без `--group` создаёт временную группу. Для отладки задавайте отдельное имя группы, чтобы не влиять на рабочих потребителей.

## Группы потребителей и лаг

```bash
kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list
kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group web-api-group
kafka-consumer-groups.sh --bootstrap-server localhost:9092 --group web-api-group --topic app-events --reset-offsets --to-earliest --dry-run
```

- В выводе `--describe` столбец `LAG` показывает, на сколько сообщений потребитель отстаёт от конца партиции. Постоянно растущий лаг значит, что потребитель не успевает.
- `--reset-offsets` работает только для неактивной группы (остановите потребителей). Сначала запустите с `--dry-run`, и только потом замените его на `--execute`.
- Если потребителей в группе больше, чем партиций, лишние простаивают.
