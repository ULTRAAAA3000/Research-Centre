---
id: "varnish-cache-vcl"
title: "Varnish Cache: правила VCL, кэш статики и безопасный PURGE"
category: "networking"
tags: ["varnish", "vcl", "cache", "http", "purge", "cdn"]
sources:
  - title: "Офиц.: документация Varnish Cache"
    url: "https://varnish-cache.org/docs/trunk/"
  - title: "Офиц.: Users Guide"
    url: "https://varnish-cache.org/docs/trunk/users-guide/index.html"
  - title: "Обучение: Varnish Software Developers"
    url: "https://www.varnish-software.com/developers/"
  - title: "Форум: Server Fault — тег varnish"
    url: "https://serverfault.com/questions/tagged/varnish"
  - title: "Форум: Stack Overflow — тег varnish"
    url: "https://stackoverflow.com/questions/tagged/varnish"
  - title: "Хабр: свежие статьи про Varnish"
    url: "https://habr.com/ru/search/?q=varnish%20cache&target_type=posts&order=date"
---

# Varnish Cache и VCL

Varnish это HTTP-ускоритель: кэширует ответы бэкенда в памяти и отдаёт их без обращения к приложению. Поведение задаётся на языке VCL. Varnish не терминирует TLS: поставьте перед ним nginx, HAProxy или Hitch.

## Конфиг (/etc/varnish/default.vcl)

```vcl
vcl 4.1;

backend default {
    .host = "127.0.0.1";
    .port = "8080";
}

acl purge_acl {
    "127.0.0.1";
    "10.0.0.0"/24;
}

sub vcl_recv {
    # Очистка кэша только для доверенных адресов
    if (req.method == "PURGE") {
        if (!client.ip ~ purge_acl) {
            return (synth(405, "Not allowed"));
        }
        return (purge);
    }

    # Статика: куки не нужны, чтобы запрос можно было кэшировать
    if (req.url ~ "(?i)\.(png|gif|jpe?g|svg|css|js|woff2?)(\?.*)?$") {
        unset req.http.cookie;
    }
}

sub vcl_backend_response {
    # TTL для статики; Set-Cookie блокирует кэширование, поэтому убираем
    if (bereq.url ~ "(?i)\.(png|gif|jpe?g|svg|css|js|woff2?)(\?.*)?$") {
        unset beresp.http.set-cookie;
        set beresp.ttl = 1h;
    }
}
```

```bash
varnishd -C -f /etc/varnish/default.vcl > /dev/null && echo "VCL OK"
sudo systemctl reload varnish
curl -X PURGE http://127.0.0.1:6081/path/to/file.css
varnishstat -1 -f MAIN.cache_hit -f MAIN.cache_miss
varnishlog -g request -q 'ReqURL ~ "css"'
```

- Без `acl` метод `PURGE` в исходном примере был бы доступен любому клиенту из интернета: так любой мог бы сбросить ваш кэш. Всегда проверяйте адрес клиента.
- Если Varnish стоит за прокси, в `client.ip` будет адрес прокси. Тогда проверяйте заголовок `X-Forwarded-For` или настройте PROXY-протокол.
- Ответ с заголовком `Set-Cookie` по умолчанию не кэшируется, поэтому для статики его нужно убрать в `vcl_backend_response`.
- Запросы с cookie тоже по умолчанию не кэшируются. Если cookie убирается только для статики, динамические страницы остаются безопасными.
- Проверка попадания: заголовок `Age` в ответе и счётчики `cache_hit` и `cache_miss` в `varnishstat`.
- Перед перезагрузкой проверяйте компиляцию VCL (`varnishd -C`): ошибка в файле не даст применить конфиг.
