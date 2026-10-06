---
id: "keycloak-sso-iam"
title: "Keycloak: SSO, запуск и OIDC-эндпоинты"
category: "security"
tags: ["keycloak", "sso", "oidc", "oauth2", "iam", "postgres"]
sources:
  - title: "Офиц.: документация Keycloak"
    url: "https://www.keycloak.org/documentation"
  - title: "Офиц.: запуск в контейнерах"
    url: "https://www.keycloak.org/server/containers"
  - title: "Офиц.: Keycloak за обратным прокси"
    url: "https://www.keycloak.org/server/reverseproxy"
  - title: "Форум: Keycloak GitHub Discussions"
    url: "https://github.com/keycloak/keycloak/discussions"
  - title: "Форум: Stack Overflow — тег keycloak"
    url: "https://stackoverflow.com/questions/tagged/keycloak"
  - title: "Хабр: свежие статьи про Keycloak"
    url: "https://habr.com/ru/search/?q=keycloak&target_type=posts&order=date"
---

# Keycloak: единый вход (SSO)

Keycloak это сервер идентификации: единый вход, управление пользователями и выдача токенов по OpenID Connect и OAuth 2.0. Режим `start-dev` предназначен только для разработки. Для продакшена используйте `start` с TLS или с обратным прокси и явным именем хоста.

## Стек для разработки (compose.yaml)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: keycloakpassword
    volumes:
      - kc_pg:/var/lib/postgresql/data

  keycloak:
    image: quay.io/keycloak/keycloak:24.0.0
    command: start-dev
    depends_on:
      - postgres
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: adminpassword
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: keycloakpassword
    ports:
      - "8080:8080"

volumes:
  kc_pg:
```

- Версия `24.0.0` приведена как пример: закрепите актуальную стабильную версию с quay.io/keycloak/keycloak. В новых версиях переменные `KEYCLOAK_ADMIN` и `KEYCLOAK_ADMIN_PASSWORD` заменены на `KC_BOOTSTRAP_ADMIN_USERNAME` и `KC_BOOTSTRAP_ADMIN_PASSWORD`, сверьтесь с документацией вашей версии.
- Пароли в файле это пример. Выносите их в `.env` или секреты.
- Для продакшена: `command: start`, переменные `KC_HOSTNAME`, режим прокси (`KC_PROXY_HEADERS=xforwarded` в новых версиях) и сертификат на обратном прокси. Без `start-dev` Keycloak откажется работать по голому HTTP.

## OIDC-эндпоинты

```text
https://auth.example.com/realms/{realm-name}/.well-known/openid-configuration
https://auth.example.com/realms/{realm-name}/protocol/openid-connect/token
https://auth.example.com/realms/{realm-name}/protocol/openid-connect/auth
https://auth.example.com/realms/{realm-name}/protocol/openid-connect/certs
```

```bash
curl -s -X POST "https://auth.example.com/realms/myrealm/protocol/openid-connect/token" \
  -d grant_type=client_credentials \
  -d client_id=my-client \
  -d client_secret=<CLIENT_SECRET>
```

- Адрес `.well-known/openid-configuration` содержит все остальные эндпоинты: клиентские библиотеки обычно требуют только его.
- В версиях Keycloak 17 и новее в пути нет префикса `/auth` (он был в старых инструкциях).
- `client_credentials` работает для клиента с включённым Service Accounts (и типом доступа confidential).
