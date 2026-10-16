# Recipe: app-level testing

Source of truth: [`examples/cookbook/test/cookbook.test.ts`](../../../examples/cookbook/test/cookbook.test.ts)

Two layers:

1. **Pure unit tests** (bun:test) for helpers outside `src/routes/` and for the
   shared schemas.
2. **In-process HTTP tests** with `createTestServer` — no ports, no browser.

```ts
import { scanRoutes, type MoonsConfig, type RouteModule } from "@moonsjs/core";
import { createTestServer } from "@moonsjs/vite/server";

const routesDir = join(import.meta.dir, "..", "src", "routes");
const routes = scanRoutes(routesDir);
const config: MoonsConfig = {
  routesDir: "src/routes",
  context: async () => ({ requestId: "test", url: "" }),
};
const loadRoute: Record<string, () => Promise<RouteModule>> = {
  _layout: async () => (await import("../src/routes/_layout")) as unknown as RouteModule,
  search: async () => (await import("../src/routes/search")) as unknown as RouteModule,
};

const server = createTestServer({ routes, config, routesDir, loadRoute });
const res = await server.fetch("/search?q=alp"); // → Response
```

- `loadRoute` maps **route keys** (see `moons routes --json`) to the imported
  route modules; layouts used by a page must be present too.
- Client stubs validate too (same schema, before fetch). To unit-test that path,
  build the stub directly — `__moons_createStub` from `@moonsjs/server/client` —
  and stub `globalThis.fetch`; see `packages/server/test/standard-schema.test.ts`
  in the framework repo for a worked example (including disabling the SSR
  in-process hook so the HTTP path is exercised).
- For end-to-end proof (build + real server + leak canary), see
  `scripts/cookbook/test-cookbook.sh` in the framework repo — apps can copy the
  pattern for their own CI.
