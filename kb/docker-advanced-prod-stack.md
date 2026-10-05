---
id: "docker-advanced-prod-stack"
title: "Docker: диагностика, очистка и продакшен-стек Compose"
category: "devops"
tags: ["docker", "docker-compose", "postgres", "redis", "healthcheck", "troubleshooting"]
sources:
  - title: "Офиц.: docker system prune"
    url: "https://docs.docker.com/reference/cli/docker/system/prune/"
  - title: "Офиц.: Compose — services (healthcheck, depends_on)"
    url: "https://docs.docker.com/reference/compose-file/services/"
  - title: "Офиц.: docker stats"
    url: "https://docs.docker.com/reference/cli/docker/container/stats/"
  - title: "Форум: Docker Community Forums"
    url: "https://forums.docker.com/"
  - title: "Форум: Stack Overflow — тег docker"
    url: "https://stackoverflow.com/questions/tagged/docker"
  - title: "Сообщество: Reddit r/docker"
    url: "https://www.reddit.com/r/docker/"
  - title: "Хабр: свежие статьи про Docker"
    url: "https://habr.com/ru/search/?q=docker&target_type=posts&order=date"
---

# Docker: диагностика и продакшен-стек

Команды для очистки и диагностики Docker, а также пример стека из приложения, PostgreSQL и Redis с healthcheck. Перед очисткой проверяйте, что именно будет удалено.

## Очистка и диагностика

```bash
docker system prune -a --volumes -f
docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"
docker top <container_name_or_id>
docker cp container_id:/var/log/nginx/access.log ./access.log
```

- `prune -a --volumes -f` необратимо удаляет все неиспользуемые образы, остановленные контейнеры, сети, кэш сборки и тома без контейнеров, причём без подтверждения (`-f`). Сначала запустите без `-f` и прочитайте список.
- Том, к которому сейчас не подключён ни один контейнер, считается неиспользуемым: так можно потерять данные остановленной базы.
- `docker stats` показывает CPU, RAM и ввод-вывод в реальном времени, `docker top` показывает процессы внутри контейнера.

## Продакшен docker-compose.yml

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://pguser:pgpass@db:5432/appdb
      REDIS_URL: redis://cache:6379
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started
    networks:
      - backend
    deploy:
      resources:
        limits:
          cpus: "1.5"
          memory: 1024M

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: appdb
      POSTGRES_USER: pguser
      POSTGRES_PASSWORD: pgpass
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pguser -d appdb"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend

  cache:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --save 60 1 --loglevel warning
    networks:
      - backend

volumes:
  postgres_data:

networks:
  backend:
    driver: bridge
```

- Поле `version:` в современном Compose не нужно и вызывает предупреждение, поэтому в примере его нет.
- Пароли в файле это пример. В реальном проекте берите их из `.env` или Docker secrets и не коммитьте в репозиторий.
- `depends_on` с `service_healthy` ждёт, пока `pg_isready` не вернёт успех, а не просто запуска контейнера.
- Лимиты в `deploy.resources` работают в Compose v2 и без Swarm.
