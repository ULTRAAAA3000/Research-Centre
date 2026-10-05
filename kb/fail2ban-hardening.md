---
id: "fail2ban-hardening"
title: "Fail2ban: защита SSH и nginx от перебора и флуда"
category: "security"
tags: ["fail2ban", "ssh", "nginx", "brute-force", "ban", "iptables"]
sources:
  - title: "Репозиторий: fail2ban/fail2ban"
    url: "https://github.com/fail2ban/fail2ban"
  - title: "Офиц.: документация Fail2ban"
    url: "https://fail2ban.readthedocs.io/en/latest/"
  - title: "Вики: ArchWiki — Fail2ban"
    url: "https://wiki.archlinux.org/title/Fail2ban"
  - title: "Гайд: DigitalOcean — защита SSH с Fail2ban"
    url: "https://www.digitalocean.com/community/tutorials/how-to-protect-ssh-with-fail2ban-on-ubuntu-22-04"
  - title: "Форум: Server Fault — тег fail2ban"
    url: "https://serverfault.com/questions/tagged/fail2ban"
  - title: "Форум: Unix & Linux SE — тег fail2ban"
    url: "https://unix.stackexchange.com/questions/tagged/fail2ban"
  - title: "Хабр: свежие статьи про Fail2ban"
    url: "https://habr.com/ru/search/?q=fail2ban&target_type=posts&order=date"
---

# Fail2ban

Конфигурация Fail2ban для защиты SSH на нестандартном порту и nginx от флуда (по лимитам `limit_req`). Свои настройки пишите в `jail.local` и `*.local`, а не в `jail.conf`: файлы `.conf` перезаписываются при обновлении пакета.

## Джейлы (/etc/fail2ban/jail.local)

```ini
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
banaction = iptables-multiport
backend = systemd

[sshd]
enabled = true
port    = 2222
maxretry = 3
bantime  = 24h

[nginx-req-limit]
enabled  = true
filter   = nginx-limit-req
backend  = auto
port     = http,https
logpath  = /var/log/nginx/error.log
findtime = 1m
maxretry = 10
bantime  = 2h
```

- Для `sshd` с `backend = systemd` логи читаются из журнала, `logpath` не нужен.
- Для nginx джейл читает файл, поэтому ему задан `backend = auto`. С `systemd` из `[DEFAULT]` файловый `logpath` работать не будет.
- На системах с nftables замените `banaction` на `nftables-multiport`.
- Порт в `[sshd]` должен совпадать с `Port` в sshd_config.

## Фильтр для лимитов nginx (/etc/fail2ban/filter.d/nginx-limit-req.local)

```ini
[Definition]
failregex = ^\s*\[error\] \d+#\d+: \*\d+ limiting requests, excess: [\d\.]+ by zone ".*", client: <HOST>
ignoreregex =
```

- Фильтр `nginx-limit-req` уже есть в составе Fail2ban. Если он у вас есть, отдельный файл не нужен: достаточно джейла. Свою версию кладите в `.local`, чтобы не терять при обновлении.
- Проверка фильтра на реальном логе: `fail2ban-regex /var/log/nginx/error.log /etc/fail2ban/filter.d/nginx-limit-req.local`.

## Управление

```bash
sudo systemctl enable --now fail2ban
sudo fail2ban-client status
sudo fail2ban-client status sshd
sudo fail2ban-client set sshd unbanip 192.168.1.50
sudo fail2ban-client reload
```

- Добавьте свой IP в `ignoreip` в `[DEFAULT]`, чтобы случайно не забанить себя.
- Бан по `limit_req` срабатывает, когда nginx пишет `limiting requests` в `error.log`. Убедитесь, что `limit_req_log_level` и `error_log` пишут нужные строки.
