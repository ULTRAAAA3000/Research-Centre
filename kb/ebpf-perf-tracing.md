---
id: "ebpf-perf-tracing"
title: "Linux: трассировка через eBPF (bcc, bpftrace) и perf"
category: "linux"
tags: ["ebpf", "bcc", "bpftrace", "perf", "tracing", "profiling", "performance"]
sources:
  - title: "Руководство: Brendan Gregg — eBPF"
    url: "https://www.brendangregg.com/ebpf.html"
  - title: "Сайт: ebpf.io — что такое eBPF"
    url: "https://ebpf.io/"
  - title: "Репозиторий: iovisor/bcc (инструменты)"
    url: "https://github.com/iovisor/bcc"
  - title: "Репозиторий: bpftrace"
    url: "https://github.com/bpftrace/bpftrace"
  - title: "Офиц.: man perf"
    url: "https://man7.org/linux/man-pages/man1/perf.1.html"
  - title: "Форум: Stack Overflow — тег ebpf"
    url: "https://stackoverflow.com/questions/tagged/ebpf"
  - title: "Форум: Unix & Linux SE — вопросы по производительности"
    url: "https://unix.stackexchange.com/questions/tagged/performance"
  - title: "Хабр: свежие статьи про eBPF"
    url: "https://habr.com/ru/search/?q=ebpf&target_type=posts&order=date"
---

# eBPF и perf: трассировка в Linux

eBPF позволяет безопасно запускать небольшие программы в ядре и смотреть на систему без перезапуска приложений. Для практики хватает наборов bcc-tools и bpftrace, а `perf` показывает, где процесс тратит процессорное время. Нужны права root и достаточно новое ядро (рекомендуется 5.x и новее).

## Установка (Debian/Ubuntu)

```bash
sudo apt install bpfcc-tools bpftrace linux-tools-common linux-tools-generic linux-headers-$(uname -r)
```

- На Ubuntu и Debian инструменты bcc называются с суффиксом `-bpfcc` (`execsnoop-bpfcc`). В других дистрибутивах они лежат в `/usr/share/bcc/tools/` под обычными именами.

## bcc-tools

```bash
sudo execsnoop-bpfcc
sudo biolatency-bpfcc 10 1
sudo opensnoop-bpfcc -p $(pgrep nginx | head -n 1)
sudo syscount-bpfcc -p $(pgrep nginx | head -n 1)
```

- `execsnoop` показывает каждый запуск нового процесса (системный вызов `exec`) с аргументами. Он не трассирует все системные вызовы: полезен, чтобы найти, что порождает короткоживущие процессы.
- `biolatency 10 1` собирает гистограмму задержек блочного ввода-вывода за 10 секунд. Хвост справа значит медленные операции диска.
- `opensnoop` показывает открытие файлов процессом, `syscount` считает системные вызовы по типам.

## bpftrace: свой однострочник

```bash
sudo bpftrace -e 'tracepoint:syscalls:sys_enter_openat { printf("%s %s\n", comm, str(args->filename)); }'
```

- Пример печатает, какой процесс какой файл открывает. Это настоящая трассировка системного вызова `openat`.
- Остановка по `Ctrl+C`. На нагруженных системах подобные трассировки добавляют накладные расходы, не оставляйте их надолго.

## perf: профилирование процессора

```bash
sudo perf top -p $(pgrep nginx | head -n 1)
sudo perf record -F 99 -p $(pgrep nginx | head -n 1) -g -- sleep 30
sudo perf report
```

- `perf top` показывает горячие функции в реальном времени для процесса.
- `perf record -F 99 -g` пишет профиль 30 секунд с частотой 99 Гц и стеками вызовов, `perf report` разбирает результат.
- Без отладочных символов вместо имён функций будут адреса: установите `-dbgsym` или `-dbg` пакеты нужного ПО.
- Если команда пишет `perf_event_paranoid`, выполните с `sudo` или временно снизьте уровень: `sudo sysctl kernel.perf_event_paranoid=1`.
