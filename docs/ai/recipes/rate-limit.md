# Recipe: rate limiting (global middleware)

Source of truth: [`moons.config.ts`](https://github.com/moonsjs/cookbook/blob/main/moons.config.ts)
(CI-guarded) and the `@moonsjs/server` reference.

Rate limiting is **not a core feature** — no `security.rateLimit`. Implement it
as global middleware; it wraps HTML and RPC alike. Use the built-in limiter:

```ts
// moons.config.ts
import { defineConfig } from "@moonsjs/core";
import { createRateLimiter, getClientIp } from "@moonsjs/server";

const rpcLimiter = createRateLimiter({ limit: 30, windowMs: 1_000 });

export default defineConfig({
  context: async (req) => ({}),
  middleware: [
    async ({ req, next }) => {
      if (new URL(req.url).pathname.startsWith("/_moons/fn/")) {
        const decision = rpcLimiter.check(getClientIp(req) ?? "unknown");
        if (!decision.ok) {
          return new Response("rate limit exceeded", {
            status: 429,
            headers: {
              "retry-after": String(Math.max(1, Math.ceil(decision.retryAfterMs / 1_000))),
            },
          });
        }
      }
      return next();
    },
  ],
});
```

Rules:

- **Key on `getClientIp(req)`** — it reads `x-moons-client-ip`, which the server
  always overwrites (`x-forwarded-for`'s first entry when
  `security.trustProxy` is on, otherwise the socket address). Never key on raw
  `x-forwarded-for`: clients can rotate it to bypass the limit.
- In-memory is correct for a **single instance**; for multi-instance or
  serverless put the limiter at the reverse proxy (Cloudflare/nginx) or use a
  shared store (Redis) — do not push a store dependency into the framework.
- `maxKeys` (default 10,000) bounds memory by evicting the oldest key (FIFO);
  under adversarial rotation use a shared store.
- Always send `retry-after` on 429.
