---
id: "consul-service-discovery"
title: "Consul: регистрация сервисов, health-check и KV"
category: "devops"
tags: ["consul", "service-discovery", "kv", "health-check", "dns", "hashicorp"]
sources:
  - title: "Офиц.: документация Consul"
    url: "https://developer.hashicorp.com/consul/docs"
  - title: "Офиц.: справочник команд Consul"
    url: "https://developer.hashicorp.com/consul/commands"
  - title: "Форум: HashiCorp Discuss"
    url: "https://discuss.hashicorp.com/"
  - title: "Репозиторий: hashicorp/consul"
    url: "https://github.com/hashicorp/consul"
  - title: "Форум: Stack Overflow — тег consul"
    url: "https://stackoverflow.com/questions/tagged/consul"
  - title: "Хабр: свежие статьи про Consul"
    url: "https://habr.com/ru/search/?q=consul%20hashicorp&target_type=posts&order=date"
---

# Consul

Consul это каталог сервисов с проверками здоровья, DNS-интерфейсом и распределённым хранилищем ключей (KV). Сервис регистрируется на узле через файл конфигурации, а другие сервисы находят его по имени. Лицензия Consul изменилась на BUSL (2023): проверьте условия для вашего случая.

## Регистрация сервиса (/etc/consul.d/api-service.json)

```json
{
  "service": {
    "name": "payment-api",
    "port": 8080,
    "tags": ["production", "v1"],
    "check": {
      "id": "api-check",
      "name": "HTTP Health Check",
      "http": "http://localhost:8080/health",
      "interval": "10s",
      "timeout": "2s"
    }
  }
}
```

```bash
consul validate /etc/consul.d/
consul reload
consul members
consul catalog services
```

- `consul validate` проверяет конфиги до применения, `consul reload` подхватывает изменения без перезапуска агента.
- Проверка `http` считается успешной при ответе 2xx. При сбое сервис помечается как критический и исключается из DNS и из выдачи запросов `passing`.
- Файл кладётся на тот узел, где запущен сервис, и обрабатывается локальным агентом Consul.

## Поиск сервиса

```bash
dig @127.0.0.1 -p 8600 payment-api.service.consul
dig @127.0.0.1 -p 8600 payment-api.service.consul SRV
curl -s "http://127.0.0.1:8500/v1/health/service/payment-api?passing"
```

- Консул отвечает по DNS на порту 8600 и по HTTP API на 8500. Для обычных приложений настройте DNS-перенаправление зоны `.consul` на агент.
- Запрос с `?passing` возвращает только здоровые экземпляры.

## Ключи и значения (KV)

```bash
consul kv put config/db_host "10.0.0.15"
consul kv get config/db_host
consul kv get -recurse config/
consul kv delete config/db_host
```

- KV подходит для конфигурации, флагов и блокировок. Секреты в нём не храните: для них есть Vault.
- В продакшене включите ACL и TLS, иначе любой с доступом к порту 8500 может читать и менять данные.
- Для запуска пробного агента на одном узле: `consul agent -dev`. Он не сохраняет данные и не для продакшена.
