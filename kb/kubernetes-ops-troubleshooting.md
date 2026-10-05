---
id: "kubernetes-ops-troubleshooting"
title: "Kubernetes: диагностика кластера, Deployment с пробами и HPA"
category: "devops"
tags: ["kubernetes", "kubectl", "k8s", "deployment", "hpa", "probes", "troubleshooting"]
sources:
  - title: "Офиц.: kubectl cheat sheet"
    url: "https://kubernetes.io/docs/reference/kubectl/cheatsheet/"
  - title: "Офиц.: настройка liveness/readiness/startup проб"
    url: "https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/"
  - title: "Офиц.: отладка Pod'ов"
    url: "https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/"
  - title: "Офиц.: Horizontal Pod Autoscaling"
    url: "https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/"
  - title: "Форум: Kubernetes Discuss"
    url: "https://discuss.kubernetes.io/"
  - title: "Форум: Stack Overflow — тег kubernetes"
    url: "https://stackoverflow.com/questions/tagged/kubernetes"
  - title: "Сообщество: Reddit r/kubernetes"
    url: "https://www.reddit.com/r/kubernetes/"
  - title: "Хабр: свежие статьи про Kubernetes"
    url: "https://habr.com/ru/search/?q=kubernetes&target_type=posts&order=date"
---

# Kubernetes: диагностика и продакшен-Deployment

Команды для проверки здоровья кластера и поиска упавших подов, а также манифест Deployment с пробами и автомасштабированием (HPA).

## Состояние кластера и подов

```bash
kubectl top nodes
kubectl describe node <node-name>
kubectl get pods --all-namespaces --field-selector status.phase!=Running
kubectl describe pod <pod-name> -n production
kubectl logs -f deployment/app-deployment -c main-container --timestamps
kubectl exec -it pod-name -n production -- /bin/sh
```

- `kubectl top nodes` показывает фактическую загрузку CPU и RAM (нужен metrics-server). Суммарные requests и limits на узле смотрите в `kubectl describe node`, раздел `Allocated resources`.
- Фильтр `status.phase!=Running` находит Pending, Failed и Completed, но не поды в `CrashLoopBackOff` или с `OOMKilled`: у них фаза Running. Для них смотрите `describe pod`, блок `Last State` и `Reason`.
- Причина последнего падения контейнера:

```bash
kubectl get pod <pod-name> -n production -o jsonpath='{.status.containerStatuses[*].lastState.terminated.reason}'
```

- Логи предыдущего упавшего контейнера: `kubectl logs <pod> --previous`.
- События по namespace: `kubectl get events -n production --sort-by=.lastTimestamp`.

## Deployment с пробами (deployment.yaml)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: production-api
  namespace: production
  labels:
    app: api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: registry.example.com/api:v1.2.0
          ports:
            - containerPort: 8080
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /live
              port: 8080
            initialDelaySeconds: 15
            periodSeconds: 20
```

## Автомасштабирование (hpa.yaml)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: production-api
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: production-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

- HPA работает только при установленном metrics-server и заданных `resources.requests`: процент считается от requests.
- `readinessProbe` убирает под из балансировки, `livenessProbe` перезапускает контейнер. Не делайте liveness-пробу зависимой от внешних сервисов (БД), иначе при их сбое все поды будут перезапущены.
- Тег образа `v1.2.0` лучше любого `latest`: так откат и воспроизводимость понятны.
