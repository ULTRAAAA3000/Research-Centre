---
id: "argocd-gitops"
title: "ArgoCD: GitOps-доставка в Kubernetes"
category: "devops"
tags: ["argocd", "gitops", "kubernetes", "cd", "sync", "rollback"]
sources:
  - title: "Офиц.: документация Argo CD"
    url: "https://argo-cd.readthedocs.io/en/stable/"
  - title: "Офиц.: argocd app rollback"
    url: "https://argo-cd.readthedocs.io/en/stable/user-guide/commands/argocd_app_rollback/"
  - title: "Офиц.: CNCF — проект Argo"
    url: "https://argoproj.github.io/"
  - title: "Форум: Argo CD GitHub Discussions"
    url: "https://github.com/argoproj/argo-cd/discussions"
  - title: "Форум: Stack Overflow — тег argocd"
    url: "https://stackoverflow.com/questions/tagged/argocd"
  - title: "Сообщество: Reddit r/kubernetes"
    url: "https://www.reddit.com/r/kubernetes/"
  - title: "Хабр: свежие статьи про Argo CD"
    url: "https://habr.com/ru/search/?q=argo%20cd&target_type=posts&order=date"
---

# ArgoCD: GitOps

Argo CD следит за Git-репозиторием с манифестами и приводит кластер Kubernetes к описанному там состоянию. Источник истины это Git: изменения делаются коммитами, а не командами kubectl.

## Команды CLI

```bash
argocd login argocd.internal.com --username admin
argocd app list
argocd app get production-api
argocd app diff production-api
argocd app sync production-api
argocd app history production-api
argocd app rollback production-api <ID>
```

- `argocd app history` показывает историю развёртываний с числовыми идентификаторами. `rollback` принимает именно этот ID, а не номер или хэш коммита Git.
- Откат невозможен, пока включена автосинхронизация (`syncPolicy.automated`): Argo CD сразу вернёт состояние из Git. Правильный GitOps-откат это `git revert` нужного коммита в репозитории манифестов. Либо временно отключите автосинхронизацию: `argocd app set production-api --sync-policy none`.
- `argocd app diff` показывает расхождение между Git и кластером до синхронизации.
- Первый пароль admin лежит в секрете `argocd-initial-admin-secret` (смените его и удалите секрет).

## Приложение (app.yaml)

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: production-api
  namespace: argocd
spec:
  project: default
  source:
    repoURL: 'https://github.com/myorg/k8s-manifests.git'
    targetRevision: HEAD
    path: overlays/production
  destination:
    server: 'https://kubernetes.default.svc'
    namespace: prod
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

```bash
kubectl apply -f app.yaml
```

- `prune: true` удаляет из кластера ресурсы, которых больше нет в Git. `selfHeal: true` откатывает ручные правки в кластере к состоянию из Git.
- `CreateNamespace=true` создаёт namespace `prod`, если его нет.
- Вместо `HEAD` для продакшена надёжнее закреплять тег или ветку (`main`, `v1.4.0`), чтобы развёртывание было предсказуемым.
- Для приватного репозитория добавьте учётные данные: `argocd repo add <url> --username <user> --password <token>`.
- Значение `project: default` разрешает почти всё. Для реальных команд заведите отдельные AppProject с ограничением репозиториев и namespace.
