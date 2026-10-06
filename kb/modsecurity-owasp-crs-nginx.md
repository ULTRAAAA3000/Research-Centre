---
id: "modsecurity-owasp-crs-nginx"
title: "ModSecurity и OWASP CRS для Nginx: WAF, статус проекта и настройка"
category: "security"
tags: ["modsecurity", "waf", "owasp", "crs", "nginx", "coraza"]
sources:
  - title: "Набор правил: OWASP Core Rule Set"
    url: "https://coreruleset.org/docs/"
  - title: "Репозиторий: coreruleset/coreruleset"
    url: "https://github.com/coreruleset/coreruleset"
  - title: "Репозиторий: ModSecurity-nginx (коннектор)"
    url: "https://github.com/owasp-modsecurity/ModSecurity-nginx"
  - title: "Альтернатива: Coraza WAF (OWASP)"
    url: "https://coraza.io/"
  - title: "Новость: F5 NGINX ModSecurity WAF — конец жизни"
    url: "https://www.f5.com/company/blog/nginx/f5-nginx-modsecurity-waf-transitioning-to-eol"
  - title: "Хабр: ModSecurity — конец коммерческой поддержки"
    url: "https://habr.com/ru/companies/cloud4y/news/793096/"
  - title: "Форум: Stack Overflow — тег modsecurity"
    url: "https://stackoverflow.com/questions/tagged/modsecurity"
  - title: "Хабр: свежие статьи про WAF и ModSecurity"
    url: "https://habr.com/ru/search/?q=modsecurity%20waf&target_type=posts&order=date"
---

# ModSecurity и OWASP CRS для Nginx

WAF (межсетевой экран веб-приложений) проверяет HTTP-запросы по правилам и блокирует атаки вроде SQL-инъекций и XSS. Связка: ModSecurity v3 (движок) плюс OWASP Core Rule Set (набор правил) плюс коннектор для nginx.

## Статус проекта (важно знать)

- Компания Trustwave прекратила коммерческую поддержку ModSecurity с 1 июля 2024 года. Открытый код остаётся у сообщества, но тот факт, что главный спонсор ушёл, меняет планы на долгую перспективу.
- Проект OWASP CRS продолжает поддерживать ModSecurity, но смещает фокус на новый WAF Coraza (на Go, проект OWASP). F5 NGINX по этой причине снял с поддержки коммерческий модуль NGINX ModSecurity WAF.
- Для nginx ModSecurity по-прежнему самый зрелый вариант. Для новых проектов оцените Coraza: у него есть интеграции для Caddy, Envoy и HAProxy, а для nginx зрелость решения проверяйте отдельно.

## Настройка движка (/etc/nginx/modsec/modsecurity.conf)

```ini
SecRuleEngine DetectionOnly
SecRequestBodyAccess On
SecResponseBodyAccess Off
SecResponseBodyMimeType text/html text/plain text/xml application/json
SecDataDir /var/cache/modsecurity
SecAuditEngine RelevanceOnly
SecAuditLog /var/log/modsec_audit.log
```

- Начинайте с `SecRuleEngine DetectionOnly`: правила только пишут срабатывания в журнал и ничего не блокируют. Так вы увидите ложные срабатывания на реальном трафике. Когда журнал чистый, переключитесь на `On`.
- `SecDataDir` не размещайте в `/tmp`: каталог нужен постоянный и недоступный другим пользователям, например `/var/cache/modsecurity`.
- `SecAuditEngine RelevanceOnly` пишет в журнал только подозрительные запросы. Журнал растёт быстро, настройте ротацию (`logrotate`).
- Исходная рекомендованная конфигурация поставляется в репозитории ModSecurity как `modsecurity.conf-recommended`.

## Главный файл правил (/etc/nginx/modsec/main.conf)

```ini
Include /etc/nginx/modsec/modsecurity.conf
Include /usr/share/modsecurity-crs/crs-setup.conf
Include /usr/share/modsecurity-crs/rules/*.conf
```

Пути к CRS зависят от способа установки (пакет дистрибутива или клонирование репозитория coreruleset).

## Подключение в nginx

```nginx
server {
    listen 443 ssl;
    server_name app.example.com;

    modsecurity on;
    modsecurity_rules_file /etc/nginx/modsec/main.conf;
}
```

```bash
sudo apt install libnginx-mod-http-modsecurity
sudo nginx -t && sudo systemctl reload nginx
curl -k "https://app.example.com/?q=<script>alert(1)</script>"
sudo tail -f /var/log/modsec_audit.log
```

- На Debian и Ubuntu коннектор ставится пакетом `libnginx-mod-http-modsecurity`. На других системах модуль собирают из исходников под вашу версию nginx.
- Тестовый запрос с `<script>` должен попасть в журнал (в режиме `On` вернётся 403).
- Ложные срабатывания гасите точечно: `SecRuleRemoveById <ID>` или исключениями для конкретных путей, а не отключением правил целиком.
- Уровень строгости CRS задаётся параметром paranoia level в `crs-setup.conf`. Начинайте с 1: более высокие уровни дают больше ложных срабатываний.
