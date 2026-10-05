---
id: "wireguard-vpn"
title: "WireGuard VPN: сервер, несколько клиентов, MTU"
category: "networking"
tags: ["wireguard", "vpn", "wg-quick", "tunnel", "mtu"]
sources:
  - title: "Офиц.: WireGuard Quick Start"
    url: "https://www.wireguard.com/quickstart/"
  - title: "Вики: ArchWiki — WireGuard"
    url: "https://wiki.archlinux.org/title/WireGuard"
  - title: "Репозиторий: pirate/wireguard-docs (подробный разбор опций)"
    url: "https://github.com/pirate/wireguard-docs"
  - title: "Форум: Server Fault — вопросы по WireGuard"
    url: "https://serverfault.com/questions/tagged/wireguard"
  - title: "Сообщество: Reddit r/WireGuard"
    url: "https://www.reddit.com/r/WireGuard/"
  - title: "Хабр: свежие статьи про WireGuard"
    url: "https://habr.com/ru/search/?q=wireguard&target_type=posts&order=date"
---

# WireGuard VPN

Настройка сервера WireGuard с несколькими пирами (телефон, ноутбук), IPv4 и IPv6, NAT и подбором MTU. Генерация ключей: `wg genkey | tee server.key | wg pubkey > server.pub`, для пира тоже самое плюс по желанию `wg genpsk`.

## Параметры ядра (/etc/sysctl.d/99-wireguard.conf)

```ini
net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1
net.core.rmem_max = 26214400
net.core.wmem_max = 26214400
```

```bash
sudo sysctl --system
```

## Конфиг сервера (/etc/wireguard/wg0.conf)

```ini
[Interface]
Address = 10.10.0.1/24, fd42:42:42::1/64
ListenPort = 51820
PrivateKey = <SERVER_PRIVATE_KEY>
MTU = 1420
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE; ip6tables -A FORWARD -i wg0 -j ACCEPT; ip6tables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE; ip6tables -D FORWARD -i wg0 -j ACCEPT; ip6tables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# Клиент 1 (телефон)
[Peer]
PublicKey = <CLIENT1_PUBLIC_KEY>
PresharedKey = <OPTIONAL_PSK>
AllowedIPs = 10.10.0.2/32, fd42:42:42::2/128

# Клиент 2 (ноутбук)
[Peer]
PublicKey = <CLIENT2_PUBLIC_KEY>
AllowedIPs = 10.10.0.3/32, fd42:42:42::3/128
```

- `eth0` в PostUp/PostDown замените на реальный внешний интерфейс (`ip route get 1.1.1.1`, поле `dev`).
- PresharedKey добавляет симметричный слой защиты поверх обмена ключами. Если используете, укажите тот же ключ и у клиента.

## Конфиг клиента (wg0-client.conf)

```ini
[Interface]
PrivateKey = <CLIENT_PRIVATE_KEY>
Address = 10.10.0.2/24
DNS = 1.1.1.1, 1.0.0.1

[Peer]
PublicKey = <SERVER_PUBLIC_KEY>
Endpoint = YOUR_SERVER_IP:51820
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
```

- `AllowedIPs = 0.0.0.0/0, ::/0` пускает весь трафик через туннель (full tunnel). Для доступа только к внутренней сети укажите `10.10.0.0/24`.
- `PersistentKeepalive = 25` держит NAT-соединение живым, если клиент за NAT или CGNAT.

## Запуск, мониторинг, диагностика

```bash
sudo systemctl enable --now wg-quick@wg0
sudo wg show
sudo wg show wg0 transfer
sudo systemctl restart wg-quick@wg0
```

- Нет рукопожатия (`latest handshake` пуст): проверьте, что UDP-порт 51820 открыт в файрволе и у хостера, ключи не перепутаны, `Endpoint` верный.
- Сайты открываются через раз: уменьшите MTU (например, до 1380) на клиенте.
