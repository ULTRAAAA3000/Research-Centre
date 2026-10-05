---
id: "linux-perf-network-diagnostics"
title: "Linux: диагностика сети, диска и памяти"
category: "linux"
tags: ["performance", "ss", "tcpdump", "dig", "iotop", "memory", "troubleshooting"]
sources:
  - title: "Руководство: Brendan Gregg — Linux Performance"
    url: "https://www.brendangregg.com/linuxperf.html"
  - title: "Офиц.: man ss"
    url: "https://man7.org/linux/man-pages/man8/ss.8.html"
  - title: "Офиц.: man tcpdump"
    url: "https://www.tcpdump.org/manpages/tcpdump.1.html"
  - title: "Вики: ArchWiki — Improving performance"
    url: "https://wiki.archlinux.org/title/Improving_performance"
  - title: "Форум: Unix & Linux SE — тег performance"
    url: "https://unix.stackexchange.com/questions/tagged/performance"
  - title: "Форум: Server Fault — вопросы по Linux"
    url: "https://serverfault.com/questions/tagged/linux"
  - title: "Хабр: диагностика производительности Linux"
    url: "https://habr.com/ru/search/?q=linux%20%D0%BF%D1%80%D0%BE%D0%B8%D0%B7%D0%B2%D0%BE%D0%B4%D0%B8%D1%82%D0%B5%D0%BB%D1%8C%D0%BD%D0%BE%D1%81%D1%82%D1%8C&target_type=posts&order=date"
---

# Linux: диагностика сети, диска и памяти

Быстрые команды для поиска узкого места: сокеты и соединения, трафик, DNS, нагрузка на диск и расход памяти. Большинство команд требует `sudo`, а `nethogs`, `iotop` и `ncdu` ставятся отдельно (`apt install nethogs iotop ncdu`).

## Сеть и сокеты

```bash
sudo ss -tulpn
sudo nethogs eth0
sudo tcpdump -i eth0 -nn -s0 port 443 -w capture.pcap
dig example.com A @1.1.1.1
dig +trace example.com
```

- `ss -tulpn` показывает слушающие TCP и UDP порты с именами процессов.
- `nethogs` показывает трафик по процессам в реальном времени.
- `tcpdump -w` пишет дамп в файл, который можно открыть в Wireshark. Для ограничения размера добавьте `-c 1000` или `-G`.
- `dig +trace` проходит цепочку DNS от корня и сам выбирает серверы, поэтому `@сервер` вместе с ним не используется. Запрос типа `ANY` многие серверы не обслуживают, лучше запрашивать конкретный тип (`A`, `AAAA`, `MX`, `TXT`).

## Диск и память

```bash
sudo iotop -oPa
sudo ncdu /var
free -h -t
ps aux --sort=-%mem | head -n 11
cat /proc/buddyinfo
```

- `iotop -oPa` показывает только процессы, которые реально пишут или читают, с накопленным итогом.
- `ncdu` строит интерактивное дерево размеров каталогов.
- `free -h -t` показывает занятую и кэшированную память. Большой `buff/cache` не проблема: ядро отдаст его приложениям. Следите за столбцом `available`.
- Фрагментацию памяти смотрите в `/proc/buddyinfo` (количество свободных блоков по размерам).
- Если процессы в `D`-состоянии копятся и `iowait` высокий, ищите причину в диске (`iostat -x 1`).
