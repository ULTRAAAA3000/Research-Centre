---
id: "terraform-opentofu-iac"
title: "Terraform / OpenTofu: сервер в Hetzner Cloud и рабочий цикл"
category: "devops"
tags: ["terraform", "opentofu", "iac", "hetzner", "hcloud", "infrastructure"]
sources:
  - title: "Офиц.: документация Terraform"
    url: "https://developer.hashicorp.com/terraform/docs"
  - title: "Офиц.: документация OpenTofu"
    url: "https://opentofu.org/docs/"
  - title: "Офиц.: провайдер hcloud"
    url: "https://registry.terraform.io/providers/hetznercloud/hcloud/latest/docs"
  - title: "Форум: HashiCorp Discuss — Terraform"
    url: "https://discuss.hashicorp.com/"
  - title: "Форум: Stack Overflow — тег terraform"
    url: "https://stackoverflow.com/questions/tagged/terraform"
  - title: "Сообщество: Reddit r/Terraform"
    url: "https://www.reddit.com/r/Terraform/"
  - title: "Хабр: свежие статьи про Terraform"
    url: "https://habr.com/ru/search/?q=terraform&target_type=posts&order=date"
---

# Terraform и OpenTofu

Terraform (и совместимый открытый форк OpenTofu) описывает инфраструктуру кодом и приводит облако к описанному состоянию. Команды OpenTofu те же, только `tofu` вместо `terraform`. В примере создаётся сервер в Hetzner Cloud.

## Конфигурация (main.tf)

```hcl
terraform {
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
  }
}

variable "hcloud_token" {
  type      = string
  sensitive = true
}

provider "hcloud" {
  token = var.hcloud_token
}

resource "hcloud_ssh_key" "admin" {
  name       = "admin"
  public_key = file("~/.ssh/id_ed25519.pub")
}

resource "hcloud_server" "web_node" {
  name        = "prod-web-01"
  image       = "ubuntu-24.04"
  server_type = "cpx21"
  location    = "fsn1"
  ssh_keys    = [hcloud_ssh_key.admin.id]
}
```

- В исходном примере не было переменной `hcloud_token` и ресурса `hcloud_ssh_key.admin`, поэтому `plan` завершился бы ошибкой.
- Доступные типы серверов и локации меняются. Проверьте актуальные: `hcloud server-type list` и `hcloud location list` (CLI `hcloud` от Hetzner).
- Токен не пишите в файлы: `export TF_VAR_hcloud_token="..."` или секретное хранилище.

## Рабочий цикл

```bash
terraform init
terraform fmt && terraform validate
terraform plan -out=tfplan
terraform apply tfplan
terraform destroy
```

- `init` скачивает провайдеры, `plan -out` сохраняет точный план, `apply tfplan` применяет именно его без неожиданностей.
- `destroy` удаляет всё, что описано в конфигурации: в продакшене используйте с осторожностью.
- Файл состояния (`terraform.tfstate`) содержит секреты. Не коммитьте его: добавьте в `.gitignore` строки `*.tfstate*`, `.terraform/`, `*.tfvars`.
- Для командной работы храните состояние в удалённом backend с блокировками (S3-совместимое хранилище, Terraform Cloud и др.).
- Файл `.terraform.lock.hcl`, наоборот, коммитьте: он фиксирует версии провайдеров.
