#!/usr/bin/env bash
# Подключает вебхук Telegram, меню команд и выводит статус.
# Использование:
#   TELEGRAM_BOT_TOKEN=... WEBHOOK_SECRET=... WORKER_URL=https://research-centre.<account>.workers.dev \
#     ./scripts/set-webhook.sh
set -euo pipefail
: "${TELEGRAM_BOT_TOKEN:?Задайте TELEGRAM_BOT_TOKEN}"
: "${WEBHOOK_SECRET:?Задайте WEBHOOK_SECRET}"
: "${WORKER_URL:?Задайте WORKER_URL, например https://research-centre.example.workers.dev}"

API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"

echo "→ setWebhook"
curl -s "${API}/setWebhook" \
  -d "url=${WORKER_URL%/}/telegram-webhook" \
  -d "secret_token=${WEBHOOK_SECRET}" \
  -d 'allowed_updates=["message","callback_query"]'
echo

echo "→ setMyCommands"
curl -s "${API}/setMyCommands" -H 'content-type: application/json' -d '{
  "commands": [
    {"command": "search", "description": "Поиск по базе знаний"},
    {"command": "all",    "description": "Разделы базы знаний"},
    {"command": "fav",    "description": "Избранное"},
    {"command": "cli",    "description": "Настройка терминала (kb)"},
    {"command": "help",   "description": "Помощь"}
  ]
}'
echo

echo "→ getWebhookInfo"
curl -s "${API}/getWebhookInfo"
echo
