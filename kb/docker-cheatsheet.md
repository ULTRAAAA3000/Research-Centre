---
id: "docker-cheatsheet"
title: "Docker: шпаргалка по основным командам"
category: "devops"
tags: ["docker", "containers", "cli"]
sources:
  - title: "Docker CLI reference"
    url: "https://docs.docker.com/reference/cli/docker/"
  - title: "Docker Docs"
    url: "https://docs.docker.com/"
---

# Docker: шпаргалка

Базовые команды для работы с образами и контейнерами.

## Запуск и просмотр

```bash
docker run -d --name web -p 8080:80 nginx
docker ps -a
docker logs -f --tail 100 web
docker exec -it web sh
```

## Остановка и очистка

```bash
docker stop web && docker rm web
docker image prune -a
docker system prune --volumes
```

## Образы

```bash
docker build -t myapp:1.0 .
docker images
docker pull alpine:3.20
docker tag myapp:1.0 registry.example.com/myapp:1.0
docker push registry.example.com/myapp:1.0
```

- `-d` запускает контейнер в фоне, `-p host:container` пробрасывает порт.
- `docker system prune --volumes` удаляет в том числе неиспользуемые тома: проверяйте перед запуском.
