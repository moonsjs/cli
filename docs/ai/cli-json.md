# `moons` CLI — JSON output contract

Stable machine-readable surface for AI agents. These JSON
shapes are part of the public contract:

- Fields may be **added** in a minor release; existing fields never change
  meaning, are never renamed, and are never removed.
- In `--json` mode the command writes **one JSON document to stdout** and
  nothing else. stderr stays silent too — the framework CI enforces this.

## `moons routes --json`

No build required — results come from scanning `routesDir`. Filter with
`--kind=<page|layout|error|404>` (or `--kind page`) to get just the entries you
need (e.g. navigable pages only).

```jsonc
{
  "routesDir": "src/routes",
  "count": 6,
  "routes": [
    {
      "path": "/users/:id",              // runtime path pattern ("*" = catch-all)
      "file": "src/routes/users/[id].tsx", // posix path relative to the app root
      "key": "users/[id]",               // route key: file path w/o extension
      "kind": "page",                    // "page" | "layout" | "error" | "404"
      "params": ["id"],                  // dynamic segment names
      "layouts": ["_layout"],            // page only: layout keys root → leaf
      "prerender": true                  // present and true when the page opts into prerendering
    }
  ]
}
```

## `moons fns --json`

Scans every `*.server.{ts,tsx}` (excluding `node_modules`, `dist`, `.moons`,
`.git`) and analyzes `serverFn` exports.

```jsonc
{
  "count": 1,
  "fns": [
    {
      "key": "src/server/users.server.ts#getUser", // registry key (file#export)
      "hash": "0b86453c274ba6fc",                  // 16 hex chars, sha256-based
      "file": "src/server/users.server.ts",
      "export": "getUser",
      "line": 6
    }
  ],
  "registry": { "src/server/users.server.ts#getUser": "0b86453c274ba6fc" },
  // Every scanned *.server.{ts,tsx} file (including ones without a serverFn):
  "serverFiles": ["src/server/secrets.server.ts", "src/server/users.server.ts"]
}
```

`hash` is stable across dev/build/SSR; the same values are written to
`.moons/fn-registry.json` during `moons build`.

## `moons check --json`

Runs, in order: `typegen` → `tsc --noEmit` (TypeScript from the app's
`node_modules`) → `build client` → `build server` → `prerender`.

```jsonc
{
  "ok": true,                    // true only if every step is ok
  "steps": [
    { "name": "typegen", "ok": true, "durationMs": 97 },
    { "name": "tsc --noEmit", "ok": true, "durationMs": 780 },
    { "name": "build client", "ok": true, "durationMs": 530 },
    { "name": "build server", "ok": true, "durationMs": 520 },
    { "name": "prerender", "ok": true, "durationMs": 340 }
  ]
}
```

- A failing step gets `"ok": false`, `durationMs`, and — for process steps — an
  exit `code`. Failing build/tsc output is **not** inlined into the JSON; run
  the command without `--json` to see the full output, or run the failing step
  directly.
- Exit code is `0` only when `ok: true`, `1` otherwise.
- `moons build` inside `check` runs the same zero-trust transforms as a normal
  build: a leaked canary or an illegal import fails `build client`/`build
  server` here too.

## `moons errors --json`

Machine-readable error catalog — the structured source is
`ERROR_CATALOG` in `@moonsjs/core`; it must contain every `MOONS_ERROR_CODES`.

```jsonc
{
  "moonsVersion": "0.1.14",
  "count": 13,
  "errors": [
    {
      "code": "E_SCHEMA_LOCAL_REF",
      "trigger": "A serverFn `input`/`output` schema references a local declaration …",
      "details": "The client stub only carries imports + schema expressions …",
      "suggestions": ["Inline the schema …", "Import the schema from a client-safe shared module …"]
    }
  ]
}
```

## `moons audit --json`

Shape: `{ ok, counts: { pass, warn, fail }, checks: [{ id, level, title, detail? }] }`.

Check ids: `rpc-inventory`, `env-access`, `cookie-flags`, `headers-csp`, `deploy-kit`, `dist-scan`. Exit code `1` when any check fails (`--strict` also fails on warnings); stdout stays valid JSON and stderr stays silent.

## Agent loop

```bash
moons routes --json   # 1. learn the app's shape
# ...write code...
moons check --json    # 2. verify: typegen + types + zero-trust build
# on failure: rerun `moons check` (no --json) and read the [moons] error format
moons errors --json   # 3. look up error codes: trigger + details + suggestions
```
