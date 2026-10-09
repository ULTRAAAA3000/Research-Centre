---
id: "ubuntu-ufw-firewall"
title: "9. Брандмауэр UFW"
category: "ubuntu_commands"
tags: ["ubuntu", "ufw", "firewall", "брандмауэр", "порты", "iptables"]
sources:
  - title: "Офиц.: Ubuntu — UFW"
    url: "https://help.ubuntu.com/community/UFW"
  - title: "Офиц.: Netfilter — документация"
    url: "https://www.netfilter.org/documentation/"
  - title: "Вики: ArchWiki — Uncomplicated Firewall"
    url: "https://wiki.archlinux.org/title/Uncomplicated_Firewall"
  - title: "Форум: Ask Ubuntu — тег ufw"
    url: "https://askubuntu.com/questions/tagged/ufw"
  - title: "Форум: Server Fault — тег ufw"
    url: "https://serverfault.com/questions/tagged/ufw"
  - title: "Форум: Ubuntu Discourse"
    url: "https://discourse.ubuntu.com/"
  - title: "Сообщество: Reddit r/Ubuntu"
    url: "https://www.reddit.com/r/Ubuntu/"
  - title: "Хабр: свежие статьи про UFW"
    url: "https://habr.com/ru/search/?q=ufw%20ubuntu&target_type=posts&order=date"
---

# Брандмауэр UFW

UFW (Uncomplicated Firewall) это упрощённая надстройка над iptables и nftables, которая по умолчанию запрещает входящие соединения и разрешает исходящие. Правила применяются сразу и сохраняются после перезагрузки.

## Включение и статус

```bash
sudo ufw allow OpenSSH            # СНАЧАЛА разрешите SSH
sudo ufw enable                   # включить брандмауэр
sudo ufw disable                  # выключить брандмауэр
sudo ufw status                   # статус и правила
sudo ufw status verbose           # то же, с политиками по умолчанию
sudo ufw status numbered          # правила с номерами
```

- Включайте брандмауэр, только когда SSH уже разрешён, иначе при удалённой работе вы потеряете доступ к серверу. UFW предупредит и попросит подтверждение, но лучше разрешить SSH заранее. Если SSH на нестандартном порту, разрешите именно его: `sudo ufw allow 2222/tcp`.

## Правила

```bash
sudo ufw allow 80/tcp                         # открыть порт 80 (TCP)
sudo ufw allow 443                            # порт 443 (TCP и UDP)
sudo ufw deny 23/tcp                          # заблокировать порт
sudo ufw allow from 10.0.0.5 to any port 22   # SSH только с одного адреса
sudo ufw deny from <IP>                       # блокировать входящие с адреса
sudo ufw insert 1 deny from <IP>              # вставить правило первым
sudo ufw delete <номер>                       # удалить правило по номеру
sudo ufw default deny incoming                # политика по умолчанию
sudo ufw reset                                # сбросить все правила
```

- Номер для `delete` смотрите в `ufw status numbered`. После удаления номера сдвигаются: удаляйте по одному и каждый раз смотрите список заново.
- Правила проверяются по порядку, срабатывает первое подходящее. Если для адреса уже есть общее правило `allow`, новое `deny` в конце списка ничего не заблокирует. Поэтому используйте `ufw insert 1 ...`.
- `ufw reset` отключает UFW и удаляет все правила. Если вы подключены по SSH, потом заново разрешите доступ и включите.
- Порты, опубликованные Docker (`-p 8080:80`), обходят UFW, потому что Docker сам правит правила iptables. Ограничивайте такие порты привязкой к адресу (`-p 127.0.0.1:8080:80`) или правилами в цепочке `DOCKER-USER`.
- IPv6: в файле `/etc/default/ufw` должно быть `IPV6=yes`, иначе правила для IPv6 не применяются. Журнал: `sudo ufw logging on`.
