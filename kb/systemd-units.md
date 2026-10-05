---
id: "systemd-units"
title: "systemd: управление сервисами и юнит-файлы"
category: "linux"
tags: ["systemd", "systemctl", "journalctl", "services"]
sources:
  - title: "systemd.service(5)"
    url: "https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html"
  - title: "journalctl(1)"
    url: "https://www.freedesktop.org/software/systemd/man/latest/journalctl.html"
  - title: "Вики: ArchWiki — systemd"
    url: "https://wiki.archlinux.org/title/Systemd"
  - title: "Гайд: DigitalOcean — systemd essentials"
    url: "https://www.digitalocean.com/community/tutorials/systemd-essentials-working-with-services-units-and-the-journal"
  - title: "Форум: Unix & Linux SE — тег systemd"
    url: "https://unix.stackexchange.com/questions/tagged/systemd"
  - title: "Хабр: свежие статьи про systemd"
    url: "https://habr.com/ru/search/?q=systemd&target_type=posts&order=date"
---

# systemd: сервисы и юниты

Управление службами через `systemctl` и логи через `journalctl`.

## Основные команды

```bash
sudo systemctl enable --now nginx
sudo systemctl restart nginx
systemctl status nginx
systemctl list-units --type=service --state=failed
journalctl -u nginx -f
journalctl -u nginx --since "1 hour ago"
```

## Собственный сервис /etc/systemd/system/myapp.service

```ini
[Unit]
Description=My App
After=network-online.target
Wants=network-online.target

[Service]
User=myapp
ExecStart=/usr/local/bin/myapp --port 8080
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Применение изменений

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now myapp
```

- После любого изменения юнит-файла выполняйте `daemon-reload`.
- Для временных правок используйте `systemctl edit myapp` (создаёт drop-in).
