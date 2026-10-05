---
id: "vless-reality-setup"
title: "Настройка VLESS Reality (Xray)"
category: "networking"
tags: ["vless", "xray", "vpn", "proxy", "reality"]
sources:
  - title: "Официальный репозиторий Xray-core"
    url: "https://github.com/XTLS/Xray-core"
  - title: "Документация Project X"
    url: "https://xtls.github.io/"
  - title: "Репозиторий: XTLS/Xray-examples (готовые конфиги)"
    url: "https://github.com/XTLS/Xray-examples"
  - title: "Форум: Xray-core Discussions"
    url: "https://github.com/XTLS/Xray-core/discussions"
  - title: "Хабр: свежие статьи про VLESS и Reality"
    url: "https://habr.com/ru/search/?q=vless%20reality&target_type=posts&order=date"
---

# Настройка VLESS Reality

VLESS Reality — транспорт Xray, который маскирует соединение под TLS-рукопожатие с реальным сайтом (`dest`) и не требует собственного сертификата. Для работы нужны UUID клиента, пара ключей x25519 и короткий идентификатор (shortId).

## Генерация параметров

```bash
xray uuid
xray x25519
openssl rand -hex 8
```

## Серверный конфиг (inbound)

```json
{
  "inbounds": [
    {
      "port": 443,
      "protocol": "vless",
      "settings": {
        "clients": [{ "id": "<UUID>", "flow": "xtls-rprx-vision" }],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "dest": "www.microsoft.com:443",
          "serverNames": ["www.microsoft.com"],
          "privateKey": "<PRIVATE_KEY>",
          "shortIds": ["<SHORT_ID>"]
        }
      }
    }
  ],
  "outbounds": [{ "protocol": "freedom" }]
}
```

## Проверка и перезапуск

```bash
xray run -test -config /usr/local/etc/xray/config.json
sudo systemctl restart xray
sudo systemctl status xray
```

- `privateKey` остаётся на сервере, клиенту передаётся только `publicKey`.
- В `dest` выбирайте сайт с TLS 1.3 и HTTP/2, не заблокированный в вашем регионе.
