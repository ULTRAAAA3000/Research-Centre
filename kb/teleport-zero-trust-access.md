---
id: "teleport-zero-trust-access"
title: "Teleport: безопасный доступ к серверам вместо открытого SSH"
category: "security"
tags: ["teleport", "zero-trust", "bastion", "ssh", "tsh", "boundary"]
sources:
  - title: "Офиц.: документация Teleport"
    url: "https://goteleport.com/docs/"
  - title: "Репозиторий: gravitational/teleport"
    url: "https://github.com/gravitational/teleport"
  - title: "Форум: Teleport GitHub Discussions"
    url: "https://github.com/gravitational/teleport/discussions"
  - title: "Альтернатива: HashiCorp Boundary"
    url: "https://developer.hashicorp.com/boundary/docs"
  - title: "Сообщество: Reddit r/devops"
    url: "https://www.reddit.com/r/devops/"
  - title: "Хабр: свежие статьи про Teleport"
    url: "https://habr.com/ru/search/?q=teleport%20ssh%20%D0%B4%D0%BE%D1%81%D1%82%D1%83%D0%BF&target_type=posts&order=date"
---

# Teleport

Teleport заменяет раздачу SSH-ключей и открытые порты 22: пользователь входит через единый логин (в том числе SSO), получает короткоживущий сертификат и подключается к серверам через прокси. Все сессии журналируются и могут записываться. Альтернатива от HashiCorp называется Boundary. Перед внедрением проверьте условия лицензии вашей редакции Teleport.

## Подключение узла

На сервере доступа (auth/proxy) создайте токен для нового узла:

```bash
tctl tokens add --type=node --ttl=1h
```

Конфиг узла (/etc/teleport.yaml):

```yaml
version: v3
teleport:
  nodename: node-01
  proxy_server: teleport.example.com:443
  join_params:
    method: token
    token_name: <TOKEN>
ssh_service:
  enabled: true
auth_service:
  enabled: false
proxy_service:
  enabled: false
```

```bash
sudo teleport start --config=/etc/teleport.yaml
sudo systemctl enable --now teleport
```

- Токен одноразовый по смыслу и короткоживущий (`--ttl`): создавайте новый для каждого узла и не храните в репозитории.
- Узел сам подключается к прокси (исходящее соединение), поэтому входящий порт 22 из интернета можно закрыть.
- Если Teleport установлен пакетом, юнит `teleport` читает `/etc/teleport.yaml` по умолчанию, и тогда достаточно `systemctl`.

## Работа пользователя

```bash
tsh login --proxy=teleport.example.com --user=alice
tsh ls
tsh ssh user@node-01.internal
tsh ssh -L 5433:127.0.0.1:5432 user@node-01.internal
tsh logout
```

- `tsh login` открывает вход (пароль, SSO, второй фактор) и выдаёт временный сертификат. После срока действия нужно войти заново.
- `tsh ls` показывает серверы, к которым у вас есть доступ по ролям.
- Права задаются ролями (`tctl create -f role.yaml`): какие метки узлов и логины Unix разрешены.
- Записи сессий и аудит смотрите в веб-интерфейсе Teleport, это удобно для расследований.
