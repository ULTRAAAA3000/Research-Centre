---
id: "docker-compose"
title: "Docker Compose: запуск многоконтейнерных приложений"
category: "devops"
tags: ["docker", "docker-compose", "compose", "yaml"]
sources:
  - title: "Docker Compose overview"
    url: "https://docs.docker.com/compose/"
  - title: "Compose file reference"
    url: "https://docs.docker.com/reference/compose-file/"
---

# Docker Compose

Compose описывает стек из нескольких контейнеров одним файлом `compose.yaml` и управляется командой `docker compose`.

## Пример compose.yaml

```yaml
services:
  web:
    image: nginx:stable
    ports:
      - "8080:80"
    depends_on:
      - db
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: example
    volumes:
      - dbdata:/var/lib/postgresql/data

volumes:
  dbdata:
```

## Управление стеком

```bash
docker compose up -d
docker compose ps
docker compose logs -f web
docker compose down
docker compose down -v
```

- `down -v` удаляет и тома: данные базы будут потеряны.
- Современная команда пишется через пробел: `docker compose`, а не `docker-compose`.
