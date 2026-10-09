---
id: "ubuntu-apt-dpkg"
title: "8. Управление пакетами (APT и DPKG)"
category: "ubuntu_commands"
tags: ["ubuntu", "apt", "apt-get", "dpkg", "пакеты", "deb", "autoremove", "purge"]
sources:
  - title: "Офиц.: Ubuntu — AptGet/Howto"
    url: "https://help.ubuntu.com/community/AptGet/Howto"
  - title: "Вики: Debian Wiki — Apt"
    url: "https://wiki.debian.org/Apt"
  - title: "Офиц.: Debian Reference — управление пакетами"
    url: "https://www.debian.org/doc/manuals/debian-reference/ch02.en.html"
  - title: "Офиц.: Ubuntu — страницы руководств"
    url: "https://manpages.ubuntu.com/"
  - title: "Форум: Ask Ubuntu — тег apt"
    url: "https://askubuntu.com/questions/tagged/apt"
  - title: "Форум: Ask Ubuntu — тег dpkg"
    url: "https://askubuntu.com/questions/tagged/dpkg"
  - title: "Форум: Ubuntu Forums"
    url: "https://ubuntuforums.org/"
  - title: "Хабр: свежие статьи про apt и dpkg"
    url: "https://habr.com/ru/search/?q=apt%20dpkg%20ubuntu&target_type=posts&order=date"
---

# Управление пакетами: APT и DPKG

APT работает с репозиториями и сам разрешает зависимости, а `dpkg` устанавливает отдельные `.deb`-файлы и зависимости не подтягивает. Команда `apt` это более удобный интерфейс для интерактивной работы (`sudo apt update`, `sudo apt install ...`), а `apt-get` лучше подходит для скриптов.

## Основные операции

```bash
sudo apt-get update                  # обновить списки пакетов
sudo apt-get upgrade                 # обновить установленные пакеты
sudo apt-get install <pkg>           # установить пакет
sudo apt-get purge <pkg>             # удалить пакет вместе с настройками
sudo apt-get autoremove              # удалить ненужные зависимости
apt list --upgradable                # что можно обновить
apt-cache policy <pkg>               # версии пакета и источники
```

- `update` не обновляет программы, он только скачивает свежие списки пакетов. Обычно его выполняют перед `upgrade` или `install`.
- `remove` оставляет файлы настроек, а `purge` удаляет и их.
- `upgrade` не удаляет и не ставит новые пакеты. Если обновлению нужно изменить набор пакетов (например, новое ядро с зависимостями), используйте `sudo apt-get dist-upgrade` или `sudo apt full-upgrade`.
- Перед `autoremove` посмотрите, что будет удалено: команда спросит подтверждение.

## dpkg и исправление зависимостей

```bash
sudo dpkg -i pkg.deb                 # установить .deb вручную
sudo apt install ./pkg.deb           # установить .deb сразу с зависимостями
sudo dpkg --configure -a             # дозавершить прерванную настройку
sudo apt-get -f install              # починить сломанные зависимости
dpkg -l | grep <имя>                 # установлен ли пакет
dpkg -L <pkg>                        # какие файлы ставит пакет
dpkg -S /path/to/file                # какому пакету принадлежит файл
sudo apt-mark hold <pkg>             # запретить обновление пакета
```

- `dpkg -i` не скачивает зависимости. Если установка остановилась с ошибкой, выполните `sudo apt-get -f install`, либо сразу ставьте через `sudo apt install ./pkg.deb`.
- При ошибке `Could not get lock /var/lib/dpkg/lock-frontend` в системе уже работает другой apt (например, автообновления). Дождитесь его окончания. Файл блокировки не удаляйте вручную.
- После прерванного обновления порядок такой: `sudo dpkg --configure -a`, затем `sudo apt-get -f install`.
- `apt-mark hold` удобен, когда нужно зафиксировать версию (например, ядра или драйвера). Снять: `sudo apt-mark unhold <pkg>`.
