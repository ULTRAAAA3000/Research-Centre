---
id: "ubuntu-ssh-download-diagnostics"
title: "3. SSH, скачивание и диагностика"
category: "ubuntu_commands"
tags: ["ubuntu", "ssh", "ssh-keygen", "ssh-copy-id", "wget", "whois", "dig", "tcpdump"]
sources:
  - title: "Офиц.: man ssh (OpenBSD)"
    url: "https://man.openbsd.org/ssh"
  - title: "Офиц.: man ssh-keygen (OpenBSD)"
    url: "https://man.openbsd.org/ssh-keygen"
  - title: "Офиц.: Ubuntu — SSH-ключи"
    url: "https://help.ubuntu.com/community/SSH/OpenSSH/Keys"
  - title: "Офиц.: руководство GNU Wget"
    url: "https://www.gnu.org/software/wget/manual/wget.html"
  - title: "Офиц.: man tcpdump"
    url: "https://www.tcpdump.org/manpages/tcpdump.1.html"
  - title: "Форум: Ask Ubuntu — тег ssh"
    url: "https://askubuntu.com/questions/tagged/ssh"
  - title: "Форум: Unix & Linux SE — тег ssh"
    url: "https://unix.stackexchange.com/questions/tagged/ssh"
  - title: "Хабр: свежие статьи про SSH"
    url: "https://habr.com/ru/search/?q=ssh%20%D0%BA%D0%BB%D1%8E%D1%87%D0%B8&target_type=posts&order=date"
---

# SSH, скачивание и диагностика

## SSH: ключи и подключение

```bash
ssh-keygen -t ed25519 -C "my-laptop"            # создать пару ключей Ed25519
ssh-keygen -t rsa -b 4096                       # RSA, если нужна совместимость
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@host  # скопировать ключ на сервер
ssh -v user@host                                # подключение с отладкой
ssh -vvv user@host                              # самая подробная отладка
ssh -i ~/.ssh/id_ed25519 -p 2222 user@host      # свой ключ и порт
```

- `ssh-keygen` создаёт два файла: приватный (`id_ed25519`) и публичный (`id_ed25519.pub`). Передавать и копировать на сервер можно только публичный. Приватный не показывайте никому.
- Ed25519 короче и надёжнее старых RSA-ключей. Задавайте парольную фразу (passphrase) при создании ключа.
- В исходной шпаргалке указан `id_rsa.pub`: подставьте имя файла того ключа, который создали.
- Если вход по ключу не работает, проверьте права: `chmod 700 ~/.ssh` и `chmod 600 ~/.ssh/authorized_keys` на сервере, и запустите `ssh -v` для разбора.

## Скачивание и информация о домене

```bash
wget <URL>                       # скачать файл
wget -c <URL>                    # докачать после обрыва
wget -O name.zip <URL>           # сохранить под своим именем
whois example.com                # регистрационные данные домена
dig example.com                  # DNS-записи (по умолчанию A)
dig +short example.com MX        # коротко: почтовые серверы
dig @1.1.1.1 example.com         # запрос к конкретному DNS-серверу
```

- Если команд нет: `sudo apt install whois dnsutils` (в `dnsutils` находится `dig`).
- `dig` показывает, что именно ответил DNS-сервер: удобно для диагностики, когда сайт «не открывается».

## tcpdump: перехват трафика

```bash
sudo tcpdump -i any -nn tcp port 80            # HTTP-трафик на всех интерфейсах
sudo tcpdump -i eth0 -nn host 10.0.0.5         # трафик конкретного узла
sudo tcpdump -i eth0 -w web.pcap tcp port 80   # записать в файл для Wireshark
```

- `tcpdump` требует прав root. `-nn` отключает разрешение имён (быстрее и нагляднее), `-i any` слушает все интерфейсы.
- Порт 80 это обычный HTTP, содержимое видно. HTTPS (порт 443) зашифрован: видны только адреса и размеры пакетов.
- Перехватывайте трафик только в своих сетях и на своих устройствах.
