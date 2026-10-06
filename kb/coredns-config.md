---
id: "coredns-config"
title: "CoreDNS: Corefile с локальными записями, кэшем и метриками"
category: "networking"
tags: ["coredns", "dns", "corefile", "forward", "cache", "kubernetes"]
sources:
  - title: "Офиц.: CoreDNS Manual"
    url: "https://coredns.io/manual/toc/"
  - title: "Офиц.: плагин hosts"
    url: "https://coredns.io/plugins/hosts/"
  - title: "Офиц.: плагин forward"
    url: "https://coredns.io/plugins/forward/"
  - title: "Репозиторий: coredns/coredns"
    url: "https://github.com/coredns/coredns"
  - title: "Форум: Stack Overflow — тег coredns"
    url: "https://stackoverflow.com/questions/tagged/coredns"
  - title: "Форум: Server Fault — вопросы по DNS"
    url: "https://serverfault.com/questions/tagged/dns"
  - title: "Хабр: свежие статьи про CoreDNS"
    url: "https://habr.com/ru/search/?q=coredns&target_type=posts&order=date"
---

# CoreDNS

CoreDNS это DNS-сервер на плагинах: каждая строка Corefile включает возможность (кэш, перенаправление, метрики). Он стандартный DNS кластера Kubernetes, но годится и как обычный локальный резолвер. В Kubernetes Corefile хранится в ConfigMap `coredns` в namespace `kube-system`.

## Corefile

```text
.:53 {
    errors
    health {
        lameduck 5s
    }
    ready
    hosts /etc/coredns/hosts {
        10.0.0.50 db.internal.local
        fallthrough
    }
    prometheus :9153
    forward . 1.1.1.1 1.0.0.1
    cache 30
    loop
    reload
}
```

- `errors` пишет ошибки в лог, `health` и `ready` дают HTTP-проверки живости и готовности (порты 8080 и 8181), `lameduck 5s` даёт 5 секунд на завершение запросов при остановке.
- `hosts` отвечает на имена из файла и из встроенного списка. `fallthrough` передаёт остальные запросы дальше по цепочке, без него все остальные имена получили бы отказ.
- `forward . 1.1.1.1 1.0.0.1` отправляет всё остальное на внешние DNS. `cache 30` кэширует ответы до 30 секунд. `prometheus :9153` открывает метрики.
- `loop` обнаруживает петлю пересылки (когда forward указывает на сам сервер) и останавливает CoreDNS. `reload` перечитывает Corefile без перезапуска.
- Порядок плагинов определяется самим CoreDNS при сборке, а не порядком строк в Corefile.

## Запуск и проверка

```bash
coredns -conf Corefile -dns.port 1053
dig @127.0.0.1 -p 1053 db.internal.local
dig @127.0.0.1 -p 1053 example.com
curl -s http://localhost:9153/metrics | head
```

- Для пробы используйте порт 1053, чтобы не занимать 53.
- На Ubuntu порт 53 по умолчанию занят `systemd-resolved`: освободите его (`DNSStubListener=no` в `/etc/systemd/resolved.conf`) или слушайте другой адрес.
- Если используете CoreDNS как DNS кластера Kubernetes, в его Corefile обязателен блок `kubernetes cluster.local ...`, в этом примере его нет.
- Для записей, которые часто меняются, вместо `hosts` удобнее плагин `file` с зоной.
