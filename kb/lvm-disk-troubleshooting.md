---
id: "lvm-disk-troubleshooting"
title: "LVM и диски: расширение томов, SMART и проверка ФС"
category: "linux"
tags: ["lvm", "lvextend", "smartctl", "fsck", "lsblk", "storage", "disk"]
sources:
  - title: "Вики: ArchWiki — LVM"
    url: "https://wiki.archlinux.org/title/LVM"
  - title: "Офиц.: man lvextend"
    url: "https://man7.org/linux/man-pages/man8/lvextend.8.html"
  - title: "Офиц.: smartmontools — документация"
    url: "https://www.smartmontools.org/wiki/TocDoc"
  - title: "Форум: Unix & Linux SE — тег lvm"
    url: "https://unix.stackexchange.com/questions/tagged/lvm"
  - title: "Форум: Server Fault — тег lvm"
    url: "https://serverfault.com/questions/tagged/lvm"
  - title: "Сообщество: Reddit r/linuxadmin"
    url: "https://www.reddit.com/r/linuxadmin/"
  - title: "Хабр: свежие статьи про LVM"
    url: "https://habr.com/ru/search/?q=lvm&target_type=posts&order=date"
---

# LVM и диски

Команды для работы с LVM (физические тома, группа томов, логические тома), проверки здоровья дисков и починки файловой системы. Перед операциями с разделами делайте резервную копию, а имена `vg_data`, `lv_root`, `/dev/sdb1` замените своими.

## Управление LVM

```bash
sudo pvs
sudo vgs
sudo lvs
sudo pvcreate /dev/sdb1
sudo vgextend vg_data /dev/sdb1
sudo lvextend -r -L +50G /dev/vg_data/lv_root
```

- `pvs`, `vgs`, `lvs` показывают физические тома, группы и логические тома.
- `pvcreate` инициализирует раздел или диск под LVM, `vgextend` добавляет его в группу томов.
- `lvextend -r -L +50G` увеличивает логический том на 50 ГБ и сразу меняет размер файловой системы (`-r`) онлайн. Работает для ext4 и XFS.
- Расширить на всё свободное место: `sudo lvextend -r -l +100%FREE /dev/vg_data/lv_root`.
- XFS можно только увеличивать, уменьшить нельзя. Для ext4 уменьшение возможно только при размонтировании и требует осторожности.

## Диагностика дисков и ФС

```bash
sudo smartctl -a /dev/nvme0n1
sudo lsblk -o NAME,SIZE,FSTYPE,TYPE,MOUNTPOINT,UUID
sudo fsck.ext4 -f /dev/sda1
sudo xfs_repair /dev/sdb1
```

- `smartctl -a` показывает здоровье NVMe/SATA SSD (износ, ошибки, температура). Для SATA-дисков проверьте также `smartctl -t short /dev/sda`.
- `lsblk -o ...` показывает дерево блочных устройств, типы ФС, точки монтирования и UUID (UUID используйте в `/etc/fstab`).
- `fsck.ext4 -f` запускайте только на размонтированной файловой системе: с Live USB или после `umount`. Корневой раздел проверяйте из режима восстановления.
- Для XFS вместо fsck используется `xfs_repair`, тоже только на размонтированной ФС.
- Если диск показывает рост `Reallocated_Sector_Ct` или `Media and Data Integrity Errors`, срочно делайте копию данных.
