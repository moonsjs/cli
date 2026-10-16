# Recipe: server-only secrets & `env()`

Source of truth: [`src/server/store.server.ts`](https://github.com/moonsjs/cookbook/blob/main/src/server/store.server.ts)
and [`src/server/notes.server.ts`](https://github.com/moonsjs/cookbook/blob/main/src/server/notes.server.ts)

`*.server.ts` is the only place for secrets, credentials, and `node:*` imports.
In the client build these files are replaced by RPC stubs — the compiler proves
it (see the canary check in
[`examples/cookbook/vite.config.ts`](https://github.com/moonsjs/cookbook/blob/main/vite.config.ts)).

```ts
// src/server/store.server.ts (never shipped to the client)
export const FAKE_SECRET = "cookbook-fake-secret-should-not-leak";

// src/server/notes.server.ts
import { env, serverFn } from "@moonsjs/server";

export const greetFromEnv = serverFn({
  input: z.object({ name: z.string().min(1) }),
  output: z.string(),
  handler: async ({ input }) => `${env<string>("COOKBOOK_PREFIX") || "hello"}, ${input.name}!`,
});
```

Rules:

- `env()` outside the server (route files, components) fails the build with
  `E_ENV_IN_CLIENT`. Public values only via Vite's `import.meta.env.VITE_*`.
- Never return secrets from loaders — loader data is embedded in the HTML payload.
- Belt and braces: set `leakTest.canary` in `vite.config.ts`; the build fails if
  the canary ever appears in `dist/client/**`. Keep the canary even when the app
  seems fine.
