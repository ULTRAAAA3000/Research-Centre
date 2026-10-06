---
id: "minio-s3-storage"
title: "MinIO и S3-совместимое хранилище: статус проекта, запуск, mc"
category: "devops"
tags: ["minio", "s3", "object-storage", "mc", "docker", "backup"]
sources:
  - title: "Офиц.: документация MinIO"
    url: "https://min.io/docs/minio/linux/index.html"
  - title: "Офиц.: клиент mc"
    url: "https://min.io/docs/minio/linux/reference/minio-mc.html"
  - title: "Репозиторий: minio/minio (заархивирован, только исходники)"
    url: "https://github.com/minio/minio"
  - title: "Статья: MinIO CE в 2026 — что изменилось и чем заменить"
    url: "https://dev.to/rosgluk/minio-ce-in-2026-retired-upstream-source-only-and-what-to-use-1k02"
  - title: "Форк: pgsty/minio — независимая сборка с образами"
    url: "https://vonng.com/en/db/minio-resurrect/"
  - title: "Форум: GitHub issue — образ MinIO больше не публикуется"
    url: "https://github.com/infiniflow/ragflow/issues/13840"
  - title: "Форум: Stack Overflow — тег minio"
    url: "https://stackoverflow.com/questions/tagged/minio"
  - title: "Хабр: свежие статьи про MinIO и S3"
    url: "https://habr.com/ru/search/?q=minio%20s3&target_type=posts&order=date"
---

# MinIO и S3-хранилище

MinIO это S3-совместимое объектное хранилище для бэкапов, артефактов и медиа. Важно: с октября 2025 года MinIO перестал публиковать готовые Docker-образы и бинарники для Community Edition, а репозиторий проекта заархивирован (только чтение). Пример из старых инструкций с образом `quay.io/minio/minio:RELEASE.<дата>` не заработает: такого тега нет или он устарел и не получает исправлений безопасности.

## Что делать с образом

Три рабочих пути, выберите по требованиям к безопасности и поддержке:

- Собрать образ самому из исходников (так описано в README проекта): `git clone https://github.com/minio/minio && cd minio && docker build -t myminio:minio .`. Вы сами отвечаете за обновления и CVE.
- Использовать независимый форк (например, `pgsty/minio` на Docker Hub). Это стороннее сопровождение: оцените доверие к автору и политику обновлений.
- Перейти на другое S3-совместимое хранилище, если проект новый и должен жить годами. Клиентские команды `mc` и AWS CLI работают с любым S3 API.

## Запуск одного узла (compose.yaml)

```yaml
services:
  minio:
    image: myminio:minio
    command: server /data --console-address ":9001"
    restart: unless-stopped
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"

volumes:
  minio_data:
```

- Это одиночный узел с одним диском, а не кластер. Для распределённого режима нужны несколько узлов и дисков (erasure coding).
- Логин и пароль берите из `.env` (файл не коммитьте). Пароль не короче 8 символов.
- Порт 9000 это S3 API, 9001 веб-консоль. Не открывайте их в интернет без TLS (обратный прокси с сертификатом).

## Клиент mc

```bash
mc alias set myminio https://s3.example.com ACCESS_KEY SECRET_KEY
mc mb myminio/db-backups
mc mirror --overwrite /var/backups myminio/db-backups
mc ls myminio/db-backups
```

- `mc alias set` сохраняет адрес и ключи. Ключи в командной строке попадают в историю shell: используйте отдельные ключи доступа с минимальными правами, а не root-пользователя.
- `mc mirror` синхронизирует локальную папку с бакетом, `--overwrite` перезаписывает изменившиеся объекты. Флаг `--remove` дополнительно удаляет в бакете то, чего нет локально, применяйте осторожно.
- Для локального теста адрес `http://localhost:9000`.
