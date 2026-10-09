---
id: "ubuntu-privileges-security"
title: "1. Привилегии и безопасность (sudo, passwd)"
category: "ubuntu_commands"
tags: ["ubuntu", "sudo", "passwd", "visudo", "root", "pkexec", "безопасность"]
sources:
  - title: "Офиц.: документация sudo"
    url: "https://www.sudo.ws/docs/man/sudo.man/"
  - title: "Офиц.: Ubuntu — RootSudo (почему root отключён)"
    url: "https://help.ubuntu.com/community/RootSudo"
  - title: "Офиц.: Ubuntu — страницы руководств"
    url: "https://manpages.ubuntu.com/"
  - title: "Форум: Ask Ubuntu — тег sudo"
    url: "https://askubuntu.com/questions/tagged/sudo"
  - title: "Форум: Unix & Linux SE — тег sudo"
    url: "https://unix.stackexchange.com/questions/tagged/sudo"
  - title: "Форум: Ubuntu Discourse"
    url: "https://discourse.ubuntu.com/"
  - title: "Хабр: свежие статьи про sudo"
    url: "https://habr.com/ru/search/?q=sudo%20linux&target_type=posts&order=date"
---

# Привилегии и безопасность

В Ubuntu учётная запись root по умолчанию заблокирована, а административные действия выполняются через `sudo`: команда запускается с правами суперпользователя после ввода вашего пароля. Ниже команды из шпаргалки и современные замены устаревшего.

## sudo

```bash
sudo <command>            # выполнить команду с правами root
sudo -s                   # оболочка root (окружение текущего пользователя)
sudo -i                   # полноценная оболочка root (окружение root)
sudo -u <user> -s         # оболочка от имени другого пользователя
sudo -u <user> <command>  # одна команда от имени пользователя
sudo -k                   # сбросить запомненный пароль sudo
sudo -l                   # что вам разрешено выполнять через sudo
sudo visudo               # безопасное редактирование /etc/sudoers
```

- `sudo -s -u <user>` равнозначно `sudo -u <user> -s`: порядок ключей не важен.
- После ввода пароля sudo запоминает его на 15 минут. `sudo -k` сбрасывает запись, и следующий вызов снова спросит пароль.
- `visudo` проверяет синтаксис перед сохранением: ошибка в `/etc/sudoers`, записанная обычным редактором, может лишить вас sudo. Свои правила лучше держать отдельными файлами: `sudo visudo -f /etc/sudoers.d/myrules`.
- Не работайте постоянно в `sudo -s` или `sudo -i`: выход из оболочки root (`exit`) возвращает к обычным правам.

## Пароли

```bash
passwd                    # сменить свой пароль
sudo passwd <user>        # сменить пароль другого пользователя
sudo passwd -l <user>     # заблокировать вход по паролю
sudo passwd -u <user>     # разблокировать
sudo passwd -S <user>     # состояние пароля
```

- Пароль другого пользователя может менять только root (через `sudo`).

## Графические программы с правами root

`gksudo` и `kdesudo` устарели: пакет gksu удалён из современных выпусков Ubuntu. Вместо них:

```bash
pkexec <приложение>       # запрос пароля через polkit (нужен полный путь)
sudo -e /etc/hosts        # правка системного файла своим редактором (sudoedit)
```

- Не запускайте графические программы через `sudo`: файлы в вашем домашнем каталоге могут стать принадлежащими root, и позже вы не сможете их изменить.
- Для правки системных файлов используйте `sudoedit` (`sudo -e`): редактор запускается от вашего имени, а запись выполняется с правами root.
