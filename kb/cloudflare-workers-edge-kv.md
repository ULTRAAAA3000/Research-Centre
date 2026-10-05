---
id: "cloudflare-workers-edge-kv"
title: "Cloudflare Workers: wrangler.toml, KV-кэш и прокси на edge"
category: "devops"
tags: ["cloudflare", "workers", "wrangler", "kv", "r2", "serverless", "edge"]
sources:
  - title: "Офиц.: Cloudflare Workers — документация"
    url: "https://developers.cloudflare.com/workers/"
  - title: "Офиц.: конфигурация Wrangler"
    url: "https://developers.cloudflare.com/workers/wrangler/configuration/"
  - title: "Офиц.: Workers KV"
    url: "https://developers.cloudflare.com/kv/"
  - title: "Офиц.: R2 — объектное хранилище"
    url: "https://developers.cloudflare.com/r2/"
  - title: "Форум: Cloudflare Community"
    url: "https://community.cloudflare.com/"
  - title: "Репозиторий: cloudflare/workers-sdk (issues и примеры)"
    url: "https://github.com/cloudflare/workers-sdk"
  - title: "Форум: Stack Overflow — тег cloudflare-workers"
    url: "https://stackoverflow.com/questions/tagged/cloudflare-workers"
  - title: "Хабр: свежие статьи про Cloudflare Workers"
    url: "https://habr.com/ru/search/?q=cloudflare%20workers&target_type=posts&order=date"
---

# Cloudflare Workers: конфиг и KV-кэш

Конфигурация Worker с KV и R2 и пример прокси-воркера, который кэширует успешные GET-ответы в KV на 60 секунд. Идентификаторы и домены в примерах условные, замените на свои.

## Конфиг (wrangler.toml)

```ini
name = "edge-routing-service"
main = "src/index.ts"
compatibility_date = "2026-01-01"
workers_dev = false
routes = [
  { pattern = "example.com", custom_domain = true }
]

[vars]
ENVIRONMENT = "production"
API_HOST = "api.backend-server.com"

[[kv_namespaces]]
binding = "CACHE_KV"
id = "a1b2c3d4e5f67890"

[[r2_buckets]]
binding = "STATIC_STORAGE"
bucket_name = "production-assets"
```

- Маршруты задаются массивом `routes`. Секция вида `[env.production.routes]` в исходном примере была бы некорректной.
- `custom_domain = true` привязывает Worker к домену целиком (домен должен быть в вашем Cloudflare-аккаунте).
- `workers_dev = false` отключает адрес `*.workers.dev`.
- Секретные значения (токены, ключи) не пишите в `[vars]`: используйте `npx wrangler secret put <NAME>`.
- Идентификатор KV: `npx wrangler kv namespace create CACHE_KV`.

## Worker с кэшем в KV (src/index.ts)

```typescript
export interface Env {
  CACHE_KV: KVNamespace;
  API_HOST: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Пример обслуживает только GET
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const cacheKey = `cache:${url.pathname}${url.search}`;
    const cached = await env.CACHE_KV.get(cacheKey);
    if (cached) {
      return new Response(cached, {
        headers: { "Content-Type": "application/json", "X-Cache": "HIT" },
      });
    }

    try {
      const upstream = await fetch(`https://${env.API_HOST}${url.pathname}${url.search}`, {
        method: "GET",
        headers: { Accept: request.headers.get("Accept") ?? "*/*" },
      });

      if (upstream.ok) {
        const body = await upstream.text();
        ctx.waitUntil(env.CACHE_KV.put(cacheKey, body, { expirationTtl: 60 }));
        const headers = new Headers(upstream.headers);
        headers.set("X-Cache", "MISS");
        return new Response(body, { status: upstream.status, headers });
      }
      return upstream;
    } catch {
      return new Response(JSON.stringify({ error: "Upstream unreachable" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
```

- Заголовки копируются через `new Headers(...)`: оператор `...response.headers` не копирует заголовки, потому что у объекта Headers нет собственных перечислимых полей.
- Заголовки запроса целиком (`request.headers`) на upstream не передаются: там есть `Host` и данные клиента. Передавайте только нужные.
- Минимальный `expirationTtl` в KV 60 секунд. Записи в KV становятся видны во всех локациях не мгновенно (итоговая согласованность).
- В примере при попадании в кэш всегда ставится `Content-Type: application/json`, поэтому кэшируйте так только JSON-API.
