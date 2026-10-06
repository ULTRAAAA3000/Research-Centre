---
id: "restic-rsync-backups"
title: "Бэкапы: restic (шифрованные снапшоты) и rsync"
category: "linux"
tags: ["backup", "restic", "rsync", "snapshots", "restore", "systemd-timer", "3-2-1"]
sources:
  - title: "Офиц.: документация restic"
    url: "https://restic.readthedocs.io/en/stable/"
  - title: "Офиц.: restic — создание бэкапов"
    url: "https://restic.readthedocs.io/en/stable/040_backup.html"
  - title: "Офиц.: restic — удаление старых снапшотов (forget)"
    url: "https://restic.readthedocs.io/en/stable/060_forget.html"
  - title: "Офиц.: документация rsync"
    url: "https://rsync.samba.org/documentation.html"
  - title: "Офиц.: man rsync"
    url: "https://download.samba.org/pub/rsync/rsync.1"
  - title: "Репозиторий: restic/restic"
    url: "https://github.com/restic/restic"
  - title: "Форум: Restic Forum"
    url: "https://forum.restic.net/"
  - title: "Форум: Stack Overflow — тег restic"
    url: "https://stackoverflow.com/questions/tagged/restic"
  - title: "Форум: Stack Overflow — тег rsync"
    url: "https://stackoverflow.com/questions/tagged/rsync"
  - title: "Хабр: свежие статьи про бэкапы restic"
    url: "https://habr.com/ru/search/?q=restic%20%D0%B1%D1%8D%D0%BA%D0%B0%D0%BF&target_type=posts&order=date"
---

# Бэкапы: restic и rsync

rsync копирует файлы быстро и просто, но хранит одну копию и не шифрует. restic делает шифрованные дедуплицированные снапшоты с историей и умеет писать в SFTP, S3-совместимые хранилища (в том числе MinIO и Backblaze B2) и локальный диск. Правило 3-2-1: три копии данных, на двух разных носителях, одна из них вне площадки.

## Что выбрать

- **restic**: нужна история версий, шифрование и копия в облако или на чужой сервер. Подходит для серверов и баз данных.
- **rsync**: нужно зеркало папки или быстрая передача между своими серверами. Без доработок не хранит версии: удалённый файл исчезнет и из копии.
- Часто используют вместе: rsync для быстрой синхронизации, restic для архива с историей.

## restic: настройка репозитория

```bash
sudo apt install restic
export RESTIC_REPOSITORY=/mnt/backup/restic-repo
export RESTIC_PASSWORD_FILE=/root/.restic-pass
restic init
```

Другие хранилища задаются тем же параметром:

```bash
export RESTIC_REPOSITORY=sftp:backup@backup.example.com:/srv/restic
export RESTIC_REPOSITORY=s3:https://s3.example.com/my-bucket
export AWS_ACCESS_KEY_ID=<KEY>
export AWS_SECRET_ACCESS_KEY=<SECRET>
```

- Пароль репозитория шифрует все данные. **Потеряете пароль, потеряете бэкап**: храните его отдельно (менеджер паролей, второй носитель), а файл с паролем защитите: `chmod 600 /root/.restic-pass`.
- Для S3-хранилищ создайте отдельный ключ только на нужный бакет, не используйте администраторский.

## restic: бэкап, просмотр, восстановление

```bash
restic backup /etc /var/www /home --exclude-file=/etc/restic/excludes.txt --tag daily
restic snapshots
restic stats
restic restore latest --target /tmp/restore --include /etc/nginx
restic mount /mnt/restic
```

- Повторный `backup` читает только изменения, поэтому быстрый и экономит место (дедупликация).
- `restore` с `--include` достаёт только нужное, а `restic mount` (нужен FUSE) показывает все снапшоты как обычные папки, из которых можно скопировать файлы.
- Базы данных не копируйте файлами «на живую»: делайте дамп и отправляйте в restic напрямую:

```bash
pg_dump appdb | restic backup --stdin --stdin-filename appdb.sql --tag db
```

## restic: очистка и проверка

```bash
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --keep-yearly 1 --prune
restic check
restic check --read-data-subset=5%
```

- `forget` с политикой хранения оставляет по 7 дневных, 4 недельных, 6 месячных и 1 годовому снапшоту, `--prune` физически освобождает место.
- `restic check` проверяет структуру репозитория, а `--read-data-subset` ещё и читает часть данных, чтобы найти повреждения. Запускайте регулярно, например, раз в неделю.
- Если процесс оборвался и репозиторий заблокирован: `restic unlock`.

## restic: автозапуск (systemd)

Окружение (/etc/restic/env, права `600`):

```ini
RESTIC_REPOSITORY=sftp:backup@backup.example.com:/srv/restic
RESTIC_PASSWORD_FILE=/root/.restic-pass
```

Сервис (/etc/systemd/system/restic-backup.service):

```ini
[Unit]
Description=Restic backup

[Service]
Type=oneshot
EnvironmentFile=/etc/restic/env
ExecStart=/usr/bin/restic backup /etc /var/www --exclude-file=/etc/restic/excludes.txt --tag daily
ExecStartPost=/usr/bin/restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
```

Таймер (/etc/systemd/system/restic-backup.timer):

```ini
[Unit]
Description=Daily restic backup

[Timer]
OnCalendar=*-*-* 03:00:00
RandomizedDelaySec=15m
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now restic-backup.timer
systemctl list-timers restic-backup.timer
journalctl -u restic-backup.service -n 50
```

## rsync: основные приёмы

```bash
rsync -aAXH --info=progress2 -n /var/www/ backup@backup.example.com:/backups/www/
rsync -aAXH --info=progress2 /var/www/ backup@backup.example.com:/backups/www/
rsync -aAXH --delete -e "ssh -p 2222" --exclude=cache/ /var/www/ backup@backup.example.com:/backups/www/
```

- `-a` сохраняет права, владельцев, время и символьные ссылки, `-A` ACL, `-X` расширенные атрибуты, `-H` жёсткие ссылки.
- Первый запуск делайте с `-n` (`--dry-run`): он только показывает, что будет сделано, ничего не копируя.
- **Слеш в конце источника важен:** `/var/www/` копирует содержимое папки, а `/var/www` создаёт внутри назначения папку `www`.
- `--delete` удаляет в копии то, чего нет в источнике. Если файлы удалены или зашифрованы вирусом, они пропадут и из копии, поэтому для защиты от потерь используйте версии (ниже) или restic.
- `-z` сжимает при передаче (полезно на медленном канале, на быстрой сети только тормозит), `--bwlimit=5000` ограничивает скорость в КБ/с.

## rsync: инкрементные снапшоты на жёстких ссылках

```bash
D=$(date +%F)
rsync -aAXH --delete --link-dest=../latest /var/www/ backup@backup.example.com:/backups/www/$D/
ssh backup@backup.example.com "ln -sfn $D /backups/www/latest"
```

- Каждый день создаётся каталог с датой. Неизменённые файлы не дублируются, а привязываются жёсткими ссылками к прошлой копии (`--link-dest`), поэтому все «полные» копии занимают место почти как одна.
- Старые каталоги можно просто удалять: `rm -rf /backups/www/2026-08-01`.

## Обязательно проверяйте восстановление

- Раз в месяц восстанавливайте случайный файл и проверяйте, что он открывается: бэкап, который не восстанавливали, это не бэкап.
- Следите за результатом: код возврата команд и `journalctl`, а лучше оповещения (например, сервис `OnFailure=` в systemd).
- Держите хотя бы одну копию вне основного сервера и вне сети, из которой её можно удалить.
