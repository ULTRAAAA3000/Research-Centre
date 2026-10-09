---
id: "ubuntu-services-graphics"
title: "4. Системные службы и графика"
category: "ubuntu_commands"
tags: ["ubuntu", "systemctl", "service", "runlevel", "gdm3", "lightdm", "journalctl"]
sources:
  - title: "Офиц.: systemctl"
    url: "https://www.freedesktop.org/software/systemd/man/latest/systemctl.html"
  - title: "Офиц.: Ubuntu Server — документация"
    url: "https://documentation.ubuntu.com/server/"
  - title: "Вики: ArchWiki — systemd"
    url: "https://wiki.archlinux.org/title/Systemd"
  - title: "Форум: Ask Ubuntu — тег systemd"
    url: "https://askubuntu.com/questions/tagged/systemd"
  - title: "Форум: Unix & Linux SE — тег systemd"
    url: "https://unix.stackexchange.com/questions/tagged/systemd"
  - title: "Форум: Ubuntu Forums"
    url: "https://ubuntuforums.org/"
  - title: "Хабр: свежие статьи про systemd"
    url: "https://habr.com/ru/search/?q=systemd%20%D1%81%D0%BB%D1%83%D0%B6%D0%B1%D1%8B&target_type=posts&order=date"
---

# Системные службы и графика

## systemctl

```bash
systemctl list-unit-files                 # все службы и режим автозапуска
systemctl list-unit-files --type=service  # только службы
systemctl show <service>                  # все свойства службы
systemctl status <service>                # состояние и последние строки лога
sudo systemctl start <service>            # запустить
sudo systemctl stop <service>             # остановить
sudo systemctl restart <service>          # перезапустить
sudo systemctl enable --now <service>     # включить автозапуск и запустить
journalctl -u <service> -e                # журнал службы (с конца)
```

- `list-unit-files` показывает состояния `enabled`, `disabled`, `static`, `masked`. `enabled` значит автозапуск при загрузке.
- Свойства из `show` можно отфильтровать: `systemctl show <service> -p ActiveState,MainPID`.

## service: старый интерфейс

```bash
sudo service <service> start
sudo service <service> stop
sudo service <service> restart
service <service> status
service --status-all                      # состояние всех служб
```

- В Ubuntu с версии 15.04 вместо Upstart используется systemd, а `service` осталась совместимой обёрткой и внутри вызывает `systemctl`.

## Уровни запуска

```bash
runlevel                                  # старый уровень запуска
systemctl get-default                     # цель загрузки по умолчанию
systemctl list-units --type=target        # активные цели
sudo systemctl isolate multi-user.target  # перейти в текстовый режим
```

- Соответствие: runlevel 3 примерно `multi-user.target`, runlevel 5 примерно `graphical.target`.
- `isolate multi-user.target` закрывает графическую сессию: сохраните работу.

## Графическая оболочка

```bash
cat /etc/X11/default-display-manager      # какой менеджер входа используется
sudo systemctl restart gdm3               # Ubuntu с GNOME
sudo service lightdm restart              # системы с LightDM
```

- Перезапуск менеджера входа закрывает все графические программы и сеанс. Выполняйте, когда экран завис, а в текстовой консоли (Ctrl+Alt+F3) вы можете работать.
- LightDM стоит не во всех выпусках (например, в Xubuntu, Lubuntu). В Ubuntu с GNOME это `gdm3`.
- Сочетание Ctrl+Alt+Backspace для перезапуска X-сервера в современных Ubuntu по умолчанию отключено, а в сеансах Wayland X-сервера нет. Запасной путь: Ctrl+Alt+F3, вход в консоли и `sudo systemctl restart gdm3`. Если не отвечает вообще, помогает безопасная последовательность Alt+SysRq и клавиш R E I S U B (нужна включённая SysRq).
