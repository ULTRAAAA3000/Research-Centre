# 🔬 Research Centre

База знаний по системному администрированию, Linux, DevOps, сетям, виртуализации и безопасности с двумя интерфейсами:

- **Telegram-бот** — поиск, просмотр статей, избранное, похожие темы.
- **Терминал (`curl` / алиас `kb`)** — цветной вывод ANSI прямо в консоли.

Оба интерфейса обслуживает один **Cloudflare Worker**. Источник данных — Markdown-файлы в папке [`kb/`](kb/) этого репозитория.

```
Telegram ──► /telegram-webhook ─┐
                                ├─► Cloudflare Worker ──► GitHub (kb/*.md)
Терминал ──► /cli?q=<query> ────┘
```

## Структура репозитория

```
src/index.ts      Worker: роутинг, поиск, Telegram-бот, ANSI-рендер
kb/*.md           Статьи базы знаний
wrangler.toml     Конфигурация Worker
scripts/          set-webhook.sh — подключение вебхука и меню команд
```

## 1. Создание Telegram-бота

1. Откройте [@BotFather](https://t.me/BotFather) → `/newbot` → задайте имя и username.
2. Сохраните выданный токен (`TELEGRAM_BOT_TOKEN`).
3. (Опционально) `/setcommands` в BotFather:

```
search - Поиск по базе знаний
all - Все статьи
fav - Избранное
cli - Настройка терминала (kb)
help - Помощь
```

## 2. Деплой Worker на Cloudflare

```bash
git clone https://github.com/ULTRAAAA3000/Research-Centre.git
cd Research-Centre
npm install
npx wrangler login
```

Если вы форкнули репозиторий, поменяйте `GITHUB_REPO` в `wrangler.toml`.

Задайте секреты и задеплойте:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET      # любая случайная строка, например: openssl rand -hex 24
npx wrangler secret put GITHUB_TOKEN        # опционально: приватное репо и выше лимиты GitHub API
npx wrangler secret put ALLOWED_USERS       # опционально: id пользователей через запятую (закрытый бот)
npx wrangler deploy
```

KV-хранилище (`KB_KV`) для избранного создаётся автоматически при первом деплое. Если ваша версия wrangler этого не умеет, создайте его вручную (`npx wrangler kv namespace create KB_KV`) и добавьте выданный `id = "..."` в блок `[[kv_namespaces]]` файла `wrangler.toml`.

Wrangler выведет адрес вида `https://research-centre.<account>.workers.dev`.

## 3. Подключение вебхука Telegram

Одной командой (вебхук + меню команд + проверка статуса):

```bash
TELEGRAM_BOT_TOKEN=<токен> WEBHOOK_SECRET=<секрет> WORKER_URL=https://<worker-domain>   ./scripts/set-webhook.sh
```

Или вручную:

```bash
curl -s "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://<worker-domain>/telegram-webhook" \
  -d "secret_token=<WEBHOOK_SECRET>"
```

В ответе `getWebhookInfo` не должно быть `last_error_message`. Проверка: напишите боту `/start`, затем `docker`.

Свой Telegram user id для `ALLOWED_USERS` можно узнать у бота [@userinfobot](https://t.me/userinfobot).

## 4. Терминал (CLI)

Быстрый запрос без установки:

```bash
curl -s "https://<worker-domain>/cli?q=docker"
```

Короткая команда `kb` (добавьте в `~/.bashrc` или `~/.zshrc`, затем `source ~/.bashrc`):

```bash
alias kb='f() { curl -sG --data-urlencode "q=$*" "https://<worker-domain>/cli"; }; f'
```

Если алиас с функцией не работает в вашей оболочке, используйте функцию:

```bash
kb() { curl -sG --data-urlencode "q=$*" "https://<worker-domain>/cli"; }
```

Примеры:

```bash
kb vless
kb docker-compose
kb iptables
kb list          # список всех статей
```

Без цветов (для пайпов и файлов): добавьте параметр `plain=1`, например `curl -s "https://<worker-domain>/cli?q=docker&plain=1"`.

## 5. Добавление статей

Создайте файл `kb/<имя>.md` и сделайте коммит в ветку `main`. Worker кэширует список статей на 5 минут.

```markdown
---
id: "my-article"
title: "Название статьи"
category: "linux"
tags: ["tag1", "tag2"]
sources:
  - title: "Официальная документация"
    url: "https://example.com/docs"
---

# Название статьи

Краткое описание: первый абзац показывается как выжимка.

## Раздел

```bash
command --flag value
```
```

Правила:

- `id` уникален и не длиннее 60 символов (используется в кнопках Telegram).
- Блоки «Первоисточники» формируются автоматически из `sources`, дублировать их в тексте не нужно.
- Для подсветки в терминале указывайте язык блока кода: `bash`, `json`, `yaml`, `ini`.
- Если GitHub API отдаёт ошибку лимита, задайте секрет `GITHUB_TOKEN`.

## Локальная разработка

```bash
npm run typecheck
echo 'TELEGRAM_BOT_TOKEN=test' > .dev.vars   # локальные секреты (в .gitignore)
npx wrangler dev
curl -s "http://localhost:8787/cli?q=docker"
```
