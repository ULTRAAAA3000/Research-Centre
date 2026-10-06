---
id: "cilium-networkpolicy"
title: "Cilium: сетевые политики на eBPF и диагностика"
category: "networking"
tags: ["cilium", "ebpf", "networkpolicy", "kubernetes", "zero-trust", "hubble"]
sources:
  - title: "Офиц.: документация Cilium"
    url: "https://docs.cilium.io/en/stable/"
  - title: "Офиц.: сетевые политики Cilium"
    url: "https://docs.cilium.io/en/stable/security/policy/"
  - title: "Офиц.: наблюдаемость и Hubble"
    url: "https://docs.cilium.io/en/stable/observability/"
  - title: "Инструмент: Network Policy Editor"
    url: "https://networkpolicy.io/"
  - title: "Форум: Cilium GitHub Discussions"
    url: "https://github.com/cilium/cilium/discussions"
  - title: "Форум: Stack Overflow — тег cilium"
    url: "https://stackoverflow.com/questions/tagged/cilium"
  - title: "Хабр: свежие статьи про Cilium"
    url: "https://habr.com/ru/search/?q=cilium&target_type=posts&order=date"
---

# Cilium: политики на eBPF

Cilium это сетевой плагин (CNI) для Kubernetes, который работает на eBPF в ядре. Он даёт сетевые политики L3/L4 и L7 (HTTP, DNS) и наблюдаемость через Hubble. Идея нулевого доверия: по умолчанию всё запрещено, разрешаем только нужные связи.

## Политика: доступ к backend только с frontend (cilium-policy.yaml)

```yaml
apiVersion: "cilium.io/v2"
kind: CiliumNetworkPolicy
metadata:
  name: secure-backend-access
  namespace: production
spec:
  endpointSelector:
    matchLabels:
      app: backend
  ingress:
    - fromEndpoints:
        - matchLabels:
            app: frontend
      toPorts:
        - ports:
            - port: "8080"
              protocol: TCP
```

```bash
kubectl apply -f cilium-policy.yaml
kubectl get cnp -n production
```

- Как только на под действует политика с секцией `ingress`, весь остальной входящий трафик к нему блокируется (default deny). Разрешено только перечисленное.
- Селектор `fromEndpoints` по умолчанию ищет поды в том же namespace. Для другого namespace добавьте метку `k8s:io.kubernetes.pod.namespace: <имя>`.
- Порт указывается строкой (`"8080"`), как в примере.

## Исходящие правила для frontend (с DNS)

```yaml
egress:
  - toEndpoints:
      - matchLabels:
          app: backend
    toPorts:
      - ports:
          - port: "8080"
            protocol: TCP
  - toEndpoints:
      - matchLabels:
          "k8s:io.kubernetes.pod.namespace": kube-system
          "k8s:k8s-app": kube-dns
    toPorts:
      - ports:
          - port: "53"
            protocol: ANY
        rules:
          dns:
            - matchPattern: "*"
```

- Блок добавляется в `spec` политики для `app: frontend`. Когда задан `egress`, исходящий трафик по умолчанию запрещается, поэтому DNS нужно разрешить явно, иначе под перестанет разрешать имена.

## Диагностика

```bash
cilium status --wait
cilium connectivity test
kubectl -n kube-system exec ds/cilium -- cilium monitor --type drop
kubectl -n kube-system exec ds/cilium -- cilium endpoint list
hubble observe --verdict DROPPED -n production
```

- `cilium status` и `cilium connectivity test` относятся к утилите cilium-cli, которая запускается на вашей машине. А `cilium monitor` это команда агента внутри пода `cilium` (в `kube-system`), поэтому её запускают через `kubectl exec`.
- `cilium monitor --type drop` показывает отброшенные пакеты в реальном времени: так видно, какая политика что блокирует.
- Hubble показывает потоки с вердиктами (FORWARDED, DROPPED) и работает по namespace и меткам, это самый удобный способ отлаживать политики.
- Сначала включите политику на тестовом namespace и проверьте трафик, потом раскатывайте на продакшен.
