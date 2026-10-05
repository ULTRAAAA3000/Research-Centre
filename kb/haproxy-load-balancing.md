---
id: "haproxy-load-balancing"
title: "HAProxy: балансировка нагрузки и отказоустойчивость"
category: "networking"
tags: ["haproxy", "load-balancer", "tls", "healthcheck", "high-availability"]
sources:
  - title: "Офиц.: документация HAProxy"
    url: "https://docs.haproxy.org/"
  - title: "Офиц.: HAProxy Technologies — документация"
    url: "https://www.haproxy.com/documentation/"
  - title: "Блог: HAProxy — технические статьи"
    url: "https://www.haproxy.com/blog"
  - title: "Форум: HAProxy Discourse"
    url: "https://discourse.haproxy.org/"
  - title: "Форум: Server Fault — тег haproxy"
    url: "https://serverfault.com/questions/tagged/haproxy"
  - title: "Инструмент: Mozilla SSL Configuration Generator"
    url: "https://ssl-config.mozilla.org/"
  - title: "Хабр: свежие статьи про HAProxy"
    url: "https://habr.com/ru/search/?q=haproxy&target_type=posts&order=date"
---

# HAProxy: балансировщик

Конфиг HAProxy с терминированием TLS, редиректом на HTTPS, проверкой здоровья серверов, sticky-сессиями через cookie и резервным узлом. Проверка синтаксиса перед применением: `haproxy -c -f /etc/haproxy/haproxy.cfg`, плавный перезапуск: `sudo systemctl reload haproxy`.

## Конфиг (/etc/haproxy/haproxy.cfg)

```ini
global
    log /dev/log local0
    log /dev/log local1 notice
    chroot /var/lib/haproxy
    user haproxy
    group haproxy
    daemon
    maxconn 50000
    ssl-default-bind-ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256
    ssl-default-bind-options no-sslv3 no-tlsv10 no-tlsv11

defaults
    log global
    mode http
    option httplog
    option dontlognull
    timeout connect 5000ms
    timeout client 50000ms
    timeout server 50000ms

frontend http_in
    bind *:80
    bind *:443 ssl crt /etc/haproxy/certs/site.pem alpn h2,http/1.1
    http-request redirect scheme https unless { ssl_fc }
    default_backend web_servers

backend web_servers
    balance roundrobin
    option httpchk GET /healthz
    cookie SERVERID insert indirect nocache
    server node01 192.168.1.10:8080 check cookie node01 maxconn 1000
    server node02 192.168.1.11:8080 check cookie node02 maxconn 1000
    server node03 192.168.1.12:8080 check cookie node03 backup
```

- `site.pem` это сертификат, цепочка и приватный ключ одним файлом: `cat fullchain.pem privkey.pem > site.pem`.
- Строка `ssl-default-bind-ciphers` задаёт шифры для TLS 1.2. Для TLS 1.3 используется отдельный параметр `ssl-default-bind-ciphersuites`, по умолчанию набор уже безопасный.
- `server node03 ... backup` получает трафик только когда все основные узлы недоступны.
- `option httpchk GET /healthz` опрашивает путь `/healthz`: приложение должно отвечать 2xx или 3xx. Настройте частоту через `inter`, `fall`, `rise` в строке `server`.
- Для статистики и мониторинга добавьте `frontend stats` с `stats uri /stats` и защитой паролем, не открывайте её в интернет.
- Cookie для привязки сессии нужна только приложениям с состоянием на сервере. Для stateless-сервисов уберите `cookie` и оставьте `balance roundrobin` или `leastconn`.
