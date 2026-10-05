---
id: "systemd-advanced-units-timers"
title: "systemd: песочница для сервисов и таймеры вместо cron"
category: "linux"
tags: ["systemd", "unit", "timer", "sandboxing", "cron", "hardening"]
sources:
  - title: "Офиц.: systemd.exec (опции песочницы)"
    url: "https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html"
  - title: "Офиц.: systemd.timer"
    url: "https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html"
  - title: "Вики: ArchWiki — systemd/Timers"
    url: "https://wiki.archlinux.org/title/Systemd/Timers"
  - title: "Гайд: DigitalOcean — systemd essentials"
    url: "https://www.digitalocean.com/community/tutorials/systemd-essentials-working-with-services-units-and-the-journal"
  - title: "Форум: Unix & Linux SE — тег systemd"
    url: "https://unix.stackexchange.com/questions/tagged/systemd"
  - title: "Сообщество: Reddit r/linuxadmin"
    url: "https://www.reddit.com/r/linuxadmin/"
  - title: "Хабр: свежие статьи про systemd"
    url: "https://habr.com/ru/search/?q=systemd&target_type=posts&order=date"
---

# systemd: песочница и таймеры

Продвинутый юнит сервиса с ограничением ресурсов и изоляцией, а также таймер вместо cron. Проверить безопасность юнита можно командой `systemd-analyze security api-worker.service`.

## Юнит сервиса (/etc/systemd/system/api-worker.service)

```ini
[Unit]
Description=API Queue Worker Service
After=network-online.target postgresql.service
Wants=network-online.target
Documentation=https://docs.example.com

[Service]
Type=simple
User=apprunner
Group=apprunner
WorkingDirectory=/opt/api-worker
ExecStart=/opt/api-worker/bin/server
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=5s

# Изоляция и ограничения
ProtectSystem=full
ProtectHome=true
NoNewPrivileges=true
PrivateTmp=true
MemoryMax=2G
CPUQuota=150%

[Install]
WantedBy=multi-user.target
```

- `Type=notify` подходит только если приложение умеет сообщать готовность через `sd_notify`. Иначе systemd будет ждать готовности вечно, поэтому в примере `Type=simple`.
- `ProtectSystem=strict` делает всю файловую систему read-only, кроме путей из `ReadWritePaths=`. Это жёстче, чем `full`.
- `MemoryMax` убивает процесс при превышении лимита, `CPUQuota=150%` разрешает до 1,5 ядра.

## Таймер вместо cron

Сервис (/etc/systemd/system/db-backup.service):

```ini
[Unit]
Description=Daily Database Backup Job

[Service]
Type=oneshot
ExecStart=/usr/local/bin/backup-script.sh
```

Таймер (/etc/systemd/system/db-backup.timer):

```ini
[Unit]
Description=Run DB Backup every day at 3 AM

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now db-backup.timer
systemctl list-timers --all
journalctl -u db-backup.service -n 50
systemd-analyze calendar "*-*-* 03:00:00"
```

- `Persistent=true` запускает пропущенную задачу после включения машины, если время срабатывания прошло.
- Включать нужно именно `.timer`, а не `.service`.
- Выражение календаря проверяет `systemd-analyze calendar`.
