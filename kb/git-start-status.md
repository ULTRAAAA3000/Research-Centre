---
id: "git-start-status"
title: "1. Старт и статус (status, log, diff)"
category: "git_github_guide"
tags: ["git", "github", "status", "log", "diff", "init", "clone", "config"]
sources:
  - title: "Офиц.: git status"
    url: "https://git-scm.com/docs/git-status"
  - title: "Офиц.: git log"
    url: "https://git-scm.com/docs/git-log"
  - title: "Офиц.: git diff"
    url: "https://git-scm.com/docs/git-diff"
  - title: "Книга: Pro Git на русском"
    url: "https://git-scm.com/book/ru/v2"
  - title: "Офиц.: документация GitHub"
    url: "https://docs.github.com/ru"
  - title: "Форум: Stack Overflow — тег git"
    url: "https://stackoverflow.com/questions/tagged/git"
  - title: "Сообщество: Reddit r/git"
    url: "https://www.reddit.com/r/git/"
  - title: "Хабр: свежие статьи про Git"
    url: "https://habr.com/ru/search/?q=git%20%D0%BE%D1%81%D0%BD%D0%BE%D0%B2%D1%8B&target_type=posts&order=date"
---

# Старт и статус

Первые команды для работы с Git: настроить имя, создать или скачать репозиторий, посмотреть состояние файлов и историю.

## Начало работы

```bash
git config --global user.name "Ваше Имя"      # имя автора коммитов
git config --global user.email "me@mail.com"  # почта автора коммитов
git init                                      # создать репозиторий в текущей папке
git clone <URL>                               # скачать репозиторий с GitHub
```

- Имя и почта записываются в каждый коммит. На GitHub можно использовать адрес вида `ID+имя@users.noreply.github.com`, чтобы не раскрывать настоящую почту.
- Папка `.git` внутри проекта хранит всю историю. Не удаляйте и не редактируйте её вручную.

## Статус: что изменилось

```bash
git status                  # ветка, изменённые и новые файлы
git status -s               # то же, кратко (M изменён, A добавлен, ?? не отслеживается)
git diff                    # изменения, ещё не добавленные в индекс
git diff --staged           # изменения, уже добавленные (готовые к коммиту)
```

- `git status` показывает три группы: **Changes to be committed** (в индексе), **Changes not staged for commit** (изменены, но не добавлены), **Untracked files** (новые, Git их ещё не видит).
- Это главная команда: выполняйте её перед `add`, `commit`, `pull` и `push`, чтобы понимать, в каком состоянии репозиторий.

## История коммитов

```bash
git log --oneline --graph                  # компактный граф истории
git log --oneline --graph --all --decorate # все ветки, с метками веток и тегов
git log -5                                 # последние 5 коммитов
git log -p <файл>                          # история изменений одного файла
git show <commit>                          # что изменил конкретный коммит
git blame <файл>                           # кто и когда менял каждую строку
```

- В `--oneline` каждый коммит занимает одну строку: короткий хеш и сообщение. `--graph` рисует ветвление псевдографикой.
- Выход из просмотра истории: клавиша `q`.
- Чтобы не набирать длинную команду, создайте псевдоним: `git config --global alias.lg "log --oneline --graph --all --decorate"`, затем `git lg`.
- Файл `.gitignore` в корне репозитория перечисляет, что Git не отслеживает (например, `node_modules/`, `.env`, `dist/`). Секреты и ключи держите только там, не в коммитах.
