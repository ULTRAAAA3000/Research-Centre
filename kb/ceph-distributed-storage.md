---
id: "ceph-distributed-storage"
title: "Ceph: проверка кластера, OSD, PG и RBD-тома"
category: "linux"
tags: ["ceph", "osd", "rbd", "storage", "placement-groups", "cephadm"]
sources:
  - title: "Офиц.: документация Ceph"
    url: "https://docs.ceph.com/en/latest/"
  - title: "Офиц.: RBD — блочные устройства"
    url: "https://docs.ceph.com/en/latest/rbd/"
  - title: "Офиц.: Placement Groups"
    url: "https://docs.ceph.com/en/latest/rados/operations/placement-groups/"
  - title: "Сообщество: Ceph Community"
    url: "https://ceph.io/en/community/"
  - title: "Сообщество: Reddit r/ceph"
    url: "https://www.reddit.com/r/ceph/"
  - title: "Форум: Stack Overflow — тег ceph"
    url: "https://stackoverflow.com/questions/tagged/ceph"
  - title: "Хабр: свежие статьи про Ceph"
    url: "https://habr.com/ru/search/?q=ceph&target_type=posts&order=date"
---

# Ceph

Ceph это распределённое хранилище: объекты, блочные тома (RBD) и файловая система поверх кластера обычных серверов. Данные делятся на объекты, объекты группируются в placement groups (PG) и размещаются на OSD (демонах хранения, обычно один на диск). Команды ниже выполняются на узле с доступом к кластеру (например, в `cephadm shell`).

## Состояние кластера

```bash
ceph status
ceph health detail
ceph osd tree
ceph osd df
ceph df
ceph pg stat
```

- `ceph -s` (то же, что `status`) показывает общее здоровье: `HEALTH_OK`, `HEALTH_WARN` или `HEALTH_ERR`. Причину всегда смотрите через `ceph health detail`.
- `ceph osd tree` показывает иерархию (узлы, диски) и состояние `up/down`, `in/out`.
- `ceph osd df` показывает заполнение каждого OSD. Если один OSD заполнен сильнее остальных, при достижении порога заполнения кластер перейдёт в режим только чтения.
- `ceph pg stat` показывает PG по состояниям. Нормально: все `active+clean`. Состояния `degraded`, `undersized`, `peering` значат, что данные копируются или недоступны.

## RBD-том

```bash
ceph osd pool create pool-data
rbd pool init pool-data
rbd create pool-data/vol-disk01 --size 100G
rbd ls pool-data
rbd info pool-data/vol-disk01
```

- Перед созданием образов пул нужно инициализировать командой `rbd pool init`.
- Размер без суффикса задаётся в мегабайтах: `--size 102400` это 100 ГиБ, суффикс `G` яснее и безопаснее.
- Подключение тома на клиенте: `sudo rbd map pool-data/vol-disk01`, затем `sudo mkfs.ext4 /dev/rbd0` и `mount`. Клиенту нужны пакет `ceph-common`, конфиг и ключ доступа.

## Обслуживание

```bash
ceph osd set noout
ceph osd unset noout
ceph osd pool autoscale-status
```

- `noout` не даёт кластеру начать перебалансировку, пока вы временно останавливаете узел на обслуживание. После работ обязательно выполните `unset`.
- Автоподбор числа PG (`autoscale-status`) включён в современных версиях. Не задавайте число PG вручную без необходимости.
- Не выключайте несколько узлов одновременно: при падении числа живых реплик ниже `min_size` пул перестаёт принимать запись.
- Размер пула по умолчанию 3 реплики. Для production планируйте минимум три узла хранения.
