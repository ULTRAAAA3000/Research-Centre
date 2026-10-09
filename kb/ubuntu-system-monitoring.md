---
id: "ubuntu-system-monitoring"
title: "7. Мониторинг и информация о системе"
category: "ubuntu_commands"
tags: ["ubuntu", "uname", "inxi", "df", "fdisk", "lspci", "lsusb", "uptime", "shutdown", "мониторинг"]
sources:
  - title: "Офиц.: ядро — файловая система /proc"
    url: "https://docs.kernel.org/filesystems/proc.html"
  - title: "Офиц.: man proc(5)"
    url: "https://man7.org/linux/man-pages/man5/proc.5.html"
  - title: "Офиц.: документация inxi"
    url: "https://smxi.org/docs/inxi.htm"
  - title: "Руководство: Brendan Gregg — Linux Performance"
    url: "https://www.brendangregg.com/linuxperf.html"
  - title: "Форум: Ask Ubuntu — тег system-information"
    url: "https://askubuntu.com/questions/tagged/system-information"
  - title: "Форум: Unix & Linux SE — тег hardware"
    url: "https://unix.stackexchange.com/questions/tagged/hardware"
  - title: "Сообщество: Reddit r/Ubuntu"
    url: "https://www.reddit.com/r/Ubuntu/"
  - title: "Хабр: свежие статьи про мониторинг Linux"
    url: "https://habr.com/ru/search/?q=linux%20%D0%BC%D0%BE%D0%BD%D0%B8%D1%82%D0%BE%D1%80%D0%B8%D0%BD%D0%B3%20%D1%81%D0%B8%D1%81%D1%82%D0%B5%D0%BC%D1%8B&target_type=posts&order=date"
---

# Мониторинг и информация о системе

## Система и оборудование

```bash
uname -a                     # ядро, архитектура, имя хоста
lsb_release -a               # версия Ubuntu
inxi -F                      # полный отчёт (sudo apt install inxi)
lscpu                        # процессор кратко
cat /proc/cpuinfo            # процессор подробно, по ядрам
free -h                      # память кратко
cat /proc/meminfo            # память подробно
lspci -tv                    # PCI-устройства деревом
lsusb -tv                    # USB-устройства деревом
```

- `lscpu` и `free -h` читаются легче, чем `/proc/cpuinfo` и `/proc/meminfo`. Эти файлы удобны для скриптов.
- В `free` смотрите столбец `available`: это память, доступная приложениям с учётом кэша. Большой `buff/cache` проблемой не является.

## Диски

```bash
df -h                        # занято и свободно на смонтированных дисках
lsblk                        # диски и разделы деревом
sudo fdisk -l                # диски и таблицы разделов
du -sh <path>                # размер каталога
```

- `fdisk -l` требует `sudo` и только показывает: ничего не меняет, пока вы не откроете диск в интерактивном режиме `fdisk /dev/...`.
- Если `df` показывает 100%, ищите крупные каталоги: `sudo du -xh / --max-depth=1 | sort -h`.

## Время работы и выключение

```bash
uptime                       # время работы и нагрузка (load average)
uptime -p                    # время работы словами
sudo shutdown -h now         # выключить сейчас
sudo shutdown -r now         # перезагрузить сейчас
sudo shutdown -h +10         # выключить через 10 минут
sudo shutdown -c             # отменить запланированное выключение
```

- Три числа load average это средняя нагрузка за 1, 5 и 15 минут. Сравнивайте их с числом ядер (`nproc`): значение выше числа ядер значит, что система перегружена.
- Для `shutdown` нужны права root, поэтому в примерах стоит `sudo`.
