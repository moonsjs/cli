# Recipe: auth via ctx (cookies) & CSRF limits

Source of truth: [`moons.config.ts`](https://github.com/moonsjs/cookbook/blob/main/moons.config.ts),
[`src/routes/session.tsx`](https://github.com/moonsjs/cookbook/blob/main/src/routes/session.tsx), and
[`src/server/info.server.ts`](https://github.com/moonsjs/cookbook/blob/main/src/server/info.server.ts).

Auth is **not built in** (non-goal). The pattern is: parse the session cookie
in `context(req)` → typed `ctx` → guard in loaders and serverFns.

```ts
// moons.config.ts — no framework helper: raw `Request` headers are enough
function readDemoUser(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (cookie === null) return null;
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "demo_user" && rest.length > 0) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export default defineConfig({
  context: async (req) => ({ requestId: crypto.randomUUID(), demoUser: readDemoUser(req) }),
});
```

```tsx
// src/routes/session.tsx
export const loader = async ({ ctx }: LoaderArgs<"/session">) => ({ user: ctx.demoUser });
```

Rules:

- **Guard in loaders**: `if (ctx.demoUser === null) redirect("/login")` — server
  side, before rendering.
- **Guard in serverFns**: check `ctx` inside the handler; return a schema-safe
  shape (`{ ok: false }`) or throw your own error (details are masked in
 production,).
- **Session cookie attributes**: `HttpOnly; Secure; SameSite=Lax; Path=/` —
  never readable from JS, HTTPS-only, first CSRF layer. Rotate on login.
- **CSRF scope**: `x-moons: 1` + `security.originWhitelist` protect **only the
  RPC endpoints** (`POST /_moons/fn/*`). Loaders are GET (no side effects);
  every mutation goes through a serverFn. There are no plain HTML form
  endpoints in v1 (non-goal), so there is nothing else to protect.
- Why no cookie helper: parsing is ~8 lines in `context(req)`; shipping a
  helper would imply a session API the framework deliberately does not have.
