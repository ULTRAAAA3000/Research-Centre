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

### Что это и зачем

Вы вводите в консоли `kb docker`, и статья из базы знаний появляется прямо в терминале: с цветной подсветкой, готовыми командами в рамках и ссылками на первоисточники. Удобно, когда вы сидите на сервере по SSH и не хотите переключаться на браузер или Telegram.

Нужен только `curl` (есть в Linux, macOS и Windows 10/11). Ничего устанавливать не требуется. Команда `kb` это короткий псевдоним: она отправляет запрос на адрес вашего Worker (`/cli?q=...`), тот ищет статью и возвращает готовый текст.

### Шаг 1. Проверка без настройки

```bash
curl -s "https://<worker-domain>/cli?q=docker"
```

Если пришла статья, всё работает. Дальше настраиваем короткую команду `kb`, чтобы не набирать длинный адрес. Те же инструкции есть в боте: команда `/cli`.

### Linux и macOS (bash, zsh)

1. Узнайте оболочку: `echo $SHELL`. Для `zsh` (macOS по умолчанию) правьте `~/.zshrc`, для `bash` правьте `~/.bashrc` (в macOS с bash это `~/.bash_profile`).
2. Добавьте команду одним копированием (для zsh замените `~/.bashrc` на `~/.zshrc`):

```bash
cat >> ~/.bashrc <<'EOF'
alias kb='f() { curl -sG --data-urlencode "q=$*" "https://<worker-domain>/cli"; }; f'
EOF
```

3. Примените без перезапуска терминала: `source ~/.bashrc`
4. Проверьте: `kb docker`

Что делает строка:

- `alias kb=...` создаёт слово `kb`, которое запускает всё в кавычках;
- `curl -s` делает запрос без индикатора загрузки;
- `-G` отправляет данные как параметры адреса (GET);
- `--data-urlencode "q=$*"` берёт все слова после `kb` и безопасно кодирует их (пробелы, русские буквы), поэтому `kb docker compose` работает.

Удаление: откройте файл (`nano ~/.bashrc`) и удалите строку с `alias kb`.

### Windows (PowerShell)

В PowerShell слово `curl` это псевдоним другой команды (Invoke-WebRequest), поэтому используется `curl.exe`: настоящий curl, встроенный в Windows 10 и 11.

1. Откройте PowerShell (лучше Windows Terminal: он показывает цвета). Проверьте: `curl.exe --version`.
2. Создайте и откройте файл профиля (он выполняется при каждом запуске PowerShell):

```powershell
if (!(Test-Path $PROFILE)) { New-Item -Path $PROFILE -ItemType File -Force }
notepad $PROFILE
```

3. Вставьте в файл и сохраните:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
function kb { curl.exe -sG --data-urlencode "q=$args" "https://<worker-domain>/cli" }
```

Первая строка включает UTF-8, чтобы русский текст и значки отображались правильно.

4. Перезапустите PowerShell и проверьте: `kb docker`.

Если PowerShell пишет, что выполнение сценариев отключено: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. В WSL следуйте инструкции для Linux, в Git Bash как для bash.

### fish

```fish
function kb
    curl -sG --data-urlencode "q=$argv" "https://<worker-domain>/cli"
end
funcsave kb
```

`funcsave` сохраняет функцию навсегда, перезапускать ничего не нужно.

### Как пользоваться

```bash
kb vless              # статья про VLESS Reality
kb docker compose     # несколько слов тоже работают
kb nginx | less -R    # длинная статья постранично, с цветами
kb list               # список всех статей по категориям
kb iptables-basics    # точный id статьи
```

В ответе: 📌 заголовок, категория и теги; 📝 краткое описание; 💻 команды и конфиги в рамках (их можно выделить и скопировать); 🔗 первоисточники со ссылками. Если подходящих статей несколько, показывается лучшая, остальные перечислены в разделе «Ещё по запросу». Поиск идёт по названию, id, тегам и тексту.

Без цветов (например, чтобы сохранить в файл):

```bash
curl -sG --data-urlencode "q=docker" --data-urlencode "plain=1" "https://<worker-domain>/cli" > docker.txt
```

### Если не работает

| Симптом | Причина и решение |
|---|---|
| `kb: command not found` | Не выполнили `source` или правили не тот файл (`echo $SHELL`). Откройте новый терминал, проверьте `type kb`. |
| `curl: command not found` | Установите: `sudo apt install curl` (Debian/Ubuntu), `brew install curl` (macOS). |
| Вместо цветов `\033[1m` или `←[1m` | Терминал не поддерживает цвета. Используйте современный терминал (Windows Terminal) или вариант с `plain=1`. |
| Квадраты или кракозябры вместо значков | Кодировка или шрифт: проверьте `locale` (нужен UTF-8), в PowerShell строку `OutputEncoding`. |
| «Ничего не найдено» | Не ошибка: такого слова нет. Выберите id из выведенного списка статей. |
| Пустой ответ или 502 | `curl -i "https://<worker-domain>/cli?q=docker&plain=1"`. 502 значит, что Worker не смог загрузить базу с GitHub (обычно лимит API): добавьте секрет `GITHUB_TOKEN`. |
| В PowerShell ошибка про Invoke-WebRequest | В функции должен быть именно `curl.exe`. |
| Алиас не работает в вашей оболочке | Используйте функцию: `kb() { curl -sG --data-urlencode "q=$*" "https://<worker-domain>/cli"; }` |

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
