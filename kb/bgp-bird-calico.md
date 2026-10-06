---
id: "bgp-bird-calico"
title: "BGP: роутер BIRD и Calico для сети Kubernetes"
category: "networking"
tags: ["bgp", "bird", "calico", "calicoctl", "kubernetes", "routing"]
sources:
  - title: "Офиц.: BIRD Internet Routing Daemon"
    url: "https://bird.network.cz/"
  - title: "Офиц.: Calico — настройка BGP"
    url: "https://docs.tigera.io/calico/latest/networking/configuring/bgp"
  - title: "Офиц.: calicoctl — справочник"
    url: "https://docs.tigera.io/calico/latest/reference/calicoctl/overview"
  - title: "Форум: Calico GitHub Discussions"
    url: "https://github.com/projectcalico/calico/discussions"
  - title: "Форум: Network Engineering SE — тег bgp"
    url: "https://networkengineering.stackexchange.com/questions/tagged/bgp"
  - title: "Форум: Server Fault — тег bgp"
    url: "https://serverfault.com/questions/tagged/bgp"
  - title: "Хабр: свежие статьи про BGP и Calico"
    url: "https://habr.com/ru/search/?q=calico%20bgp&target_type=posts&order=date"
---

# BGP: BIRD и Calico

Calico умеет анонсировать сети подов по BGP внешнему роутеру. Ниже конфиг внешнего роутера на BIRD 2, который принимает маршруты от узлов кластера, и команды calicoctl для проверки. Синтаксис относится к BIRD 2.x: в 1.x он другой (отдельный демон для IPv6).

## Внешний роутер BIRD (/etc/bird/bird.conf)

```ini
router id 192.168.1.10;

protocol device {
}

protocol kernel {
    ipv4 {
        import all;
        export none;
    };
    learn;
}

protocol bgp uplink1 {
    local as 65001;
    neighbor 192.168.1.1 as 65000;
    ipv4 {
        import all;
        export filter {
            if net ~ [ 10.244.0.0/16+ ] then accept;
            reject;
        };
    };
}
```

```bash
sudo birdc configure
sudo birdc show protocols
sudo birdc show route
```

- `router id` обязателен: обычно это один из IPv4-адресов машины.
- Фильтр `export` анонсирует соседу только префиксы из `10.244.0.0/16` (и более длинные, суффикс `+`) и отбрасывает всё остальное. Подставьте реальный CIDR подов.
- `import all` принимает любые маршруты соседа. В продакшене ограничьте его фильтром, иначе ошибочный анонс соседа попадёт к вам.
- Блок `protocol kernel` с `learn` позволяет BIRD узнавать о маршрутах из ядра. Если нужно устанавливать полученные по BGP маршруты в таблицу ядра, измените `export none` на `export all`.

## Calico: пир и диагностика

```yaml
apiVersion: projectcalico.org/v3
kind: BGPPeer
metadata:
  name: uplink1
spec:
  peerIP: 192.168.1.1
  asNumber: 65000
```

```bash
calicoctl apply -f bgppeer.yaml
sudo calicoctl node status
calicoctl get ipPool -o wide
calicoctl get bgpPeer -o wide
```

- `calicoctl node status` запускается на самом узле с правами root и показывает состояние BGP-сессий: нужно `Established`.
- `calicoctl get ipPool -o wide` показывает пулы адресов подов. Проверьте, что CIDR совпадает с тем, что анонсируете и фильтруете: у Calico по умолчанию пул часто `192.168.0.0/16`, а `10.244.0.0/16` типичен для kubeadm с flannel.
- Внутри `calico-node` свой экземпляр BIRD: отдельно устанавливать его на узлы не нужно. Внешний BIRD в этой статье это роутер, с которым узлы устанавливают пиринг.
- Не работает сессия: проверьте доступность TCP 179 между узлом и роутером, совпадение номеров AS и отсутствие блокировки в файрволе.
