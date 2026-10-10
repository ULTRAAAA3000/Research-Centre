---
id: "git-branches"
title: "3. Ветки (branch, switch, merge)"
category: "git_github_guide"
tags: ["git", "github", "branch", "switch", "checkout", "merge", "rebase", "конфликты"]
sources:
  - title: "Офиц.: git branch"
    url: "https://git-scm.com/docs/git-branch"
  - title: "Офиц.: git switch"
    url: "https://git-scm.com/docs/git-switch"
  - title: "Офиц.: git merge"
    url: "https://git-scm.com/docs/git-merge"
  - title: "Книга: Pro Git на русском"
    url: "https://git-scm.com/book/ru/v2"
  - title: "Тренажёр: Learn Git Branching"
    url: "https://learngitbranching.js.org/?locale=ru_RU"
  - title: "Форум: Stack Overflow — тег git"
    url: "https://stackoverflow.com/questions/tagged/git"
  - title: "Сообщество: Reddit r/git"
    url: "https://www.reddit.com/r/git/"
  - title: "Хабр: свежие статьи про ветки Git"
    url: "https://habr.com/ru/search/?q=git%20%D0%B2%D0%B5%D1%82%D0%BA%D0%B8%20merge%20rebase&target_type=posts&order=date"
---

# Ветки

Ветка это независимая линия разработки: в ней можно пробовать новое, не трогая основную ветку (`main`). Когда работа готова, ветку вливают обратно.

## Создание и переключение

```bash
git branch                        # список локальных веток (звёздочка у текущей)
git branch -a                     # все ветки, включая удалённые
git branch -vv                    # ветки с последним коммитом и отслеживаемой веткой
git checkout -b <name>            # создать ветку и переключиться на неё
git switch -c <name>              # то же, современная команда
git switch <name>                 # переключиться на существующую ветку
```

- `git switch` и `git restore` появились, чтобы разделить две роли старого `git checkout` (переключение веток и откат файлов). `git checkout -b` по-прежнему работает.
- Перед переключением закоммитьте или спрячьте изменения (`git stash`), иначе Git может отказать или перенести правки в другую ветку.
- Называйте ветки по задаче: `feature/login`, `fix/api-timeout`.

## Слияние

```bash
git switch main                   # перейти в ветку, КУДА вливаем
git merge <name>                  # влить ветку <name> в текущую
git merge --no-ff <name>          # всегда создавать отдельный коммит слияния
git rebase main                   # перенести свои коммиты поверх свежей main
```

- `merge` сохраняет историю как есть и создаёт коммит слияния. `rebase` переписывает коммиты ветки так, будто вы начали от свежего `main`: история линейнее, но коммиты получают новые хеши. Не делайте `rebase` уже опубликованных веток, над которыми работают другие.
- Если Git не смог слить автоматически, он остановится с сообщением о **конфликте**. Откройте указанные файлы, найдите метки `<<<<<<<`, `=======`, `>>>>>>>`, оставьте нужный вариант и удалите метки. Затем `git add <файл>` и `git commit` (при `rebase`: `git rebase --continue`). Отменить слияние: `git merge --abort`.

## Переименование и удаление

```bash
git branch -m <новое-имя>         # переименовать текущую ветку
git branch -d <name>              # удалить ветку, уже влитую в текущую
git branch -D <name>              # удалить ветку принудительно (теряются коммиты!)
git push origin --delete <name>   # удалить ветку на GitHub
```

- `-d` безопасна: откажется удалять ветку с непринятыми коммитами. `-D` удаляет всё, поэтому используйте её, только если уверены.
- Влитые ветки удаляйте, чтобы список не разрастался.
