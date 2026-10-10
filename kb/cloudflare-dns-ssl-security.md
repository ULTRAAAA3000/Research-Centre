---
id: "cloudflare-dns-ssl-security"
title: "3. DNS, SSL и безопасность в Cloudflare"
category: "cloudflare_guides"
tags: ["cloudflare", "dns", "ssl", "tls", "https", "waf", "cdn", "proxy", "безопасность"]
sources:
  - title: "Офиц.: документация Cloudflare DNS"
    url: "https://developers.cloudflare.com/dns/"
  - title: "Офиц.: статус прокси (оранжевое и серое облако)"
    url: "https://developers.cloudflare.com/dns/proxy-status/"
  - title: "Офиц.: режимы шифрования SSL/TLS"
    url: "https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/"
  - title: "Офиц.: Always Use HTTPS"
    url: "https://developers.cloudflare.com/ssl/edge-certificates/additional-options/always-use-https/"
  - title: "Офиц.: Cloudflare WAF"
    url: "https://developers.cloudflare.com/waf/"
  - title: "Офиц.: IP-адреса Cloudflare"
    url: "https://www.cloudflare.com/ips/"
  - title: "Форум: Cloudflare Community"
    url: "https://community.cloudflare.com/"
  - title: "Форум: Server Fault — тег cloudflare"
    url: "https://serverfault.com/questions/tagged/cloudflare"
  - title: "Хабр: свежие статьи про Cloudflare"
    url: "https://habr.com/ru/search/?q=cloudflare%20dns%20ssl&target_type=posts&order=date"
---

# DNS, SSL и безопасность в Cloudflare

Cloudflare работает как посредник между посетителями и вашим сервером: управляет DNS домена, раздаёт кэш (CDN), шифрует трафик и фильтрует атаки. Названия пунктов дашборда со временем немного меняются, смысл шагов остаётся тем же.

## 1. Подключение домена и DNS

1. В дашборде нажмите **Add a site**, введите домен и выберите тариф (подойдёт бесплатный).
2. Cloudflare просканирует существующие записи: проверьте, что ничего не потерялось (особенно MX и TXT для почты).
3. В панели регистратора домена замените серверы имён (NS) на выданные Cloudflare. Когда делегирование подтвердится, домен станет активным.

```bash
dig +short NS example.com      # должны быть серверы Cloudflare (*.ns.cloudflare.com)
dig +short A example.com       # адрес сайта
dig +short TXT example.com    # SPF, DKIM, проверочные записи
```

- Основные записи: A (IPv4), AAAA (IPv6), CNAME (псевдоним), MX (почта), TXT (текстовые данные).
- Включите DNSSEC (раздел DNS, затем Settings): Cloudflare выдаст запись DS, которую нужно добавить у регистратора.

## 2. Проксирование: оранжевое облако

У записей A, AAAA и CNAME есть переключатель статуса:

- **Proxied (оранжевое облако).** Трафик идёт через Cloudflare: работают CDN и кэш, защита от DDoS и фильтрация WAF, реальный IP сервера скрыт.
- **DNS only (серое облако).** Cloudflare только отвечает на DNS-запросы и отдаёт настоящий адрес сервера, защиты нет.

```bash
curl -sI https://example.com | grep -iE "^(server|cf-ray|cf-cache-status)"
```

- В ответе `server: cloudflare` и заголовок `cf-ray` показывают, что трафик идёт через прокси. `cf-cache-status: HIT` значит, что ответ отдан из кэша.
- Проксируется только веб-трафик (HTTP и HTTPS на поддерживаемых портах, например 80 и 443). Почта (MX), SSH и другие сервисы не проксируются: поддомены вроде `mail` и `ssh` оставляйте серыми.
- Кэш по умолчанию работает для статики (изображения, CSS, JS). Страницы HTML кэшируются только по специальным правилам (Cache Rules).

## 3. SSL/TLS: режим Full (strict)

Режим шифрования определяет, как Cloudflare подключается к вашему серверу (origin):

```text
Off            без шифрования (не использовать)
Flexible       посетитель -> Cloudflare по HTTPS, Cloudflare -> сервер по HTTP
Full           HTTPS до сервера, сертификат не проверяется
Full (strict)  HTTPS до сервера, сертификат должен быть действительным (рекомендуется)
```

Настройка: **SSL/TLS**, затем **Overview** и режим **Full (strict)**.

- Для Full (strict) на вашем сервере нужен сертификат: бесплатный **Cloudflare Origin CA** (доверенный только для связи Cloudflare с сервером) или Let's Encrypt (см. статьи про cert-manager и nginx).
- Режим Flexible вместе с редиректом на HTTPS на сервере даёт бесконечный цикл редиректов (`ERR_TOO_MANY_REDIRECTS`) и оставляет участок до сервера незащищённым. Если сервер умеет HTTPS, используйте Full (strict).
- Для сайтов на Pages и Workers сервера нет, отдельный сертификат не нужен: HTTPS выдаётся автоматически.

## 4. Принудительный редирект на HTTPS

1. **SSL/TLS**, затем **Edge Certificates**, переключатель **Always Use HTTPS** в положение On. Либо создайте правило в **Rules**, **Redirect Rules** по шаблону «Redirect from HTTP to HTTPS».
2. Включите **Automatic HTTPS Rewrites**: ссылки на http-ресурсы на странице будут заменены на https.
3. Минимальную версию TLS поставьте 1.2.
4. **HSTS** включайте только когда HTTPS работает безупречно на всех поддоменах, начиная с небольшого срока.

```bash
curl -sI http://example.com | head -3    # ожидается 301 и Location: https://example.com/
```

## 5. Базовая защита

- **WAF.** На бесплатном тарифе действует базовый набор управляемых правил (Free Managed Ruleset), расширенные наборы (в том числе OWASP) входят в платные тарифы: уточняйте актуальный состав тарифа. Свои правила (Custom rules) позволяют блокировать по стране, IP, пути или заголовку.
- **Bot Fight Mode** и уровень безопасности (**Security level**) снижают поток простых ботов. **Under Attack Mode** включайте временно, во время атаки: он показывает посетителям проверку.
- **Rate limiting** ограничивает число запросов с одного адреса (например, для страницы входа).
- Закройте прямой доступ к серверу: разрешите входящие соединения на 80 и 443 только с адресов Cloudflare (список на cloudflare.com/ips). Иначе, зная IP сервера, защиту можно обойти.
- Включите двухфакторную защиту аккаунта Cloudflare и выдавайте API-токены с минимально нужными правами.
