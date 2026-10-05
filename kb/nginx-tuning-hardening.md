---
id: "nginx-tuning-hardening"
title: "Nginx: тюнинг производительности и защита обратного прокси"
category: "networking"
tags: ["nginx", "reverse-proxy", "tls", "rate-limit", "websocket", "hardening"]
sources:
  - title: "Офиц.: документация nginx"
    url: "https://nginx.org/en/docs/"
  - title: "Офиц.: ngx_http_limit_req_module"
    url: "https://nginx.org/en/docs/http/ngx_http_limit_req_module.html"
  - title: "Инструмент: Mozilla SSL Configuration Generator"
    url: "https://ssl-config.mozilla.org/"
  - title: "Вики: ArchWiki — nginx"
    url: "https://wiki.archlinux.org/title/Nginx"
  - title: "Форум: Server Fault — тег nginx"
    url: "https://serverfault.com/questions/tagged/nginx"
  - title: "Сообщество: Reddit r/nginx"
    url: "https://www.reddit.com/r/nginx/"
  - title: "Хабр: свежие статьи про nginx"
    url: "https://habr.com/ru/search/?q=nginx&target_type=posts&order=date"
---

# Nginx: тюнинг и защита

Основной конфиг для высокой нагрузки и защищённый обратный прокси с редиректом на HTTPS, WebSocket, лимитами запросов и заголовками безопасности. После любых правок проверяйте конфиг: `sudo nginx -t && sudo systemctl reload nginx`.

## Основной конфиг (/etc/nginx/nginx.conf)

```nginx
user www-data;
worker_processes auto;
worker_rlimit_nofile 65535;
pid /run/nginx.pid;

events {
    worker_connections 8192;
    multi_accept on;
    use epoll;
}

http {
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    server_tokens off;

    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_conn_zone $binary_remote_addr zone=addr_limit:10m;

    gzip on;
    gzip_comp_level 5;
    gzip_min_length 256;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
```

- `worker_rlimit_nofile` должен быть не меньше `worker_connections`, с запасом для проксируемых соединений (каждое клиентское соединение через прокси занимает два дескриптора).
- `server_tokens off` скрывает версию nginx в заголовках и страницах ошибок.

## Защищённый обратный прокси (/etc/nginx/sites-available/production.conf)

```nginx
server {
    listen 80;
    server_name example.com www.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name example.com www.example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        limit_req zone=api_limit burst=20 nodelay;
        limit_conn addr_limit 20;

        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

- Начиная с nginx 1.25.1 параметр `http2` в `listen` устарел, используйте отдельную директиву `http2 on;`.
- Заголовок `X-XSS-Protection` убран: он устарел и современными браузерами игнорируется. Вместо него используйте Content-Security-Policy.
- Для актуального набора шифров берите настройки из Mozilla SSL Configuration Generator, а не фиксируйте `HIGH:!aNULL:!MD5`.
- `Strict-Transport-Security` включайте, только когда HTTPS стабильно работает на всех поддоменах из `includeSubDomains`.
- Если обычные запросы и WebSocket идут через один `location`, надёжнее задавать `Connection` через `map $http_upgrade $connection_upgrade`.
