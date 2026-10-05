---
id: "iptables-nat-firewall-script"
title: "iptables: скрипт файрвола с NAT и пробросом портов"
category: "security"
tags: ["iptables", "nat", "dnat", "masquerade", "firewall", "port-forwarding"]
sources:
  - title: "Офиц.: документация netfilter / iptables"
    url: "https://www.netfilter.org/documentation/"
  - title: "Вики: ArchWiki — iptables"
    url: "https://wiki.archlinux.org/title/Iptables"
  - title: "Вики: ArchWiki — nftables (современная замена)"
    url: "https://wiki.archlinux.org/title/Nftables"
  - title: "Гайд: DigitalOcean — iptables essentials"
    url: "https://www.digitalocean.com/community/tutorials/iptables-essentials-common-firewall-rules-and-commands"
  - title: "Форум: Server Fault — тег iptables"
    url: "https://serverfault.com/questions/tagged/iptables"
  - title: "Форум: Unix & Linux SE — тег iptables"
    url: "https://unix.stackexchange.com/questions/tagged/iptables"
  - title: "Хабр: свежие статьи про iptables"
    url: "https://habr.com/ru/search/?q=iptables&target_type=posts&order=date"
---

# iptables: файрвол с NAT и пробросом портов

Скрипт с политикой «запрещено всё, кроме нужного», DNAT для проброса порта и MASQUERADE для выхода внутренней сети. Скрипт сначала добавляет разрешающие правила и только в конце включает политику DROP, чтобы не потерять доступ к серверу в момент запуска.

## Скрипт правил

```bash
#!/usr/bin/env bash
set -e

# Сброс существующих правил
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X

# Loopback и уже установленные соединения
iptables -A INPUT -i lo -j ACCEPT
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A INPUT -m conntrack --ctstate INVALID -j DROP

# Ping (по желанию)
iptables -A INPUT -p icmp --icmp-type echo-request -m limit --limit 5/s -j ACCEPT

# Разрешённые сервисы
iptables -A INPUT -p tcp --dport 2222 -m conntrack --ctstate NEW -j ACCEPT   # SSH
iptables -A INPUT -p tcp --dport 80 -j ACCEPT                                # HTTP
iptables -A INPUT -p tcp --dport 443 -j ACCEPT                               # HTTPS
iptables -A INPUT -p udp --dport 51820 -j ACCEPT                             # WireGuard

# Проброс: публичный порт 8443 -> внутренний 10.0.0.5:443
iptables -t nat -A PREROUTING -p tcp --dport 8443 -j DNAT --to-destination 10.0.0.5:443
iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A FORWARD -p tcp -d 10.0.0.5 --dport 443 -m conntrack --ctstate NEW -j ACCEPT

# Выход внутренней сети наружу
iptables -t nat -A POSTROUTING -s 10.0.0.0/24 -o eth0 -j MASQUERADE

# Политики по умолчанию включаем В КОНЦЕ
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT
```

- Для форвардинга должен быть включён `net.ipv4.ip_forward=1` (`sysctl net.ipv4.ip_forward`).
- Если вы поставили политику DROP раньше разрешающих правил и скрипт прервался, удалённый доступ будет потерян. Если нет консоли хостера, тестируйте через `iptables-apply` или отложенный откат: `sleep 60 && iptables -P INPUT ACCEPT &`.
- Скрипт не трогает IPv6. Если IPv6 включён, повторите правила через `ip6tables` или отключите IPv6, иначе он останется без защиты.
- `MASQUERADE` ограничен своей подсетью (`-s`), чтобы не маскировать чужой транзитный трафик. Если внешний адрес статичен, `SNAT --to-source` эффективнее.

## Сохранение и проверка

```bash
sudo iptables -L -n -v --line-numbers
sudo iptables -t nat -L -n -v
sudo apt install iptables-persistent && sudo netfilter-persistent save
```

- Без `iptables-persistent` (или `iptables-save > файл` с восстановлением при загрузке) правила пропадут после перезагрузки.
- На новых дистрибутивах `iptables` часто работает поверх nftables (`iptables-nft`). Для новых проектов стоит смотреть в сторону nftables.
