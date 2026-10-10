---
id: "cloudflare-workers-wrangler"
title: "2. Cloudflare Workers и Wrangler: от нуля до деплоя"
category: "cloudflare_guides"
tags: ["cloudflare", "workers", "wrangler", "serverless", "edge", "деплой", "wrangler-dev"]
sources:
  - title: "Офиц.: документация Cloudflare Workers"
    url: "https://developers.cloudflare.com/workers/"
  - title: "Офиц.: Wrangler — обзор"
    url: "https://developers.cloudflare.com/workers/wrangler/"
  - title: "Офиц.: Wrangler — установка и обновление"
    url: "https://developers.cloudflare.com/workers/wrangler/install-and-update/"
  - title: "Офиц.: Wrangler — команды"
    url: "https://developers.cloudflare.com/workers/wrangler/commands/"
  - title: "Репозиторий: cloudflare/workers-sdk"
    url: "https://github.com/cloudflare/workers-sdk"
  - title: "Форум: Cloudflare Community"
    url: "https://community.cloudflare.com/"
  - title: "Форум: Stack Overflow — тег cloudflare-workers"
    url: "https://stackoverflow.com/questions/tagged/cloudflare-workers"
  - title: "Хабр: свежие статьи про Cloudflare Workers"
    url: "https://habr.com/ru/search/?q=cloudflare%20workers%20wrangler&target_type=posts&order=date"
---

# Cloudflare Workers и Wrangler

Workers это бессерверные (serverless) скрипты, которые выполняются на узлах Cloudflare рядом с пользователем: серверы поднимать не нужно, код запускается по каждому запросу. Управляет ими утилита Wrangler. Ниже весь путь: установка, вход, конфигурация, локальный запуск и деплой.

## 1. Установка Wrangler

```bash
node -v                      # актуальному Wrangler нужен Node.js 22 или новее
npm i -g wrangler            # глобальная установка
wrangler --version
```

- Глобальная установка удобна для начала. Для проектов надёжнее ставить Wrangler локально: `npm i -D wrangler`, затем запускать `npx wrangler ...`. Тогда у каждого проекта своя версия, и сборка в CI повторяема.
- Если Node.js старый, Wrangler откажется запускаться. Это частая причина сбоя деплоя в CI: задайте нужную версию Node в шаге настройки окружения.

## 2. Вход в аккаунт

```bash
wrangler login               # откроет браузер для авторизации
wrangler whoami              # кто вошёл и какие аккаунты доступны
wrangler logout
```

- Для CI вход через браузер не подходит: используйте переменные окружения `CLOUDFLARE_API_TOKEN` (токен с правом редактировать Workers) и `CLOUDFLARE_ACCOUNT_ID`.

## 3. Создание проекта и конфигурация

```bash
npm create cloudflare@latest my-worker   # мастер создания проекта
# или в пустой папке:
wrangler init
```

Минимальный `wrangler.toml` (в новых проектах встречается и формат `wrangler.jsonc`):

```toml
name = "my-worker"
main = "src/index.ts"
compatibility_date = "2025-09-01"
```

Минимальный код (`src/index.ts`):

```typescript
export default {
  async fetch(request: Request): Promise<Response> {
    return new Response("Hello from the edge!");
  },
};
```

- `name` это имя Worker, `main` точка входа, `compatibility_date` фиксирует поведение рантайма на выбранную дату, чтобы обновления платформы не меняли его неожиданно.
- Обычные переменные задаются в секции `[vars]`, а привязки (KV, R2, D1) в отдельных секциях файла. Примеры с KV и R2 есть в статье `cloudflare-workers-edge-kv`.

## 4. Локальный запуск

```bash
wrangler dev                 # локальный сервер, обычно http://localhost:8787
curl http://localhost:8787
```

- Изменения кода подхватываются автоматически. Локальные секреты кладите в файл `.dev.vars` (в `.gitignore`).
- Для KV, R2 и других привязок при локальной разработке используется их эмуляция.

## 5. Секреты

```bash
wrangler secret put API_KEY      # значение вводится в терминале
wrangler secret list
wrangler secret delete API_KEY
```

- Секреты хранятся в Cloudflare, переживают деплои и не попадают в `wrangler.toml`. Никогда не пишите токены в конфигурацию и в репозиторий.

## 6. Деплой в продакшн

```bash
wrangler deploy                  # опубликовать Worker
wrangler tail                    # журнал запросов в реальном времени
wrangler deployments list        # история версий
wrangler rollback                # вернуться к предыдущей версии
```

- После `wrangler deploy` Worker доступен по адресу `<name>.<поддомен-аккаунта>.workers.dev`. Свой домен подключается в настройках Worker (**Domains & Routes**) или маршрутами в конфигурации.

## 7. Автодеплой из GitHub

- **Workers Builds.** В настройках Worker откройте **Builds** и подключите репозиторий: каждый пуш собирается и деплоится сам. Имя Worker в `wrangler.toml` должно совпадать с именем Worker в Cloudflare, иначе сборка упадёт.
- **GitHub Actions.** Шаг `cloudflare/wrangler-action@v3` с секретами `CLOUDFLARE_API_TOKEN` и `CLOUDFLARE_ACCOUNT_ID` репозитория. Версию Node в `actions/setup-node` ставьте не ниже требуемой Wrangler.
- Не передавайте `GITHUB_TOKEN` из Actions как секрет Worker: это временный токен, он перестаёт действовать после завершения запуска и позже даст ошибку 401 при обращении к GitHub API.
