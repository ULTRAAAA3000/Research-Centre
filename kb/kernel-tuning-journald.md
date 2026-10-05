---
id: "kernel-tuning-journald"
title: "Ядро Linux: защита сети через sysctl и лимиты journald"
category: "linux"
tags: ["sysctl", "kernel", "tcp", "syn-flood", "journald", "logs", "hardening"]
sources:
  - title: "Офиц.: ip-sysctl — параметры сети ядра"
    url: "https://www.kernel.org/doc/html/latest/networking/ip-sysctl.html"
  - title: "Офиц.: journald.conf"
    url: "https://www.freedesktop.org/software/systemd/man/latest/journald.conf.html"
  - title: "Вики: ArchWiki — sysctl"
    url: "https://wiki.archlinux.org/title/Sysctl"
  - title: "Вики: ArchWiki — systemd/Journal"
    url: "https://wiki.archlinux.org/title/Systemd/Journal"
  - title: "Форум: Server Fault — тег sysctl"
    url: "https://serverfault.com/questions/tagged/sysctl"
  - title: "Форум: Unix & Linux SE — тег kernel"
    url: "https://unix.stackexchange.com/questions/tagged/kernel"
  - title: "Хабр: свежие статьи про sysctl и тюнинг сети"
    url: "https://habr.com/ru/search/?q=sysctl&target_type=posts&order=date"
---

# sysctl и журнал systemd

Сетевые параметры ядра для защиты от SYN-флуда и подмены адресов, настройки буферов TCP и ограничения размера системного журнала.

## Параметры ядра (/etc/sysctl.d/10-kernel-hardening.conf)

```ini
# Защита от SYN-флуда
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 8192
net.ipv4.tcp_synack_retries = 2

# TCP Fast Open (меньше задержка)
net.ipv4.tcp_fastopen = 3

# Буферы TCP
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216

# Защита от подмены адреса источника
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Не принимать ICMP-редиректы
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
```

```bash
sudo sysctl --system
sysctl net.ipv4.tcp_syncookies
```

- `rp_filter = 1` (strict) может ломать асимметричную маршрутизацию, несколько uplink'ов и политику маршрутизации (например, WireGuard или VPN с несколькими таблицами). В таких случаях ставьте `2` (loose).
- `tcp_fastopen = 3` включает режим для клиента и сервера, но реально работает только если приложение его использует.
- Максимальные размеры буферов `tcp_rmem` и `tcp_wmem` ограничены `net.core.rmem_max` и `net.core.wmem_max`. Для больших значений задайте и их.
- Файл применяется при загрузке, а `sysctl --system` применяет без перезагрузки.

## Лимиты журнала (/etc/systemd/journald.conf)

```ini
[Journal]
SystemMaxUse=1G
SystemKeepFree=2G
SystemMaxFileSize=100M
MaxRetentionSec=1month
Compress=yes
```

```bash
sudo systemctl restart systemd-journald
journalctl --disk-usage
sudo journalctl --vacuum-size=500M
```

- Чтобы журнал сохранялся между перезагрузками, нужен каталог `/var/log/journal` (или `Storage=persistent`).
- `--vacuum-size` разово удаляет старые записи до указанного размера, `--vacuum-time=2weeks` по времени.
