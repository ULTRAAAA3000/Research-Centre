---
id: "istio-service-mesh"
title: "Istio: канареечный релиз и строгий mTLS"
category: "networking"
tags: ["istio", "service-mesh", "mtls", "canary", "virtualservice", "kubernetes"]
sources:
  - title: "Офиц.: документация Istio"
    url: "https://istio.io/latest/docs/"
  - title: "Офиц.: управление трафиком"
    url: "https://istio.io/latest/docs/concepts/traffic-management/"
  - title: "Офиц.: безопасность и mTLS"
    url: "https://istio.io/latest/docs/concepts/security/"
  - title: "Форум: Istio Discuss"
    url: "https://discuss.istio.io/"
  - title: "Форум: Istio GitHub Discussions"
    url: "https://github.com/istio/istio/discussions"
  - title: "Форум: Stack Overflow — тег istio"
    url: "https://stackoverflow.com/questions/tagged/istio"
  - title: "Хабр: свежие статьи про Istio"
    url: "https://habr.com/ru/search/?q=istio%20service%20mesh&target_type=posts&order=date"
---

# Istio

Service mesh добавляет к каждому поду прокси (sidecar), который шифрует трафик между сервисами (mTLS), делит его по правилам и собирает метрики. Ниже канареечный релиз 90/10 и принудительный mTLS. Для работы нужна установка Istio и включённая инъекция прокси в namespace: `kubectl label namespace production istio-injection=enabled`.

## Деление трафика (virtual-service.yaml и destination-rule.yaml)

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: app-route
spec:
  hosts:
    - app.example.com
  http:
    - route:
        - destination:
            host: app-service
            subset: v1
          weight: 90
        - destination:
            host: app-service
            subset: v2
          weight: 10
---
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: app-service
spec:
  host: app-service
  subsets:
    - name: v1
      labels:
        version: v1
    - name: v2
      labels:
        version: v2
```

```bash
kubectl apply -f virtual-service.yaml
istioctl analyze -n production
```

- Без `DestinationRule` подмножества `v1` и `v2` не существуют, и маршрут не заработает: в исходном примере его не хватало. Метки `version` должны быть у подов соответствующих Deployment.
- Сумма весов должна быть 100. Увеличивайте вес v2 постепенно (10, 25, 50, 100) по мере проверки метрик.
- Для трафика снаружи кластера хост `app.example.com` нужно привязать к шлюзу: добавьте `gateways` в VirtualService и создайте ресурс Gateway.
- Версия API `v1beta1` работает во всех актуальных версиях. В новых релизах также доступна `v1`.

## Принудительный mTLS (peer-authentication.yaml)

```yaml
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: production
spec:
  mtls:
    mode: STRICT
```

```bash
kubectl apply -f peer-authentication.yaml
kubectl get peerauthentication -A
istioctl proxy-status
```

- Режим `STRICT` принимает только шифрованный трафик между прокси. Клиенты без sidecar (например, снаружи mesh) перестанут подключаться.
- Безопасный путь миграции: сначала `PERMISSIVE` (принимает оба вида трафика), проверьте, что всё идёт через mTLS, и только потом `STRICT`.
- Политика в namespace `istio-system` с именем `default` действует на весь mesh, в других namespace только на них.
- `istioctl analyze` находит типичные ошибки конфигурации до применения.
