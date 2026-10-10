---
id: "cloudflare-pages-github-cicd"
title: "1. Cloudflare Pages + GitHub: автодеплой (CI/CD)"
category: "cloudflare_guides"
tags: ["cloudflare", "pages", "github", "ci-cd", "деплой", "dist", "npm-run-build"]
sources:
  - title: "Офиц.: Pages — Git integration"
    url: "https://developers.cloudflare.com/pages/get-started/git-integration/"
  - title: "Офиц.: Pages — настройка сборки"
    url: "https://developers.cloudflare.com/pages/configuration/build-configuration/"
  - title: "Офиц.: документация Cloudflare Pages"
    url: "https://developers.cloudflare.com/pages/"
  - title: "Статья: деплой статического сайта из Git на Pages"
    url: "https://stackharbor.com/en/knowledge-base/cf-pages-deploy-static-from-git/"
  - title: "Форум: Cloudflare Community"
    url: "https://community.cloudflare.com/"
  - title: "Форум: Stack Overflow — тег cloudflare-pages"
    url: "https://stackoverflow.com/questions/tagged/cloudflare-pages"
  - title: "Репозиторий: cloudflare/cloudflare-docs"
    url: "https://github.com/cloudflare/cloudflare-docs"
  - title: "Хабр: свежие статьи про Cloudflare Pages"
    url: "https://habr.com/ru/search/?q=cloudflare%20pages&target_type=posts&order=date"
---

# Cloudflare Pages + GitHub: автодеплой

Pages собирает и публикует сайт при каждом пуше в репозиторий: Cloudflare сам клонирует проект из GitHub, выполняет команду сборки и выкладывает результат на свою сеть. Пуш в основную ветку даёт боевой деплой, остальные ветки и pull request получают отдельные адреса для предпросмотра.

## Перед началом

Убедитесь, что проект собирается локально, и узнайте, в какую папку попадает результат:

```bash
npm ci
npm run build
ls dist/
```

- В папке публикации должен лежать готовый сайт (обычно `index.html` в корне). Эту папку вы укажете в настройках.
- Нужны аккаунт Cloudflare и репозиторий на GitHub (публичный или приватный).

## Подключение репозитория (шаги в дашборде)

1. Откройте дашборд Cloudflare и перейдите в **Workers & Pages**.
2. Нажмите **Create application**, откройте вкладку **Pages** и выберите **Connect to Git**.
3. Авторизуйте приложение Cloudflare Pages в GitHub. Лучше выдать доступ только к нужному репозиторию (**Only select repositories**).
4. Выберите репозиторий и нажмите **Begin setup**.
5. Задайте **Production branch**, например `main`. Эта ветка деплоится в продакшн.
6. Заполните настройки сборки:
   - **Framework preset**: при выборе фреймворка поля ниже заполнятся сами.
   - **Build command**: `npm run build` (без сборки поле оставьте пустым).
   - **Build output directory**: `dist`.
   - **Root directory (advanced)**: подпапка проекта, если сайт лежит не в корне репозитория (монорепозиторий).
7. При необходимости добавьте **Environment variables** (пары «ключ и значение», доступные во время сборки).
8. Нажмите **Save and Deploy** и следите за журналом сборки. Результат появится по адресу `<проект>.pages.dev`.

Типичные значения (проверьте у своего фреймворка):

```text
Vite / React:     npm run build   ->  dist
Astro:            npm run build   ->  dist
Create React App: npm run build   ->  build
Hugo:             hugo            ->  public
Gatsby:           gatsby build    ->  public
```

## Как работает деплой

- Пуш в Production branch запускает сборку и публикацию в продакшн.
- Пуш в другую ветку или pull request создаёт предпросмотр с уникальным адресом, его ссылка появляется в pull request.
- Прошлые деплои видны в списке **Deployments** проекта: если новая версия сломана, можно вернуться к предыдущей успешной.
- Свой домен: **Custom domains** в проекте, затем **Set up a custom domain**.

## Переменные окружения и версия Node

- Переменные задаются при создании проекта или позже в **Settings** проекта. Для продакшна и предпросмотра можно задать разные наборы значений.
- Чтобы закрепить версию Node.js, добавьте переменную `NODE_VERSION` (например, `22`) или файл `.node-version` в корень репозитория.
- Секретные значения (ключи, токены) задавайте как секреты в настройках, не коммитьте их в репозиторий.
- Переменные, попавшие в клиентский код (в сборку), видны всем посетителям сайта: не кладите туда ничего секретного.

## Частые проблемы

- **«No files uploaded» или пустой сайт.** Неверная папка публикации: сборка прошла, но в указанной папке пусто. Проверьте локально, куда реально пишет `npm run build`.
- **Сборка падает.** Откройте журнал сборки. Команда должна завершаться с кодом 0. Частые причины: другая версия Node (задайте `NODE_VERSION`), нет файла `package-lock.json` для `npm ci`, не заданы нужные переменные.
- **Проект в подпапке.** Укажите **Root directory**, иначе команда запустится не там.
- **Одностраничное приложение (SPA).** Если в корне публикации нет файла `404.html`, Pages обрабатывает маршруты как SPA и отдаёт `index.html`.

## Деплой без Git (по желанию)

```bash
npx wrangler pages deploy dist --project-name=my-site
```

- Так публикуется уже собранная папка (например, из своего CI). Проект, созданный через Git-интеграцию, нельзя позже превратить в проект с прямой загрузкой и наоборот: выбирайте способ заранее.
- Cloudflare развивает и Workers со статикой (Workers Static Assets) и сборкой Workers Builds, как у бота этого проекта. Для нового проекта сверьтесь с актуальной документацией, какой вариант рекомендуется.
