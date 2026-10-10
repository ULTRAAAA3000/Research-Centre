---
id: "git-sync-github"
title: "4. Синхронизация с GitHub (pull, push, fetch)"
category: "git_github_guide"
tags: ["git", "github", "pull", "push", "fetch", "remote", "origin", "ssh", "token"]
sources:
  - title: "Офиц.: git pull"
    url: "https://git-scm.com/docs/git-pull"
  - title: "Офиц.: git push"
    url: "https://git-scm.com/docs/git-push"
  - title: "Офиц.: git fetch"
    url: "https://git-scm.com/docs/git-fetch"
  - title: "Офиц.: GitHub — подключение к GitHub по SSH"
    url: "https://docs.github.com/ru/authentication/connecting-to-github-with-ssh"
  - title: "Книга: Pro Git на русском"
    url: "https://git-scm.com/book/ru/v2"
  - title: "Форум: Stack Overflow — тег git"
    url: "https://stackoverflow.com/questions/tagged/git"
  - title: "Сообщество: Reddit r/git"
    url: "https://www.reddit.com/r/git/"
  - title: "Хабр: свежие статьи про GitHub"
    url: "https://habr.com/ru/search/?q=github%20git%20push%20pull&target_type=posts&order=date"
---

# Синхронизация с GitHub

Удалённый репозиторий (на GitHub) по умолчанию называется `origin`. Вы забираете оттуда чужие изменения (`pull`, `fetch`) и отправляете туда свои (`push`).

## Получение изменений

```bash
git remote -v                     # адреса удалённых репозиториев
git fetch                         # скачать изменения, ничего не меняя у вас
git pull                          # скачать и влить (fetch + merge)
git pull --rebase                 # скачать и перенести ваши коммиты сверху
git pull --autostash              # временно прячет ваши правки на время pull
```

- `git fetch` безопасен: он обновляет только данные об удалённых ветках, ваши файлы не трогает. Потом можно посмотреть различия: `git log HEAD..origin/main --oneline`.
- `git pull` при локальных незакоммиченных правках может отказать. Спрячьте их (`git stash`, затем `git pull`, затем `git stash pop`) или используйте `--autostash`.
- `git pull --rebase` даёт линейную историю без лишних коммитов слияния.

## Отправка изменений

```bash
git push origin <branch>          # отправить ветку на GitHub
git push -u origin <branch>       # то же и запомнить связь для будущих git push
git push                          # после -u достаточно этой команды
git push --force-with-lease       # принудительно, но только если никто не успел добавить своё
```

- Новая ветка при первом пуше создаётся на GitHub автоматически. После `-u` команды `git push` и `git pull` знают, с какой веткой работать.
- Обычный `push` отклоняется, если на GitHub есть коммиты, которых у вас нет: сделайте `git pull`, разрешите конфликты и повторите.
- Принудительный пуш (`--force`) перезаписывает историю на GitHub и может стереть чужую работу. Если после `rebase` или `--amend` он необходим, используйте `--force-with-lease` и никогда не делайте этого в общей ветке `main`.

## Подключение и вход

```bash
git remote add origin <URL>                    # привязать репозиторий GitHub
git remote set-url origin git@github.com:user/repo.git   # сменить адрес (на SSH)
ssh -T git@github.com                          # проверить вход по SSH
```

- GitHub не принимает пароль аккаунта при работе по HTTPS: нужен персональный токен доступа (PAT) или менеджер учётных данных. Удобнее вход по SSH-ключу (создание ключа описано в статье про SSH в разделе «Команды Linux / Ubuntu») или утилита GitHub CLI: `gh auth login`.
- Токен это пароль: не вставляйте его в команды, чаты и адреса удалённых репозиториев, давайте минимально нужные права и срок действия. Токен, который засветился, сразу удаляйте.
- Типичный рабочий цикл: `git switch -c feature/x`, правки, `git add .`, `git commit -m "..."`, `git push -u origin feature/x`, затем pull request на GitHub.
