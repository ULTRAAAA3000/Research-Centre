---
id: "cert-manager-letsencrypt"
title: "cert-manager: сертификаты Let's Encrypt в Kubernetes"
category: "security"
tags: ["cert-manager", "letsencrypt", "acme", "tls", "kubernetes", "ingress"]
sources:
  - title: "Офиц.: документация cert-manager"
    url: "https://cert-manager.io/docs/"
  - title: "Офиц.: настройка ACME"
    url: "https://cert-manager.io/docs/configuration/acme/"
  - title: "Офиц.: диагностика проблем"
    url: "https://cert-manager.io/docs/troubleshooting/"
  - title: "Офиц.: лимиты Let's Encrypt"
    url: "https://letsencrypt.org/docs/rate-limits/"
  - title: "Форум: Let's Encrypt Community"
    url: "https://community.letsencrypt.org/"
  - title: "Форум: cert-manager GitHub Discussions"
    url: "https://github.com/cert-manager/cert-manager/discussions"
  - title: "Форум: Stack Overflow — тег cert-manager"
    url: "https://stackoverflow.com/questions/tagged/cert-manager"
  - title: "Хабр: свежие статьи про cert-manager"
    url: "https://habr.com/ru/search/?q=cert-manager&target_type=posts&order=date"
---

# cert-manager и Let's Encrypt

cert-manager выпускает и автоматически продлевает TLS-сертификаты для Ingress в Kubernetes. Схема: ClusterIssuer описывает, где брать сертификаты (Let's Encrypt), а аннотация на Ingress запрашивает сертификат для домена.

## Установка

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set crds.enabled=true
```

- В старых версиях чарта вместо `crds.enabled=true` используется `installCRDs=true`. Сверьтесь с документацией вашей версии.

## ClusterIssuer (cluster-issuer.yaml)

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-account-key
    solvers:
      - http01:
          ingress:
            class: nginx
```

- Перед боевым использованием проверьте схему на тестовом сервере Let's Encrypt: `https://acme-staging-v02.api.letsencrypt.org/directory`. У боевого есть строгие лимиты на число выпусков, а тестовый их почти не имеет (сертификаты от него не доверенные браузерами).
- `http01` проверяет домен через HTTP: порт 80 должен быть доступен из интернета, а Ingress-контроллер класса `nginx` работать.
- Для wildcard-сертификатов (`*.example.com`) нужен `dns01` с API вашего DNS-провайдера, `http01` их не умеет.

## Ingress с запросом сертификата

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - app.example.com
      secretName: app-example-com-tls
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: app
                port:
                  number: 80
```

## Диагностика

```bash
kubectl get certificates -A
kubectl describe certificate app-example-com-tls -n production
kubectl get certificaterequests,orders,challenges -A
kubectl describe challenge -n production
kubectl logs -n cert-manager deploy/cert-manager
```

- Цепочка объектов: `Certificate` → `CertificateRequest` → `Order` → `Challenge`. Статус `READY=True` у Certificate значит, что сертификат выпущен.
- Если Challenge висит в `pending`, проверьте, что домен указывает на ваш Ingress, порт 80 открыт и нет редиректа на HTTPS для пути `/.well-known/acme-challenge/`.
- Ошибки в `describe challenge` и логах cert-manager обычно прямо называют причину (DNS, 404, лимит).
