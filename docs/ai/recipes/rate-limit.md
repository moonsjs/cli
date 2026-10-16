# Recipe: rate limiting (global middleware)

Source of truth: [`src/shared/rate-limit.ts`](https://github.com/moonsjs/cookbook/blob/main/src/shared/rate-limit.ts)
and [`moons.config.ts`](https://github.com/moonsjs/cookbook/blob/main/moons.config.ts).

Rate limiting is **not a core feature** — no `security.rateLimit`. Implement it
as global middleware; it wraps HTML and RPC alike.

```ts
// src/shared/rate-limit.ts — fixed-window, no dependencies
export function createRateLimiter(options: { limit: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string) => {
    const now = Date.now();
    const entry = hits.get(key);
    if (entry === undefined || now >= entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      return { ok: true, retryAfterMs: 0 };
    }
    if (entry.count >= options.limit) return { ok: false, retryAfterMs: entry.resetAt - now };
    entry.count += 1;
    return { ok: true, retryAfterMs: 0 };
  };
}
```

```ts
// moons.config.ts
const rpcLimiter = createRateLimiter({ limit: 30, windowMs: 1_000 });

middleware: [
  async ({ req, next }) => {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/_moons/fn/")) {
      const key = req.headers.get("x-forwarded-for") ?? "local";
      const decision = rpcLimiter(key);
      if (!decision.ok) {
        return new Response("rate limit terlampaui", {
          status: 429,
          headers: { "retry-after": String(Math.ceil(decision.retryAfterMs / 1000)) },
        });
      }
    }
    return next();
  },
],
```

Rules:

- In-memory is correct for a **single instance**; for multi-instance or
  serverless put the limiter at the reverse proxy (Cloudflare/nginx) or use a
  shared store (Redis) — do not push a store dependency into the framework.
- Key by IP (`x-forwarded-for`) for public RPC, or by session identity
  (`ctx.demoUser`) for per-user actions.
- Always send `retry-after` on 429.
