---
id: "ansible-automation"
title: "Ansible: инвентарь, плейбуки и безопасный запуск"
category: "devops"
tags: ["ansible", "automation", "playbook", "inventory", "configuration-management", "apt"]
sources:
  - title: "Офиц.: документация Ansible"
    url: "https://docs.ansible.com/ansible/latest/"
  - title: "Офиц.: модуль ansible.builtin.apt"
    url: "https://docs.ansible.com/ansible/latest/collections/ansible/builtin/apt_module.html"
  - title: "Форум: Ansible Forum"
    url: "https://forum.ansible.com/"
  - title: "Форум: Stack Overflow — тег ansible"
    url: "https://stackoverflow.com/questions/tagged/ansible"
  - title: "Сообщество: Reddit r/ansible"
    url: "https://www.reddit.com/r/ansible/"
  - title: "Хабр: свежие статьи про Ansible"
    url: "https://habr.com/ru/search/?q=ansible&target_type=posts&order=date"
---

# Ansible

Ansible настраивает серверы по SSH без агентов: вы описываете желаемое состояние в плейбуке, а он приводит серверы к нему. Операции идемпотентны, повторный запуск ничего не ломает.

## Инвентарь (hosts.ini)

```ini
[webservers]
web1.example.com ansible_port=2222 ansible_user=deploy
web2.example.com ansible_port=2222 ansible_user=deploy

[dbservers]
db1.example.com ansible_port=2222 ansible_user=deploy
```

```bash
ansible all -i hosts.ini -m ping
ansible webservers -i hosts.ini -m command -a "uptime"
```

## Плейбук (setup.yml)

```yaml
- name: Install and configure Nginx
  hosts: webservers
  become: true
  tasks:
    - name: Install Nginx package
      ansible.builtin.apt:
        name: nginx
        state: present
        update_cache: true
        cache_valid_time: 3600

    - name: Ensure Nginx is running
      ansible.builtin.service:
        name: nginx
        state: started
        enabled: true
```

```bash
ansible-playbook -i hosts.ini setup.yml --check --diff
ansible-playbook -i hosts.ini setup.yml
ansible-playbook -i hosts.ini setup.yml --limit web1.example.com
```

- Полные имена модулей (`ansible.builtin.apt`) надёжнее коротких и обязательны в современных рекомендациях.
- `--check --diff` показывает, что изменится, ничего не меняя. Всегда прогоняйте перед боевым запуском.
- `--limit` ограничивает запуск одним хостом или группой (удобно для проверки).
- `become: true` выполняет задачи через sudo: у пользователя `deploy` должен быть доступ к sudo.
- Секреты (пароли, ключи) шифруйте через `ansible-vault encrypt_string`, не храните их в репозитории в открытом виде.
- Вынесите повторяющееся в роли (`ansible-galaxy init имя_роли`) и значения в `group_vars/`.
