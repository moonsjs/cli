# Moons — Context for AI Agents

Compact, accurate guide for building apps with **Moons** (`@moonsjs/*`, v0.2.0).
Everything here is verified against the current implementation. When in doubt, run
`moons check` — green means the types line up and the client bundle is leak-free.

## 0. What Moons is (and the one guarantee)

Moons is a full-stack TypeScript web framework (file routing + SSR + React
hydration). Its single non-negotiable guarantee: **server code can never leak
into the client bundle**. Files named `*.server.ts` are replaced by RPC stubs in
the client build; attempting to smuggle their content into client code **fails
the build** with a `[moons] E_...` error.

Consequences that shape every pattern below:

- Route files and components are **client modules** — assume their code is public.
- Secrets, DB access, `node:*`/`bun:*` imports live **only** in `*.server.ts`.
- Server-only **packages** (`pg`, `drizzle-orm`, `@prisma/client`, …; see the
  built-in list + `security.serverOnlyPackages` + the package.json marker
  `"moons": { "serverOnly": true }`) are a **build error** in client modules —
  direct import, dynamic `import()`, and `export *`/re-exports all fail with
  `E_FORBIDDEN_SERVER_IMPORT`. `import type` is fine (erased at compile time).
  The way out: move the call into `*.server.ts` and expose a serverFn.
- **Dev-only SSR payload scan**: the dev server warns (`[moons] peringatan dev`)
  if a loader payload contains the configured `leakTest.canary` or a value of a
  secret-looking env var (name matches SECRET/TOKEN/KEY/…, value ≥ 12 chars).
  Production never scans (no runtime cost). A warning is a smell — do not
  return secrets from loaders (payload is embedded into HTML).
- **Auth is not built in**: parse the session cookie in `context(req)` → typed
  `ctx` → guard loaders (`redirect()`) and serverFns. Session cookies:
  `HttpOnly; Secure; SameSite=Lax`. CSRF: `x-moons: 1` + `security.originWhitelist`
  protect only `POST /_moons/fn/*`; loaders are GET and must stay side-effect
  free. Recipes: `docs/ai/recipes/auth-ctx.md`.
- **Rate limiting is not built in**: use global middleware (fixed-window keyed
  by IP/session, 429 + `retry-after`); multi-instance → reverse proxy or shared
  store. Recipe: `docs/ai/recipes/rate-limit.md`.
- **Raw HTTP endpoints **: `src/api/**/*.ts` export only method
  handlers (`GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS`) taking `{ req, params, ctx }`
  and returning a `Response`; URL = `/<apiDir basename>/…`. These files are
  server-only (client import = build error) and are **NOT** covered by the RPC
  CSRF checks — verify signatures/tokens yourself. `HEAD` is auto-derived from
  `GET`; `OPTIONS` returns 204 + `Allow`. Build errors:
  `E_API_HANDLER_INVALID`, `E_API_ROUTE_CONFLICT`. Check `moons routes --json`
  (`kind: "api"`).
- **Response helpers **: `setHeader`/`appendHeader`/`setCookie`/
  `deleteCookie` from `@moonsjs/react` (loaders/route files) or `@moonsjs/server`
  (`*.server.ts`). Request-scoped; applied to HTML, RPC, API responses and
  error pages alike. Cookie values are auto-encoded; CRLF/forbidden headers →
  `E_RESPONSE_HEADER_INVALID`; outside a request → `E_RESPONSE_OUTSIDE_REQUEST`.
- **Directory middleware & nested error boundaries **:
  `_middleware.ts` (in `src/routes/**` and `src/api/**`) wraps requests resolving
  into its subtree — chain is global `config.middleware` → root→leaf dir
  middleware → render. RPC `/_moons/fn/*` is **not** wrapped by dir middleware
  (global + `ctx` guards only). `_error.tsx` may now live in any directory; the
  **nearest** boundary is used (root fallback); `_404.tsx` stays root-only.
  Wrong shape → `E_MIDDLEWARE_INVALID` (build for exports, runtime 500 for
  non-`Response` returns).
- **Static prerender **: `export const prerender = true` on a
  page renders it at build time into `dist/client/<path>/index.html` (+ a
  `_moons_prerender.json` manifest the static server obeys; other paths stay
  SSR). Dynamic routes require `export const paths = () => [{ … }]`
  (`E_PRERENDER_NO_PATHS` otherwise). The runner runs a **fail-mode** payload
  scan: canary or secret-looking env values in prerendered HTML → build fails
  with `E_PRERENDER_LEAK` (static leakage is permanent). `redirect()` at build
  and malformed `paths` → `E_PRERENDER_INVALID`; `notFound()` skips the path.
  Middleware does not run at build time. `ctx.__prerender === true` during
 prerender. **ISR **: add `export const revalidate = <seconds>`
  next to `prerender = true` — stale files are served while a background,
  in-process revalidation regenerates them (atomic write, fail-closed leak
  scan; bad value / missing `prerender` → `E_ISR_INVALID`). Single-instance
  only; no programmatic invalidation yet.
- **Uploads **: `src/api` endpoint with `await req.formData`;
  enforce per-route size limits (`content-length` + actual bytes —
  `security.bodyLimitBytes` is RPC-only), never trust `file.name`/`file.type`
  for storage. Recipe: `docs/ai/recipes/upload.md`.
- Loader data is embedded into the HTML payload — the browser sees it. Never
  return secrets from a loader.

## 1. Project layout

```
moons.config.ts        # server-side config: routesDir + context(req) + middleware
vite.config.ts         # vite + moons() plugin (+ optional leakTest canary)
index.html             # shell: <div id="root"> + /src/client/main.tsx script
src/client/main.tsx    # await hydrate();
src/routes/            # file-based routes
src/server/*.server.ts # server-only zone
.moons/                # generated types (gitignored)
```

Commands (all run from the app root):

```bash
moons dev              # dev server (HMR, port 3000)
moons build            # dist/client/** + dist/server/index.js
moons start            # serve dist/
moons typegen          # regenerate .moons/routes.d.ts + .moons/context.d.ts
moons routes --json    # route table from scan (no build needed)
moons fns --json       # serverFn registry (file#export → hash)
moons check --json     # typegen → tsc --noEmit → build client → build server
moons test [args…]     # bun test + preload that injects serverFn metadata
```

## 2. File routing

| File                       | URL            | Kind   |
| -------------------------- | -------------- | ------ |
| `index.tsx`                | `/`            | page   |
| `about.tsx`                | `/about`       | page   |
| `users/index.tsx`          | `/users`       | page   |
| `users/[id].tsx`           | `/users/:id`   | page   |
| `docs/[...rest].tsx`       | `/docs/*`      | page   |
| `_layout.tsx`              | —              | layout |
| `_404.tsx`, `_error.tsx`   | —              | root only |

- `[...rest]` must be the **last** segment; two routes resolving to the same path
  fail the build (`E_ROUTE_CONFLICT`).
- `_layout.tsx` wraps every page under its directory (root→leaf order).
- The **route key** (used in manifests/payloads) is the file path relative to
  `src/routes/` without extension, e.g. `users/[id]`.
- Allowed exports per file: page → `default | loader | meta`; layout →
  `default | loader`; `_404`/`_error` → `default` only. Anything else fails the
  build (`E_ROUTE_EXPORT_INVALID`).

## 3. Page anatomy

```tsx
import { Link, useLoaderData, type LoaderArgs } from "@moonsjs/react";
import { noteById } from "../server/notes.server";

// Runs on the server. Return a plain object (NOT a Response).
export const loader = async ({ params, ctx, req }: LoaderArgs<"/notes/[id]">) => ({
  note: await noteById({ input: { id: params.id } }), // serverFn, in-process during SSR
  q: new URL(req.url).searchParams.get("q") ?? "",
});

export default function Page() {
  const data = useLoaderData<typeof loader>(); // typed to the loader's return type
  return <Link to="/notes/[id]" params={{ id: "n1" }}>note</Link>;
}
```

- Loader args: `{ params: Record<string,string>, ctx, req: Request }`. Returning a
  `Response` from a loader is an error (`E_INTERNAL`) — use middleware for
  status/headers.
- `meta` (page only,): `export const meta: RouteMetaFn<typeof loader>
  = ({ data }) => ({ title, description })` — applied to `<title>`/description/OG
  on SSR and on client navigation (via the SSR payload).
- Routing signals: throw `redirect(to, status?)` or `notFound`
  from a loader/`meta` (imported from `@moonsjs/react`). `notFound()` renders
  `_404` with status 404; `redirect` returns an HTTP redirect (client nav
  follows it and history uses the final URL).
- Loader code is compiled from the same file the browser receives: keep it
  client-safe (no `node:*`, no `env()`). Anything secret must sit in
  `*.server.ts` and be called as a serverFn.
- Loader results are serialized with **devalue**: `Date`, `Map`, `Set`, `BigInt`,
  `undefined`, `NaN` survive server→client.
- Dedupe per request with `cache()` from `@moonsjs/server` when layout and page
 loaders need the same data.

## 4. Server functions (`*.server.ts`)

```ts
// src/server/notes.server.ts
import { env, serverFn } from "@moonsjs/server";
import { z } from "zod";

export const addNote = serverFn({
  input: z.object({ title: z.string().min(1).max(80) }), // required
  output: z.object({ id: z.string(), title: z.string() }), // required
  handler: async ({ input, ctx }) => ({ id: "n1", title: input.title }),
});
```

Rules:

- `input` and `output` schemas are **required** (Standard Schema; Zod works —
  any spec-compliant schema library is fine, Zod is just the example here).
  Both sides are validated: the client stub checks input before fetch and output
  after fetch; the server re-checks input before the handler and output after it.
- Schemas must be **inline expressions or imports** (`z.object({...})` directly,
  or a schema imported from `src/shared/…`). A schema that references a local
  top-level declaration (`const noteSchema = …` in the same `.server.ts`) is
  rejected at build time with `E_SCHEMA_LOCAL_REF`: the client stub only ships
  imports plus the schema expressions. The error shows a **before/after diff**
  (inline the schema, or move it to a shared client-safe module and import it).
- The client may import **named serverFn exports only**. Default imports and
  `import * as ns` from `*.server.ts` are rejected (`E_SERVER_IMPORT_IN_CLIENT`).
- Identity is a hash: first 16 hex chars of `sha256("<rel-path>#<export>")` —
  identical in dev, build, and SSR. `moons fns --json` prints the registry.
- Wire format: `POST /_moons/fn/<hash>`, headers `x-moons: 1` +
  `content-type: application/x-moons`, body/response serialized with devalue.
  You never write this by hand — just `import` and call the function.
- During SSR the stub calls the handler **in-process** (no HTTP round-trip).
- Failures throw a plain `Error` whose message starts with
  `[moons] <CODE>` (e.g. `E_RPC_INVALID_INPUT`) followed by details + suggestions;
  show `error.message` to users when appropriate.
- Dynamic `import()` of `*.server`, `import.meta.glob` covering `*.server`, and
  `?raw`/`?url` imports of `*.server` are all rejected at build time. Do not try
  to work around the rejection; it is the product.

## 5. Context & environment

```ts
// moons.config.ts — server-side only
import { defineConfig } from "@moonsjs/core";
export default defineConfig({
  routesDir: "src/routes",
  context: async (req) => ({ requestId: crypto.randomUUID(), db: myDb }),
});
```

- `context(req)` runs **once per request, before middleware**; the returned `ctx`
  is passed to middleware, loaders, and serverFn handlers. Type it once and the
  generated `.moons/context.d.ts` makes `Ctx` global.
- Secrets: `env("SECRET_KEY")` from `@moonsjs/server` inside `*.server.ts` only.
  Calling `env()` in a client module fails the build (`E_ENV_IN_CLIENT`).
- Public, non-secret values may use Vite's `import.meta.env.VITE_*` in client
  code (inlined at build time).

## 6. Navigation, search params, refresh

```tsx
import { Link, navigate, refresh, useLoaderData, useParams, useSearchParams } from "@moonsjs/react";

<Link to="/search" search={{ q: "alpha", page: 2 }}>alpha</Link>
```

- `Link` renders `<a href>`; left click without modifiers becomes client-side
  navigation (fetch + DOM swap + hydrate). `params` fills dynamic segments,
  `search` appends a query string (`undefined` values are skipped).
- `navigate(href, { replace? })` from `@moonsjs/react` runs the same
  navigation from code; `href` is a URL path (a route key requires `Link`),
  `replace: true` swaps the history entry. No active runtime → document
  navigation; bare `#fragment`/external URLs go to the browser. Same-document
  hash changes are ignored by the router (the browser scrolls the anchor);
  back/forward across real pages still restores the saved scroll.
- `useSearchParams(): Record<string,string>` — the request's query string; the
  same values are embedded into the SSR payload, so server and client agree.
- `refresh()` re-runs the current URL through the document-fetch pipeline (data
  loaders + render); use it after a mutation to revalidate (`await addNote(...);
  refresh();`). Component-local `useState` is re-created on the re-render — treat
  the server payload as the source of truth (local state only for transient UI).
  No cache, no pending/optimistic API — that is by design.
- Scroll restoration: push navigation scrolls to top (or to
  `#anchor`); back/forward restores the saved position; the document title is
  updated from the payload `meta` on every client navigation.
- **Pending UI & prefetch **: `const { pending, url } =
  useNavigation()` from `@moonsjs/react` is `true` from click/popstate until
  swap+hydrate finishes (SSR snapshot always `pending: false`). `<Link>`
  prefetches its target document on hover/focus by default (in-memory TTL ~10s,
  consumed once); opt out with `prefetch={false}`. Prefetch only follows the
  document path — never serverFn/RPC — and failures are ignored.
- `trailingSlash` (`"never" | "always"`): `Link`/`navigate` build canonical
  hrefs on SSR and in the browser (the client reads a `moons:trailing-slash`
  meta tag), so clicks never trigger a 308; a raw non-canonical request still
  gets a method-preserving 308 (exempt: `/`, `/_moons/**`, dotted asset paths).
- Loaders read the query string from `req.url`, e.g.
  `new URL(req.url).searchParams.get("q")`.

## 7. Errors, 404

- A loader that throws renders the nearest `_error.tsx` (status 500); unknown
  paths render the root `_404.tsx` (status 404). `_404` is root-only; `_error`
  may live in any directory (the closest boundary wins). Both render standalone
  (no layout).
- In development, `useRouteError()` returns the real error object; in
  production, no error detail is ever serialized into the payload.
- Runtime/compile errors print in the format:

  ```
  [moons] E_ROUTE_EXPORT_INVALID
  src/routes/about.tsx:3
  `src/routes/` only allows exports default|loader|meta
  Suggestion:
  - Remove the extra export
  ```

  Treat the code as the machine identifier; read `Suggestion:` (suggestions) for the
  intended fix.

## 8. Hard security rules (do not violate)

1. Never put secrets/`node:*`/`bun:*` imports into route files or components.
2. Never return secrets from loaders — payload data is public.
3. Never attempt to bypass `E_SERVER_IMPORT_IN_CLIENT` (dynamic import tricks,
   query suffixes, globs, symlinks — all are rejected).
4. Keep `*.server.ts` exports limited to serverFns (plus server-only helpers).
5. When a build says a canary leaked (`leakTest.canary`), fix the leak — never
   remove the canary.

## 9. Verification

```bash
moons check          # typegen + tsc + build client/server — must be green
moons routes --json  # inspect the actual route table
moons fns --json     # inspect serverFn hashes (must match .moons/fn-registry.json)
moons errors --json  # error catalog: code → trigger + suggestions (see `moons errors`)
moons audit --json   # security audit: RPC inventory, env() map, cookie flags, headers/CSP, deploy kit, dist scan
moons doctor --json  # diagnose: config, deps/duplicate framework copies, typegen freshness, port
moons test           # bun test with the serverFn-metadata preload
```

MCP (`moons-mcp`) exposes the same: `list_routes`, `get_fn_registry`,
`run_check`, `search_docs`, `explain_error` (for `[moons] E_...` codes),
`audit`, `run_typegen`, `scaffold_route` (creates route files following the
conventions — never overwrites) and `tail_dev_logs` (tails the CLI-managed
`.moons/dev.log` written by `moons dev`).

For app-level tests, dispatch requests in-process — no ports, no browser:

```ts
import { createTestServer } from "@moonsjs/vite/server";
const server = createTestServer({ routes, config, routesDir, loadRoute });
const res = await server.fetch("/search?q=alp"); // → Response
```

Run these with `moons test`: it preloads the serverFn metadata transform
(`@moonsjs/vite/testing/preload`), so modules importing `serverFn` load; plain
`bun test` cannot load them (the preload sets `globalThis.__moonsTestPreload`
for tests that want to skip under a plain run). Pass a path
(`moons test ./test/app.test.ts`) to run one file — a bare argument is a name
filter. `createTestServer` also accepts `apiRoutes` + `loadApi` (and
`apiMiddlewares` + `loadApiMiddleware`), so `src/api` handlers dispatch through
the same request handler used in production.

## 10. Recipes (canonical, CI-tested patterns)

Every recipe below links to real, compiled code in the cookbook repo (`moonsjs/cookbook`):

| Recipe                                | Pattern                                              |
| ------------------------------------- | ---------------------------------------------------- |
| `recipes/search-params.md`            | query string: loader + `useSearchParams` + `Link search` |
| `recipes/mutate-and-refresh.md`       | serverFn mutation + `refresh()`                      |
| `recipes/two-sided-validation.md`     | shared schema: client `safeParse` + server validation |
| `recipes/dynamic-routes.md`           | `[id]` routes, `useParams`, `Link params`, loader → serverFn |
| `recipes/custom-404-error.md`         | root `_404.tsx` / `_error.tsx`                       |
| `recipes/server-secrets-env.md`       | `.server.ts` isolation + `env()`                     |
| `recipes/testing.md`                  | `createTestServer` + unit tests                      |

> Note: recipe code is the source of truth in the `moonsjs/cookbook` repo; CI checks
> every link in `docs/ai/**` resolves.

## 11. Coming from Next.js / Remix — do this instead

| You might reach for                    | Moons equivalent                                    |
| -------------------------------------- | --------------------------------------------------- |
| `getServerSideProps` / `loader` export | `export const loader` in the page file |
| Server Actions / API route | `serverFn` in `*.server.ts` |
| `NEXT_PUBLIC_*` for secrets            | never — `env()` in `*.server.ts` only               |
| `response.json()` handlers             | return plain objects; devalue handles types         |
| React Router `useSearchParams`         | `useSearchParams()` (works during SSR too)          |
| SWR/React Query mutation + invalidate  | `await serverFn(...)` then `refresh()`              |
| `useEffect`-based data fetching        | loaders run on the server; no client fetching       |
| form actions / optimistic UI            | call the serverFn after client-side validation, then `refresh()` |

## 12. Reference

- `docs/ai/cli-json.md` — stable JSON schemas for `routes`, `fns`, `check`, `errors`, `audit`.
- https://docs.devmoon.net/api/core · `/api/server` · `/api/react` · `/api/vite` · `/api/cli` · `/api/mcp` — per-package API reference.
- https://docs.devmoon.net/architecture — the three zero-trust layers and the honest limits.
- https://docs.devmoon.net/getting-started/installation — the full walkthrough.

## 13. Config, deploy & operations

Validated `moons.config.ts` keys:

| Key | Shape |
| --- | --- |
| `routesDir` | `string` (default `"src/routes"`) |
| `context` | `(req) => ctx` — runs once per request, before middleware |
| `middleware` | `({ req, ctx, next }) => Promise<Response>`[] — call `next()` exactly once |
| `security.originWhitelist` | `string[]` — extra origins allowed to call RPC |
| `security.bodyLimitBytes` | `number` (default 1 MB) — RPC request bodies |
| `security.serverOnlyPackages` | `string[]` — extra packages blocked from client modules |
| `security.trustProxy` | `boolean` — trust `x-forwarded-*` (only behind a proxy you control) |
| `security.clientIpHeader` | `string` (default `x-forwarded-for`) — trusted client-IP header when trustProxy is on; use `cf-connecting-ip` behind Cloudflare; requires `trustProxy: true` |
| `headers` | `Record<string, string>` — extra response headers |
| `redirects` | `{ from, to, status? }[]` — status 301/302/307/308 (default 301) |
| `sitemap` | `{ site, exclude? }` — generated at build for prerendered paths |
| `robots` | `{ sitemap?: boolean, disallow?: string[] }` |
| `trailingSlash` | `"never" \| "always"` — 308 redirect policy |
| `requestTimeoutMs` | `number` (default 30000) — handler budget; `504 E_REQUEST_TIMEOUT`; `0` disables |
| `logging` | `{ accessLog?: boolean, json?: boolean, redact?: string[] }` |
| `isr` | `{ storage?: PrerenderStorage }` — shared store for revalidated pages |

Operational facts:

- `GET`/`HEAD /_moons/health` → `{"ok":true}`, handled before context and routes; other methods → `405`.
- `moons start` serves `dist/` with weak ETags (`304` on `If-None-Match`), gzip for text assets, and a graceful SIGTERM drain.
- Production host: `Bun.serve` on Bun, `node:http` on Node (override `MOONS_SERVER=bun|node`); both share static/ISR/ETag/gzip/trailing-slash/body-limit/header behavior.
- `requestTimeoutMs` (default 30s) bounds handlers on every transport (dev included) → `504 E_REQUEST_TIMEOUT`; Bun `idleTimeout` is aligned so the framework's 504 wins; `0` disables.
- Prerendered documents live in `dist/client`; a route with `export const revalidate = <seconds>` is regenerated in the background by `moons start`, written through `isr.storage` when configured.
- Rate limiting and session cookies are app-level: `createRateLimiter({ limit, windowMs })` + `getClientIp(req)`; `signCookie`/`verifyCookie` with a secret from `env()`.
- Behind Cloudflare: `trustProxy: true` + `clientIpHeader: "cf-connecting-ip"` (XFF is append-based and spoofable); lock the origin with Authenticated Origin Pulls/Tunnel; edge rate limits + Turnstile are documented in `guides/behind-cloudflare`.
