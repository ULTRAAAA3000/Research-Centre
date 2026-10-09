---
id: "ubuntu-files-archives"
title: "5. Навигация, файлы и архивы"
category: "ubuntu_commands"
tags: ["ubuntu", "ls", "tree", "mkdir", "rm", "ln", "7z", "архивы", "файлы"]
sources:
  - title: "Офиц.: GNU Coreutils — rm"
    url: "https://www.gnu.org/software/coreutils/manual/html_node/rm-invocation.html"
  - title: "Офиц.: GNU Coreutils — ln"
    url: "https://www.gnu.org/software/coreutils/manual/html_node/ln-invocation.html"
  - title: "Офиц.: GNU Coreutils — руководство"
    url: "https://www.gnu.org/software/coreutils/manual/coreutils.html"
  - title: "Офиц.: 7-Zip"
    url: "https://www.7-zip.org/"
  - title: "Форум: Ask Ubuntu — тег command-line"
    url: "https://askubuntu.com/questions/tagged/command-line"
  - title: "Форум: Unix & Linux SE — тег files"
    url: "https://unix.stackexchange.com/questions/tagged/files"
  - title: "Сообщество: Reddit r/linux4noobs"
    url: "https://www.reddit.com/r/linux4noobs/"
  - title: "Хабр: свежие статьи про консоль Linux"
    url: "https://habr.com/ru/search/?q=linux%20%D0%BA%D0%BE%D0%BC%D0%B0%D0%BD%D0%B4%D0%BD%D0%B0%D1%8F%20%D1%81%D1%82%D1%80%D0%BE%D0%BA%D0%B0%20%D1%84%D0%B0%D0%B9%D0%BB%D1%8B&target_type=posts&order=date"
---

# Навигация, файлы и архивы

## Навигация и просмотр

```bash
pwd                          # текущий рабочий каталог
ls -la                       # все файлы, включая скрытые, с правами
ls -lah                      # то же, размеры в удобном виде (КБ, МБ)
tree                         # дерево каталогов (sudo apt install tree)
tree -L 2                    # дерево на два уровня
mkdir -p /path/to/dir        # создать каталог вместе с родителями
ln -s <target> <link>        # символическая ссылка на файл или папку
```

- В `ln -s <target> <link>` сначала то, на что ссылаются, потом имя ссылки. Если ссылка не работает, проверьте, что путь в `<target>` корректен относительно места ссылки (лучше полный путь).
- `mkdir -p` не ругается, если каталог уже существует, и создаёт всю цепочку папок.

## Удаление (осторожно)

```bash
rm -rf <path>                # удалить каталог со всем содержимым, без вопросов
rm -ri <path>                # то же, но с подтверждением каждого файла
```

- Корзины в консоли нет: удалённое не вернуть. Перед `rm -rf` выполните `ls <path>` и проверьте путь.
- Особая опасность: переменная в пути. Если `$DIR` пуста, команда `rm -rf "$DIR/"` превратится в удаление корня. Задавайте проверку `[ -n "$DIR" ]` в скриптах.
- Более безопасная замена: `trash-put <path>` (пакет `trash-cli`) отправляет файл в корзину.

## Архивы 7z

```bash
sudo apt install p7zip-full        # установка 7z
7z a archive.7z <files> -v50m      # архив частями по 50 МБ
7z t archive.7z.001                # проверить целостность (с первого тома)
7z x archive.7z.001                # распаковать (подхватит все тома)
7z l archive.7z.001                # список содержимого
```

- С ключом `-v50m` создаются файлы `archive.7z.001`, `archive.7z.002` и так далее. Проверять и распаковывать нужно первый том (`.001`), при этом остальные тома должны лежать в той же папке. Команда `7z t archive.7z` из исходной шпаргалки для многотомного архива не найдёт файл.
- В новых выпусках Ubuntu есть и пакет `7zip` с командой `7zz`, синтаксис такой же.
- Размер тома: `m` мегабайты, `g` гигабайты (например, `-v2g`).
