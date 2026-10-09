---
id: "ubuntu-users-permissions"
title: "6. Пользователи и права доступа"
category: "ubuntu_commands"
tags: ["ubuntu", "useradd", "userdel", "groupadd", "chown", "chmod", "права", "pwck", "grpck"]
sources:
  - title: "Офиц.: Ubuntu — добавление пользователей"
    url: "https://help.ubuntu.com/community/AddUsersHowto"
  - title: "Офиц.: GNU Coreutils — chmod"
    url: "https://www.gnu.org/software/coreutils/manual/html_node/chmod-invocation.html"
  - title: "Офиц.: GNU Coreutils — chown"
    url: "https://www.gnu.org/software/coreutils/manual/html_node/chown-invocation.html"
  - title: "Офиц.: Ubuntu — страницы руководств"
    url: "https://manpages.ubuntu.com/"
  - title: "Форум: Ask Ubuntu — тег permissions"
    url: "https://askubuntu.com/questions/tagged/permissions"
  - title: "Форум: Ask Ubuntu — тег users"
    url: "https://askubuntu.com/questions/tagged/users"
  - title: "Форум: Unix & Linux SE — тег permissions"
    url: "https://unix.stackexchange.com/questions/tagged/permissions"
  - title: "Хабр: свежие статьи про права доступа в Linux"
    url: "https://habr.com/ru/search/?q=linux%20%D0%BF%D1%80%D0%B0%D0%B2%D0%B0%20%D0%B4%D0%BE%D1%81%D1%82%D1%83%D0%BF%D0%B0%20chmod&target_type=posts&order=date"
---

# Пользователи и права доступа

## Пользователи и группы

```bash
whoami                                    # имя текущего пользователя
id                                        # uid, gid и все группы
groups <user>                             # группы пользователя
sudo adduser <user>                       # создать пользователя (диалог)
sudo useradd -m -c "Name" -g group -d /home/user -s /bin/bash user
sudo usermod -aG sudo <user>              # выдать права sudo
sudo userdel -r <user>                    # удалить пользователя и его каталог
sudo groupadd <group>                     # создать группу
sudo groupdel <group>                     # удалить группу
```

- Ключ `-m` в `useradd` обязателен, чтобы создать домашний каталог: без него `useradd` его не создаёт (в исходной шпаргалке ключа не было). Группа из `-g` должна существовать заранее (`groupadd`).
- В Ubuntu для обычной работы удобнее `adduser`: он сам создаёт домашний каталог, группу и спрашивает пароль.
- В `usermod -aG` ключ `-a` обязателен: без него список групп пользователя будет заменён, а не дополнен. Новая группа применяется после повторного входа.
- `userdel -r` удаляет домашний каталог безвозвратно. Если нужно сохранить данные, сначала сделайте копию.

## Владелец и права

```bash
sudo chown -R user:group <path>           # владелец и группа, рекурсивно
sudo chmod -R 755 <path>                  # u=rwx, g=rx, o=rx, рекурсивно
find <path> -type d -exec chmod 755 {} +  # только каталоги: 755
find <path> -type f -exec chmod 644 {} +  # только файлы: 644
chmod u+x script.sh                       # сделать файл исполняемым
```

- Цифры считаются так: чтение `r` = 4, запись `w` = 2, выполнение `x` = 1. Права 755 значат `rwxr-xr-x`, а 644 значат `rw-r--r--`. Первая цифра для владельца, вторая для группы, третья для остальных.
- `chmod -R 755` делает исполняемыми все файлы, а это обычно лишнее. Каталогам нужно `x` (чтобы заходить в них), файлам чаще хватает 644. Поэтому ниже команды `find`.
- `chown -R` и `chmod -R` с неверным путём (например, `/`) способны сломать систему. Проверяйте путь перед запуском.

## Проверка учётных записей

```bash
sudo pwck                                 # проверить /etc/passwd и /etc/shadow
sudo pwck -r                              # только проверить, ничего не менять
sudo grpck                                # проверить /etc/group и /etc/gshadow
sudo grpck -r                             # только проверить
```

- Без `-r` команды предлагают исправить найденные ошибки интерактивно. Сначала запускайте с `-r`.
