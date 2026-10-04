---
id: "iptables-basics"
title: "iptables: базовый файрвол для сервера"
category: "security"
tags: ["iptables", "firewall", "netfilter", "linux"]
sources:
  - title: "Документация проекта netfilter"
    url: "https://www.netfilter.org/documentation/"
  - title: "man iptables"
    url: "https://man7.org/linux/man-pages/man8/iptables.8.html"
---

# iptables: базовый файрвол

Минимальный набор правил: разрешить уже установленные соединения, loopback и SSH, остальное входящее запретить.

## Базовые правила

```bash
sudo iptables -A INPUT -i lo -j ACCEPT
sudo iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo iptables -A INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT
sudo iptables -P INPUT DROP
```

## Просмотр и сохранение

```bash
sudo iptables -L -n -v --line-numbers
sudo iptables -D INPUT 3
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

- Сначала добавьте правило для SSH, и только потом ставьте `-P INPUT DROP`, иначе потеряете доступ к серверу.
- Правила не переживают перезагрузку без `iptables-persistent` или `iptables-save`/`iptables-restore`.
- В новых дистрибутивах бэкендом часто служит nftables.
