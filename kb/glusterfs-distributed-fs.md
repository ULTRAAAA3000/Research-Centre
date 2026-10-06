---
id: "glusterfs-distributed-fs"
title: "GlusterFS: реплицируемый том, монтирование и риски"
category: "linux"
tags: ["glusterfs", "gluster", "replica", "arbiter", "split-brain", "storage"]
sources:
  - title: "Офиц.: документация Gluster"
    url: "https://docs.gluster.org/en/latest/"
  - title: "Офиц.: создание томов"
    url: "https://docs.gluster.org/en/latest/Administrator-Guide/Setting-Up-Volumes/"
  - title: "Репозиторий: gluster/glusterfs"
    url: "https://github.com/gluster/glusterfs"
  - title: "Форум: статус проекта после снятия RHGS (GitHub issue)"
    url: "https://github.com/gluster/glusterfs/issues/4298"
  - title: "Статья: реплицируемый том и защита от split-brain"
    url: "https://oneuptime.com/blog/post/2026-03-04-glusterfs-replicated-volume-high-availability-rhel-9/markdown"
  - title: "Форум: Server Fault — тег glusterfs"
    url: "https://serverfault.com/questions/tagged/glusterfs"
  - title: "Хабр: свежие статьи про GlusterFS"
    url: "https://habr.com/ru/search/?q=glusterfs&target_type=posts&order=date"
---

# GlusterFS

GlusterFS объединяет диски нескольких серверов в одну сетевую файловую систему. Статус проекта: Red Hat Gluster Storage снят с поддержки 31 декабря 2024 года. Открытый проект продолжает жить, но развивается медленнее. Для новых систем сравните с альтернативами (Ceph, NFS с репликацией на уровне хранилища). Для существующих кластеров критично правильно выбрать тип тома.

## Главная ошибка: replica 2

Исходный пример создавал том `replica 2` на двух узлах с флагом `force`. Такая схема подвержена split-brain (расхождению копий без возможности определить, какая верна), поэтому создание новых `replica 2` томов считается устаревшим. Используйте три узла:

```bash
gluster volume create gv_data replica 3 \
  192.168.1.11:/data/brick1/gv_data \
  192.168.1.12:/data/brick1/gv_data \
  192.168.1.13:/data/brick1/gv_data
```

Или схему с арбитром: две полные копии и третий узел только для кворума (меньше места):

```bash
gluster volume create gv_data replica 3 arbiter 1 \
  192.168.1.11:/data/brick1/gv_data \
  192.168.1.12:/data/brick1/gv_data \
  192.168.1.13:/data/brick1/gv_data
```

- `/data/brick1` должен быть отдельным диском с XFS, примонтированным в этот путь, а сам brick лежит в подкаталоге (`gv_data`). Флаг `force` нужен только если brick на корневом разделе, а так делать не стоит.

## Объединение узлов и запуск

```bash
gluster peer probe 192.168.1.12
gluster peer probe 192.168.1.13
gluster peer status
gluster volume start gv_data
gluster volume info gv_data
gluster volume status gv_data
```

- Команду `peer probe` выполняют на одном узле, остальные добавляются в пул.
- Между узлами должны быть открыты порты 24007 и 24008, а также диапазон портов bricks (с 49152).

## Монтирование на клиенте

```bash
sudo mkdir -p /mnt/shared
sudo mount -t glusterfs 192.168.1.11:/gv_data /mnt/shared
```

Постоянное монтирование (/etc/fstab):

```text
192.168.1.11:/gv_data /mnt/shared glusterfs defaults,_netdev,backup-volfile-servers=192.168.1.12:192.168.1.13 0 0
```

- Адрес в команде `mount` нужен только для получения схемы тома. `backup-volfile-servers` задаёт запасные адреса, если первый узел недоступен при монтировании.
- `_netdev` откладывает монтирование до появления сети.

## Здоровье тома

```bash
gluster volume heal gv_data info
gluster volume heal gv_data info split-brain
```

- Пустой список в `heal info` значит, что копии синхронизированы. Рост очереди после сбоя узла нормален, он сам сократится при восстановлении.
- Записи в `split-brain` требуют ручного разбора по документации Gluster.
