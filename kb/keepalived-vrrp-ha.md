---
id: "keepalived-vrrp-ha"
title: "Keepalived и VRRP: плавающий IP для отказоустойчивости"
category: "networking"
tags: ["keepalived", "vrrp", "high-availability", "haproxy", "virtual-ip", "failover"]
sources:
  - title: "Офиц.: документация Keepalived"
    url: "https://keepalived.readthedocs.io/en/latest/"
  - title: "Офиц.: man keepalived.conf"
    url: "https://www.keepalived.org/manpage.html"
  - title: "Репозиторий: acassen/keepalived"
    url: "https://github.com/acassen/keepalived"
  - title: "Форум: Server Fault — тег keepalived"
    url: "https://serverfault.com/questions/tagged/keepalived"
  - title: "Форум: Unix & Linux SE — тег keepalived"
    url: "https://unix.stackexchange.com/questions/tagged/keepalived"
  - title: "Хабр: свежие статьи про Keepalived"
    url: "https://habr.com/ru/search/?q=keepalived&target_type=posts&order=date"
---

# Keepalived и VRRP

Keepalived держит общий виртуальный IP (VIP) на двух и более узлах: клиенты подключаются к VIP, а при отказе основного узла адрес автоматически переезжает на резервный. Часто используется в паре с HAProxy.

## Основной узел (/etc/keepalived/keepalived.conf)

```ini
vrrp_script check_haproxy {
    script "killall -0 haproxy"
    interval 2
    weight 2
}

vrrp_instance VI_1 {
    state MASTER
    interface eth0
    virtual_router_id 51
    priority 101
    advert_int 1

    authentication {
        auth_type PASS
        auth_pass Vrrp1234
    }

    virtual_ipaddress {
        192.168.1.100/24
    }

    track_script {
        check_haproxy
    }
}
```

## Резервный узел

Тот же файл, но с `state BACKUP` и меньшим приоритетом:

```ini
vrrp_instance VI_1 {
    state BACKUP
    interface eth0
    virtual_router_id 51
    priority 100
    advert_int 1

    authentication {
        auth_type PASS
        auth_pass Vrrp1234
    }

    virtual_ipaddress {
        192.168.1.100/24
    }

    track_script {
        check_haproxy
    }
}
```

## Запуск и проверка

```bash
sudo apt install keepalived psmisc
echo 'net.ipv4.ip_nonlocal_bind = 1' | sudo tee /etc/sysctl.d/99-nonlocal-bind.conf && sudo sysctl --system
sudo systemctl enable --now keepalived
ip -br addr show eth0
journalctl -u keepalived -f
```

- `auth_pass` в VRRP v2 использует только первые 8 символов, поэтому пароль длиннее 8 символов обрежется. Аутентификацию паролем считают слабой защитой: изолируйте сегмент сети с VRRP.
- `virtual_router_id` (1-255) должен совпадать на узлах группы и быть уникальным в этом сегменте сети, иначе будет конфликт с чужим VRRP.
- `weight 2` прибавляет 2 к приоритету, пока скрипт успешен. Основной узел с 101+2 выше резервного 100+2. Если HAProxy на основном упал, он падает до 101 и проигрывает резервному (102), VIP переезжает.
- `killall -0 haproxy` не убивает процесс, а проверяет, что он существует (пакет `psmisc`). Альтернатива: `pidof haproxy`.
- На резервном узле HAProxy должен уметь слушать VIP, которого у узла сейчас нет: включите `net.ipv4.ip_nonlocal_bind=1` или привяжите HAProxy к `*:80`.
- Проверка переезда: остановите HAProxy на основном (`sudo systemctl stop haproxy`) и посмотрите `ip addr` на резервном.
