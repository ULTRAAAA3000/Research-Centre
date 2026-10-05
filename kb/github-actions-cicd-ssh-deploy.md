---
id: "github-actions-cicd-ssh-deploy"
title: "GitHub Actions: сборка Docker-образа и деплой по SSH"
category: "devops"
tags: ["github-actions", "ci-cd", "docker", "ghcr", "ssh", "deploy"]
sources:
  - title: "Офиц.: GitHub Actions — документация"
    url: "https://docs.github.com/en/actions"
  - title: "Офиц.: Docker — build в GitHub Actions"
    url: "https://docs.docker.com/build/ci/github-actions/"
  - title: "Репозиторий: appleboy/ssh-action"
    url: "https://github.com/appleboy/ssh-action"
  - title: "Форум: GitHub Community Discussions"
    url: "https://github.com/orgs/community/discussions"
  - title: "Форум: Stack Overflow — тег github-actions"
    url: "https://stackoverflow.com/questions/tagged/github-actions"
  - title: "Сообщество: Reddit r/devops"
    url: "https://www.reddit.com/r/devops/"
  - title: "Хабр: свежие статьи про GitHub Actions"
    url: "https://habr.com/ru/search/?q=github%20actions&target_type=posts&order=date"
---

# GitHub Actions: Docker и деплой по SSH

Рабочий процесс: при пуше в `main` собрать образ, отправить его в GitHub Container Registry (GHCR) и обновить стек на сервере по SSH. Секреты (`SERVER_HOST`, `SERVER_USER`, `SSH_PRIVATE_KEY`) добавляются в Settings → Secrets and variables → Actions.

## Workflow (.github/workflows/deploy.yml)

```yaml
name: Production CI/CD Pipeline

on:
  push:
    branches: [ main ]

permissions:
  contents: read
  packages: write

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GitHub Container Registry (GHCR)
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and Push Docker Image
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository }}/app:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Deploy to Remote Production Server via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          port: 2222
          script: |
            docker pull ghcr.io/${{ github.repository }}/app:latest
            docker compose -f /opt/app/docker-compose.yml up -d --remove-orphans
            docker system prune -f
```

- Блок `permissions` с `packages: write` нужен, чтобы `GITHUB_TOKEN` мог отправлять образ в GHCR.
- Имя образа в GHCR должно быть строчным. Если в логине или названии репозитория есть заглавные буквы (например, `ULTRAAAA3000`), сборка упадёт. Приведите имя к нижнему регистру, например, `tags: ghcr.io/ultraaaa3000/research-centre/app:latest`.
- Сервер должен иметь доступ к GHCR: `docker login ghcr.io` с токеном PAT (`read:packages`), если пакет приватный.
- Ключ для деплоя заведите отдельный (`ssh-keygen -t ed25519`), публичную часть положите в `~/.ssh/authorized_keys` пользователя деплоя.
- Версии экшенов указывайте мажорными тегами (`@v4`, `@v1`) или хешем коммита для максимальной безопасности цепочки поставки.
- Тег `latest` удобен, но откат сложнее. Добавьте тег с `${{ github.sha }}`.
