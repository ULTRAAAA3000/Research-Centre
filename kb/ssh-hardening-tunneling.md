---
id: "ssh-hardening-tunneling"
title: "SSH: усиление защиты сервера и туннели"
category: "security"
tags: ["ssh", "sshd", "hardening", "tunnel", "port-forwarding", "jump-host"]
sources:
  - title: "Офиц.: sshd_config (OpenBSD man)"
    url: "https://man.openbsd.org/sshd_config"
  - title: "Руководство: Mozilla — OpenSSH guidelines"
    url: "https://infosec.mozilla.org/guidelines/openssh"
  - title: "Вики: ArchWiki — OpenSSH"
    url: "https://wiki.archlinux.org/title/OpenSSH"
  - title: "Гайд: SSH Academy — SSH tunneling"
    url: "https://www.ssh.com/academy/ssh/tunneling-example"
  - title: "Форум: Unix & Linux SE — тег ssh"
    url: "https://unix.stackexchange.com/questions/tagged/ssh"
  - title: "Форум: Ask Ubuntu — тег ssh"
    url: "https://askubuntu.com/questions/tagged/ssh"
  - title: "Хабр: свежие статьи про SSH"
    url: "https://habr.com/ru/search/?q=ssh&target_type=posts&order=date"
---

# SSH: защита сервера и туннели

Конфиг sshd с входом только по ключам и примеры туннелей: локальный и удалённый проброс портов, SOCKS-прокси, jump-хост. Меняя настройки, держите открытой вторую SSH-сессию, пока не убедитесь, что новая работает.

## Серверный конфиг (/etc/ssh/sshd_config.d/hardening.conf)

```ini
Port 2222
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
MaxSessions 5
ClientAliveInterval 300
ClientAliveCountMax 2
AllowGroups sshusers
X11Forwarding no
AllowTcpForwarding yes
```

```bash
sudo groupadd sshusers && sudo usermod -aG sshusers <user>
sudo sshd -t
sudo systemctl reload ssh
```

- Перед отключением паролей убедитесь, что вход по ключу работает: `ssh-copy-id -p 2222 user@server`.
- Опция `Protocol 2` убрана: современный OpenSSH поддерживает только протокол 2, и параметр не нужен.
- На старых OpenSSH (до 8.7) вместо `KbdInteractiveAuthentication` используется `ChallengeResponseAuthentication`.
- Смена порта не защита, а снижение шума в логах. После смены откройте новый порт в файрволе и поправьте `port` в Fail2ban. На SELinux-системах порт нужно разрешить: `semanage port -a -t ssh_port_t -p tcp 2222`.
- `AllowTcpForwarding yes` оставлен для туннелей ниже. Если проброс не нужен, поставьте `no`.
- Имя службы: `ssh` на Debian/Ubuntu, `sshd` на RHEL и Fedora.

## Туннели

```bash
# Локальный проброс: удалённая БД доступна на localhost:5433
ssh -L 5433:127.0.0.1:5432 user@remote-server.com -p 2222 -N

# Удалённый проброс: локальное приложение :3000 доступно на сервере :8080
ssh -R 8080:127.0.0.1:3000 user@remote-server.com -p 2222 -N

# Динамический SOCKS5-прокси для браузера
ssh -D 1080 user@remote-server.com -p 2222 -N

# Jump-хост: подключение к внутреннему узлу через бастион
ssh -J user@bastion.example.com:2222 user@internal-db.local
```

- `-N` не запускает команду на сервере, только держит туннель.
- Удалённый проброс по умолчанию слушает только loopback сервера. Чтобы открыть порт наружу, нужна опция сервера `GatewayPorts`, но так делать небезопасно.
- Для постоянных туннелей используйте `autossh` или юнит systemd с `Restart=always`.
