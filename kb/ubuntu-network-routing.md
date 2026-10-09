---
id: "ubuntu-network-routing"
title: "2. Сеть и маршрутизация (ip, route, ping, ss)"
category: "ubuntu_commands"
tags: ["ubuntu", "ifconfig", "ip", "route", "netstat", "ss", "ping", "traceroute", "wifi", "netplan"]
sources:
  - title: "Офиц.: man ip (iproute2)"
    url: "https://man7.org/linux/man-pages/man8/ip.8.html"
  - title: "Офиц.: man ss"
    url: "https://man7.org/linux/man-pages/man8/ss.8.html"
  - title: "Офиц.: Netplan (постоянные настройки сети)"
    url: "https://netplan.readthedocs.io/en/stable/"
  - title: "Офиц.: Ubuntu Server — документация"
    url: "https://documentation.ubuntu.com/server/"
  - title: "Форум: Ask Ubuntu — тег networking"
    url: "https://askubuntu.com/questions/tagged/networking"
  - title: "Форум: Unix & Linux SE — тег iproute2"
    url: "https://unix.stackexchange.com/questions/tagged/iproute2"
  - title: "Форум: Ubuntu Discourse"
    url: "https://discourse.ubuntu.com/"
  - title: "Хабр: свежие статьи про сеть в Linux"
    url: "https://habr.com/ru/search/?q=ip%20route%20linux%20%D1%81%D0%B5%D1%82%D1%8C&target_type=posts&order=date"
---

# Сеть и маршрутизация

Команды `ifconfig`, `route` и `netstat` относятся к пакету net-tools: в современных Ubuntu он не установлен по умолчанию, а сами команды считаются устаревшими. Рядом указаны замены из пакета iproute2 (`ip`, `ss`). Имя интерфейса `eth0` из примеров на новых системах обычно другое (`enp3s0`, `ens33`, `wlp2s0`): смотрите `ip -br link`. Изменения ниже действуют до перезагрузки, постоянные настройки задаются в Netplan (`sudo netplan apply`).

## Интерфейсы и адреса

```bash
ifconfig                                  # все интерфейсы (устар., net-tools)
ip addr                                   # то же, современная команда
ip -br addr                               # кратко: имя, состояние, адреса
sudo ifconfig eth0 up                     # включить интерфейс (устар.)
sudo ifconfig eth0 down                   # выключить интерфейс (устар.)
sudo ip link set eth0 up                  # включить интерфейс
sudo ip link set eth0 down                # выключить интерфейс
sudo ifconfig eth0 <IP> netmask <MASK>    # назначить адрес и маску (устар.)
sudo ip addr add <IP>/<PREFIX> dev eth0   # назначить адрес и маску
sudo dhclient eth0                        # получить адрес по DHCP
sudo ifconfig eth0 promisc                # режим прослушивания вкл. (устар.)
sudo ifconfig eth0 -promisc               # режим прослушивания выкл. (устар.)
sudo ip link set eth0 promisc on          # режим прослушивания вкл.
sudo ip link set eth0 promisc off         # режим прослушивания выкл.
```

- Маска и префикс это одно и то же: `255.255.255.0` равно `/24`, `255.255.0.0` равно `/16`.
- `dhclient` в новых Ubuntu может отсутствовать: DHCP обычно ведут Netplan с NetworkManager или systemd-networkd.
- Режим promiscuous нужен для перехвата чужих пакетов (sniffing), включайте только в своей сети.

## Маршрутизация

```bash
route -n                                  # таблица маршрутов (устар.)
ip route                                  # таблица маршрутов
sudo route add default gw <IP>            # шлюз по умолчанию (устар.)
sudo ip route add default via <IP>        # шлюз по умолчанию
sudo route add -net <NET> netmask <MASK> gw <IP>   # маршрут в сеть (устар.)
sudo ip route add <NET>/<PREFIX> via <IP>          # маршрут в сеть
ip route get 8.8.8.8                      # каким путём пойдёт пакет
```

## Пересылка пакетов (IP forwarding)

```bash
echo 1 | sudo tee /proc/sys/net/ipv4/ip_forward   # включить до перезагрузки
sudo sysctl -w net.ipv4.ip_forward=1              # то же через sysctl
```

- Запись `sudo echo "1" > /proc/sys/net/ipv4/ip_forward` не сработает: перенаправление выполняет ваша оболочка без прав root. Поэтому используется `tee`.
- Чтобы настройка пережила перезагрузку, добавьте `net.ipv4.ip_forward=1` в файл `/etc/sysctl.d/99-forward.conf` и выполните `sudo sysctl --system`.

## Проверка связи, порты, Wi-Fi

```bash
ping -c 4 <host>                          # проверка ICMP, 4 пакета
sudo traceroute -I <host>                 # трассировка ICMP-пакетами
sudo netstat -tupln                       # слушающие порты (устар.)
sudo ss -tulpn                            # слушающие порты, с процессами
nmcli dev wifi list                       # доступные Wi-Fi сети
sudo iwlist wlan0 scan                    # сканирование Wi-Fi (устар.)
```

- `ping` без `-c` работает бесконечно: остановка по Ctrl+C.
- `traceroute` не входит в установку по умолчанию: `sudo apt install traceroute`. Ключ `-I` использует ICMP (обычный режим использует UDP), для него нужны права root.
- `ss -tulpn`: `t` TCP, `u` UDP, `l` слушающие, `p` процессы, `n` числовые адреса и порты. Имена процессов видны только с `sudo`.
- В `iwlist` подставьте имя вашего Wi-Fi интерфейса (`ip -br link`). Современный вариант с NetworkManager: `nmcli`.
