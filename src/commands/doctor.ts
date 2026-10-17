import { MOONS_VERSION } from "@moonsjs/core";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { loadProjectConfig } from "../config-load";

/**
 * Addendum P — `moons doctor`: diagnosa mandiri satu perintah untuk manusia dan
 * agen. Semua temuan mesin-baca (`--json`), skema stabil di `docs/ai/cli-json.md`.
 */

export interface DoctorCheck {
  id: string;
  level: "pass" | "warn" | "fail";
  title: string;
  detail?: string;
  hint?: string;
}

export interface DoctorJson {
  moonsVersion: string;
  ok: boolean;
  counts: { pass: number; warn: number; fail: number };
  checks: DoctorCheck[];
}

export interface DoctorOptions {
  /** Bila true, peringatan juga menggagalkan (exit 1) — sama dengan `audit --strict`. */
  strict?: boolean;
  /** Sumber env untuk deteksi port (default `process.env`). */
  env?: Record<string, string | undefined>;
}

const WORKSPACE_PACKAGES = ["core", "server", "react", "vite"] as const;
const PEER_PACKAGES = ["react", "react-dom", "zod"] as const;

export function readPackageVersion(dir: string): string | null {
  const file = join(dir, "package.json");
  if (!existsSync(file)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

function minorOf(version: string): string {
  const [major, minor] = version.split(".");
  return `${major ?? version}.${minor ?? "0"}`;
}

/**
 * Semua salinan `@moonsjs/<pkg>` yang dapat di-resolve dari app: langsung
 * (`node_modules/@moonsjs/<pkg>`) dan bersarang satu level
 * (`node_modules/<dep>/node_modules/@moonsjs/<pkg>`, termasuk dep ber-scope).
 * Dua salinan = dua instans modul di proses yang sama (kelas bug orde-dependen).
 */
export function findMoonsCopies(root: string, pkg: string): string[] {
  const copies: string[] = [];
  const direct = join(root, "node_modules", "@moonsjs", pkg);
  if (existsSync(join(direct, "package.json"))) {
    copies.push(direct);
  }
  const nodeModules = join(root, "node_modules");
  if (!existsSync(nodeModules)) {
    return copies;
  }
  const visitParent = (parentDir: string): void => {
    const nested = join(parentDir, "node_modules", "@moonsjs", pkg);
    if (existsSync(join(nested, "package.json"))) {
      copies.push(nested);
    }
  };
  for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue;
    }
    if (entry.name.startsWith(".")) {
      continue;
    }
    if (entry.name.startsWith("@")) {
      const scopeDir = join(nodeModules, entry.name);
      let children: ReadonlyArray<import("node:fs").Dirent> = [];
      try {
        children = readdirSync(scopeDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const child of children) {
        visitParent(join(scopeDir, child.name));
      }
      continue;
    }
    visitParent(join(nodeModules, entry.name));
  }
  return copies;
}

function newestMtimeMs(dir: string): number | null {
  if (!existsSync(dir)) {
    return null;
  }
  let newest: number | null = null;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = newestMtimeMs(full);
      if (nested !== null && (newest === null || nested > newest)) {
        newest = nested;
      }
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const stamp = statSync(full).mtimeMs;
    if (newest === null || stamp > newest) {
      newest = stamp;
    }
  }
  return newest;
}

/** Kemasan paket `@moonsjs/*` + peer: ada/tidak, duplikat, dan keselarasan minor. */
export function checkDeps(root: string): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const versions: string[] = [];
  const missing: string[] = [];

  for (const pkg of WORKSPACE_PACKAGES) {
    const version = readPackageVersion(join(root, "node_modules", "@moonsjs", pkg));
    if (version === null) {
      missing.push(`@moonsjs/${pkg}`);
    } else {
      versions.push(version);
    }
  }
  checks.push(
    missing.length === 0
      ? {
          id: "deps.installed",
          level: "pass",
          title: "framework packages installed",
          detail: versions.map((v) => v).join(" · "),
        }
      : {
          id: "deps.installed",
          level: "fail",
          title: `missing framework packages: ${missing.join(", ")}`,
          hint: "Run `bun install` in the project root",
        },
  );

  const peersMissing = PEER_PACKAGES.filter(
    (pkg) => readPackageVersion(join(root, "node_modules", pkg)) === null,
  );
  checks.push(
    peersMissing.length === 0
      ? { id: "deps.peer", level: "pass", title: "react, react-dom, zod present" }
      : {
          id: "deps.peer",
          level: "warn",
          title: `missing peer packages: ${peersMissing.join(", ")}`,
          hint: "Run `bun install`; UI routes need react + react-dom",
        },
  );

  const duplicated: string[] = [];
  for (const pkg of WORKSPACE_PACKAGES) {
    const copies = findMoonsCopies(root, pkg);
    if (copies.length > 1) {
      duplicated.push(
        `@moonsjs/${pkg} ×${copies.length} (${copies.map((copy) => relative(root, copy)).join(", ")})`,
      );
    }
  }
  checks.push(
    duplicated.length === 0
      ? { id: "deps.duplicates", level: "pass", title: "one copy per @moonsjs package" }
      : {
          id: "deps.duplicates",
          level: "fail",
          title: "duplicate @moonsjs packages found",
          detail: duplicated.join(" · "),
          hint:
            "Two module instances in one process clobber process-wide state. " +
            "Remove the nested copies (delete node_modules and re-install with matching ranges)",
        },
  );

  const minors = new Set(versions.map(minorOf));
  checks.push(
    minors.size <= 1
      ? { id: "deps.versions", level: "pass", title: "framework versions share one minor" }
      : {
          id: "deps.versions",
          level: "warn",
          title: "mixed framework minor versions",
          detail: [...minors].join(" · "),
          hint: "All @moonsjs/* packages should come from the same release wave",
        },
  );

  return checks;
}

/** Typegen (`moons typegen`) ada dan tidak lebih tua dari sumber route. */
export function checkTypegen(root: string, routesDir: string): DoctorCheck[] {
  const moonsDir = join(root, ".moons");
  const routesDts = join(moonsDir, "routes.d.ts");
  const contextDts = join(moonsDir, "context.d.ts");
  const missing = [routesDts, contextDts].filter((file) => !existsSync(file));
  if (missing.length > 0) {
    return [
      {
        id: "typegen.files",
        level: "warn",
        title: "typegen output missing",
        detail: missing.map((file) => relative(root, file)).join(", "),
        hint: "Run `moons typegen` (or `moons check`) to regenerate `.moons/*.d.ts`",
      },
    ];
  }
  const newestSource = newestMtimeMs(join(root, routesDir));
  const stamp = Math.min(statSync(routesDts).mtimeMs, statSync(contextDts).mtimeMs);
  if (newestSource !== null && newestSource > stamp) {
    return [
      {
        id: "typegen.fresh",
        level: "warn",
        title: "typegen output is older than route files",
        detail: `${relative(root, routesDir)} changed after .moons/*.d.ts`,
        hint: "Run `moons typegen` (or `moons check`) to refresh types",
      },
    ];
  }
  return [{ id: "typegen.fresh", level: "pass", title: "typegen output is fresh" }];
}

/** `vite.config.ts` ada dan memuat canary zero-trust (`leakTest.canary`). */
export function checkCanary(root: string): DoctorCheck[] {
  const viteConfig = join(root, "vite.config.ts");
  if (!existsSync(viteConfig)) {
    return [
      {
        id: "project.vite-config",
        level: "warn",
        title: "vite.config.ts not found",
        hint: "The Moons Vite plugin (and the leak canary) live in vite.config.ts",
      },
    ];
  }
  const text = readFileSync(viteConfig, "utf8");
  const hasLeakTest = /leakTest/.test(text) && /canary/.test(text);
  return [
    hasLeakTest
      ? { id: "project.canary", level: "pass", title: "leak canary configured (leakTest.canary)" }
      : {
          id: "project.canary",
          level: "warn",
          title: "leak canary not configured",
          detail: "vite.config.ts has no `leakTest.canary`",
          hint: "Add `moons({ leakTest: { canary: \"MOONS_APP_CANARY_…\" } })` and place the same string in a server-only file",
        },
  ];
}

/** Versi runtime yang terpasang (Bun/Node) — konteks untuk laporan. */
export function checkRuntime(): DoctorCheck[] {
  const bunVersion = process.versions.bun ?? "unknown";
  const bunCheck: DoctorCheck = {
    id: "runtime.bun",
    level: "pass",
    title: `bun ${bunVersion}`,
  };
  const which = (globalThis as { Bun?: { which(command: string): string | null } }).Bun?.which;
  const nodePath = typeof which === "function" ? which("node") : null;
  const nodeCheck: DoctorCheck =
    nodePath === null
      ? {
          id: "runtime.node",
          level: "warn",
          title: "node not found on PATH",
          hint: "Moons runs on Bun and Node; install Node if you deploy the bundle to a Node host",
        }
      : { id: "runtime.node", level: "pass", title: `node at ${nodePath}` };
  return [bunCheck, nodeCheck];
}

async function checkPort(env: Record<string, string | undefined>): Promise<DoctorCheck[]> {
  const raw = env["PORT"] ?? "3000";
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return [
      {
        id: "port.availability",
        level: "warn",
        title: `invalid PORT value \`${raw}\``,
        hint: "PORT must be an integer between 1 and 65535",
      },
    ];
  }
  const bun = (globalThis as { Bun?: typeof import("bun") }).Bun;
  if (bun === undefined) {
    return [];
  }
  const busy = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 300);
    bun
      .connect({
        hostname: "127.0.0.1",
        port,
        socket: {
          data() {},
          open() {},
          error() {},
          close() {},
        },
      })
      .then((socket) => {
        clearTimeout(timer);
        socket.end();
        resolve(true);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(false);
      });
  });
  return [
    busy
      ? {
          id: "port.availability",
          level: "warn",
          title: `port ${port} is in use`,
          hint: `\`moons dev\` / \`moons start\` will fail on :${port}; set PORT or stop the other process`,
        }
      : { id: "port.availability", level: "pass", title: `port ${port} is free` },
  ];
}

/** Jalankan semua pemeriksaan; murni-statis selain pemuatan config dan port. */
export async function executeDoctor(cwd: string, options: DoctorOptions = {}): Promise<DoctorJson> {
  const checks: DoctorCheck[] = [];
  checks.push(...checkRuntime());

  let routesDir = "src/routes";
  const configPath = join(cwd, "moons.config.ts");
  try {
    const project = await loadProjectConfig(cwd);
    routesDir = project.config.routesDir ?? routesDir;
    checks.push({
      id: "project.config",
      level: "pass",
      title: "moons.config.ts loads",
      detail: relative(cwd, project.configPath) || "moons.config.ts",
    });
  } catch (error) {
    checks.push({
      id: "project.config",
      level: "fail",
      title: existsSync(configPath) ? "moons.config.ts failed to load" : "moons.config.ts not found",
      detail: error instanceof Error ? (error.message.split("\n")[0] ?? String(error)) : String(error),
      hint: "This command must run in a Moons project root",
    });
  }

  checks.push(...checkCanary(cwd));
  checks.push(...checkDeps(cwd));
  checks.push(...checkTypegen(cwd, routesDir));
  checks.push(...(await checkPort(options.env ?? process.env)));

  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const check of checks) {
    counts[check.level] += 1;
  }
  const ok = counts.fail === 0 && (!(options.strict ?? false) || counts.warn === 0);
  return { moonsVersion: MOONS_VERSION, ok, counts, checks };
}

/** `moons doctor [--json] [--strict]` — exit 1 bila ada `fail` (atau `warn` dengan `--strict`). */
export async function runDoctor(
  cwd: string,
  args: ReadonlyArray<string>,
  env: Record<string, string | undefined> = process.env,
): Promise<number> {
  const json = args.includes("--json");
  const strict = args.includes("--strict");
  const result = await executeDoctor(cwd, { strict, env });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[moons] doctor — ${result.moonsVersion}`);
    for (const check of result.checks) {
      const label = check.level.toUpperCase().padEnd(5);
      console.log(`${label} ${check.id}: ${check.title}`);
      if (check.detail !== undefined && check.detail.length > 0) {
        console.log(`      ${check.detail}`);
      }
      if (check.hint !== undefined && check.hint.length > 0) {
        console.log(`      hint: ${check.hint}`);
      }
    }
    console.log(
      `summary: ${result.counts.pass} pass · ${result.counts.warn} warn · ${result.counts.fail} fail`,
    );
  }
  return result.ok ? 0 : 1;
}
