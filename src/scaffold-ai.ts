import { scanRoutes } from "@moonsjs/core";
import { relative, resolve } from "node:path";

const CONTEXT_URL = "https://docs.devmoon.net/raw/ai/CONTEXT.md";

export interface ScaffoldAiOptions {
  /** Direktori app hasil scaffold. */
  targetDir: string;
  packageName: string;
}

function toPosix(path: string): string {
  return path.split("\\").join("/");
}

function routeRows(targetDir: string): string[] {
  try {
    const routes = scanRoutes(resolve(targetDir, "src", "routes"));
    if (routes.length === 0) {
      return ["_belum ada route — jalankan `moons routes --json` untuk peta terbaru._"];
    }
    return routes.map(
      (route) =>
        `| \`${route.path}\` | \`${toPosix(relative(targetDir, route.file))}\` | ${route.kind} |`,
    );
  } catch {
    return ["_jalankan `moons routes --json` untuk peta route terbaru._"];
  }
}

/** `AGENTS.md` di app hasil `moons create` (Addendum A.5) — bahasa Inggris untuk agen. */
export function renderAgentsMd(options: ScaffoldAiOptions): string {
  const { packageName, targetDir } = options;
  return [
    `# AGENTS.md — ${packageName}`,
    "",
    "This is a **Moons** app (zero-trust full-stack TypeScript framework). Server",
    "code can never leak into the client: `*.server.ts` files are compiled to RPC",
    "stubs in the browser, and bypass attempts fail the build.",
    "",
    "## Commands",
    "",
    "```bash",
    "bunx moons dev             # dev server (HMR, port 3000)",
    "bunx moons check           # definition of done: typegen -> tsc -> build",
    "bunx moons routes --json   # live route table (no build)",
    "bunx moons fns --json      # serverFn registry + server-only files",
    "bunx moons build && bunx moons start   # production (NODE_ENV=production)",
    "```",
    "",
    "(`@moonsjs/cli` is a devDependency of this app; `bunx moons` runs the local copy.)",
    "",
    "Offline framework docs ship with the CLI package:",
    "`node_modules/@moonsjs/cli/docs/ai/CONTEXT.md` (+ `docs/llms.txt`).",
    "",
    "Run `bunx moons check` before declaring any change finished.",
    "",
    "## Hard rules (build fails otherwise)",
    "",
    "1. Secrets, `node:*`, `bun:*` imports live **only** in `*.server.ts`.",
    "2. Route files export only `default | loader | meta` (layout: `default | loader`;",
    "   `_404`/`_error`: `default`).",
    "3. Never return secrets from loaders — loader data is embedded in the HTML payload.",
    "4. Never try to work around `E_SERVER_IMPORT_IN_CLIENT`; the rejection is the product.",
    "",
    "## Routes in this app (generated at create time)",
    "",
    "This table can go stale as you add routes — run `bunx moons routes --json`",
    "for the live table at any time.",
    "",
    "| Path | File | Kind |",
    "| --- | --- | --- |",
    ...routeRows(targetDir),
    "",
    `Full framework context for agents: ${CONTEXT_URL}`,
    "",
  ].join("\n");
}

/** `llms.txt` di app hasil `moons create` — indeks konteks untuk agen. */
export function renderScaffoldLlmsTxt(options: { packageName: string }): string {
  return [
    `# ${options.packageName}`,
    "",
    "Moons app (zero-trust full-stack TypeScript framework).",
    "",
    `- Framework context for agents: ${CONTEXT_URL}`,
    "- Offline copy (bundled with the CLI): node_modules/@moonsjs/cli/docs/ai/CONTEXT.md",
    "- Live route table: run `bunx moons routes --json`",
    "- Server function registry: run `bunx moons fns --json`",
    "- Verify changes: `bunx moons check`",
    "",
  ].join("\n");
}
