---
id: "vault-secrets-management"
title: "HashiCorp Vault: инициализация, KV v2 и политики доступа"
category: "security"
tags: ["vault", "secrets", "kv", "policy", "unseal", "hcl", "openbao"]
sources:
  - title: "Офиц.: документация Vault"
    url: "https://developer.hashicorp.com/vault/docs"
  - title: "Офиц.: KV secrets engine v2"
    url: "https://developer.hashicorp.com/vault/docs/secrets/kv/kv-v2"
  - title: "Офиц.: политики Vault"
    url: "https://developer.hashicorp.com/vault/docs/concepts/policies"
  - title: "Открытый форк: OpenBao"
    url: "https://openbao.org/"
  - title: "Форум: HashiCorp Discuss"
    url: "https://discuss.hashicorp.com/"
  - title: "Форум: Stack Overflow — тег hashicorp-vault"
    url: "https://stackoverflow.com/questions/tagged/hashicorp-vault"
  - title: "Хабр: свежие статьи про Vault"
    url: "https://habr.com/ru/search/?q=hashicorp%20vault&target_type=posts&order=date"
---

# HashiCorp Vault

Vault хранит секреты (пароли, ключи, токены), выдаёт их приложениям по политикам и ведёт аудит. После запуска сервер находится в запечатанном (sealed) состоянии и не работает, пока его не распечатают ключами. Команды ниже ожидают переменные окружения `VAULT_ADDR=https://vault.example.com:8200`.

## Инициализация и распечатывание

```bash
export VAULT_ADDR=https://vault.example.com:8200
vault operator init -key-shares=5 -key-threshold=3
vault operator unseal <UNSEAL_KEY>
vault operator unseal <UNSEAL_KEY>
vault operator unseal <UNSEAL_KEY>
vault login <ROOT_TOKEN>
vault status
```

- Инициализация выполняется один раз и печатает 5 ключей и корневой токен. Сохраните ключи у разных людей в разных местах: потеря нужного числа ключей означает потерю доступа к данным.
- Для распечатывания нужно 3 разных ключа (threshold), поэтому команду `unseal` выполняют три раза с разными ключами.
- Корневой токен нужен только для первоначальной настройки. Создайте административные политики и пользователей, затем отзовите его: `vault token revoke <ROOT_TOKEN>` (при необходимости новый корневой токен выпускается через `vault operator generate-root`).
- Автораспечатывание через облачный KMS (auto-unseal) избавляет от ручного ввода ключей после каждого перезапуска.

## Секреты KV v2 и политика

```bash
vault secrets enable -path=secret kv-v2
vault kv put secret/db/config username="app_user" password=@/root/db-password.txt
vault kv get secret/db/config
vault kv get -field=username secret/db/config
```

- Пароль в командной строке попадает в историю shell. Передавайте значение из файла (`password=@файл`) или с стандартного ввода (`password=-`).
- В dev-режиме Vault путь `secret/` уже подключён, команда `enable` вернёт ошибку. В продакшене её нужно выполнить один раз.
- KV v2 хранит версии секрета: `vault kv get -version=1 secret/db/config`, откат `vault kv rollback -version=1 secret/db/config`.

Политика для микросервиса (app-policy.hcl):

```hcl
path "secret/data/db/config" {
  capabilities = ["read"]
}
```

```bash
vault policy write app-policy app-policy.hcl
vault token create -policy=app-policy -ttl=1h
```

- В KV v2 в путях политик обязателен сегмент `data/` (`secret/data/...`), хотя CLI использует `secret/...`. Это самая частая причина ошибки `permission denied`.
- Для приложений вместо долгоживущих токенов используйте AppRole, Kubernetes auth или другие методы аутентификации с короткими токенами.
- Лицензия Vault изменилась на BUSL (2023). Открытый форк OpenBao совместим по командам (`bao` вместо `vault`).
