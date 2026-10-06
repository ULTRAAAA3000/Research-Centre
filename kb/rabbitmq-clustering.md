---
id: "rabbitmq-clustering"
title: "RabbitMQ: пользователи, кластер и quorum-очереди"
category: "devops"
tags: ["rabbitmq", "amqp", "cluster", "quorum-queues", "message-broker", "rabbitmqctl"]
sources:
  - title: "Офиц.: документация RabbitMQ"
    url: "https://www.rabbitmq.com/docs"
  - title: "Офиц.: Quorum Queues"
    url: "https://www.rabbitmq.com/docs/quorum-queues"
  - title: "Офиц.: кластеризация"
    url: "https://www.rabbitmq.com/docs/clustering"
  - title: "Форум: RabbitMQ GitHub Discussions"
    url: "https://github.com/rabbitmq/rabbitmq-server/discussions"
  - title: "Форум: Stack Overflow — тег rabbitmq"
    url: "https://stackoverflow.com/questions/tagged/rabbitmq"
  - title: "Сообщество: Reddit r/rabbitmq"
    url: "https://www.reddit.com/r/rabbitmq/"
  - title: "Хабр: свежие статьи про RabbitMQ"
    url: "https://habr.com/ru/search/?q=rabbitmq&target_type=posts&order=date"
---

# RabbitMQ

RabbitMQ это брокер сообщений (AMQP). Ниже управление пользователями, объединение узлов в кластер и отказоустойчивые очереди. Важное исправление к старым инструкциям: зеркальные классические очереди (`ha-mode`) устарели и в RabbitMQ 4.0 удалены, для отказоустойчивости используются quorum-очереди.

## Веб-интерфейс и пользователи

```bash
sudo rabbitmq-plugins enable rabbitmq_management
sudo rabbitmqctl add_user admin "<STRONG_PASSWORD>"
sudo rabbitmqctl set_user_tags admin administrator
sudo rabbitmqctl set_permissions -p "/" admin ".*" ".*" ".*"
sudo rabbitmqctl delete_user guest
sudo rabbitmqctl list_users
```

- Веб-интерфейс доступен на порту 15672. Пользователь `guest` по умолчанию работает только с localhost, но его всё равно лучше удалить.
- Три шаблона в `set_permissions` задают права на конфигурирование, запись и чтение ресурсов виртуального хоста `/`.
- Для приложений создавайте отдельных пользователей с минимальными правами и своим виртуальным хостом (`rabbitmqctl add_vhost`).

## Кластер

```bash
# на втором и третьем узле (после установки с одинаковым Erlang cookie)
sudo rabbitmqctl stop_app
sudo rabbitmqctl reset
sudo rabbitmqctl join_cluster rabbit@node1
sudo rabbitmqctl start_app
rabbitmqctl cluster_status
```

- Файл `/var/lib/rabbitmq/.erlang.cookie` должен быть одинаковым на всех узлах, иначе узлы не объединятся.
- Имена хостов (`node1`) должны разрешаться по DNS или `/etc/hosts` на всех узлах.
- Для кворума нужно нечётное число узлов, обычно три.

## Отказоустойчивые очереди (quorum)

Клиент объявляет очередь с аргументом `x-queue-type=quorum`. Проверка:

```bash
rabbitmqctl list_queues name type messages
rabbitmq-queues quorum_status orders
```

Для версий 3.x старая политика зеркалирования (в RabbitMQ 4.0 не работает):

```bash
rabbitmqctl set_policy ha-all "^ha\." '{"ha-mode":"all","ha-sync-mode":"automatic"}'
```

- Quorum-очереди реплицируются по протоколу Raft и надёжнее зеркальных. Они всегда durable и не поддерживают некоторые редкие возможности классических очередей.
- Политика `ha-all` реплицирует очереди на все узлы кластера, что нагружает сеть и диск, а `ha-mode: exactly` с `ha-params` задаёт нужное число копий.
