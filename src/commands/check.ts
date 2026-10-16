import { generateTypes } from "@moonsjs/core";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadProjectConfig } from "../config-load";
import { spawnViteCapture } from "../vite-runner";

export interface CheckStep {
  name: string;
  ok: boolean;
  durationMs: number;
  /** Exit code proses (bila langkah menjalankan proses). */
  code?: number;
  message?: string;
}

export interface CheckJson {
  ok: boolean;
  steps: CheckStep[];
}

export interface ExecuteCheckOptions {
  /** true = tidak menulis log apa pun ke stdout/stderr (dipakai MCP). */
  quiet?: boolean;
}

/** Cari `typescript/bin/tsc` dari cwd ke atas. */
export function resolveTsBin(cwd: string): string | null {
  let current = cwd;
  while (true) {
    const candidate = join(current, "node_modules/typescript/bin/tsc");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function summarize(steps: CheckStep[]): CheckJson {
  return { ok: steps.every((step) => step.ok), steps };
}

/**
 * Jalankan `moons check` sebagai fungsi murni (Addendum A.4):
 * typegen → tsc --noEmit → build client + server. Tidak pernah throw untuk
 * kegagalan langkah — hasilnya dilaporkan lewat `CheckJson`.
 */
export async function executeCheck(
  cwd: string,
  options: ExecuteCheckOptions = {},
): Promise<CheckJson> {
  const quiet = options.quiet ?? false;
  const steps: CheckStep[] = [];

  const record = async (
    name: string,
    run: () => Promise<{ code?: number; output?: string; message?: string } | null>,
  ): Promise<boolean> => {
    const started = now();
    const result = await run();
    const durationMs = Math.round(now() - started);
    if (result === null) {
      steps.push({ name, ok: true, durationMs });
      if (!quiet) {
        console.log(`[moons] check: ${name} ... ok (${durationMs}ms)`);
      }
      return true;
    }
    const step: CheckStep = { name, ok: false, durationMs };
    if (result.code !== undefined) {
      step.code = result.code;
    }
    if (result.message !== undefined) {
      step.message = result.message;
    }
    steps.push(step);
    if (!quiet) {
      console.error(`[moons] check: ${name} ... FAILED (${durationMs}ms)`);
      if (result.output !== undefined && result.output.trim().length > 0) {
        console.error(result.output.trimEnd());
      }
    }
    return false;
  };

  // 1) typegen (.moons/*.d.ts segar — dipakai tsc).
  const typegenOk = await record("typegen", async () => {
    const { config, configPath } = await loadProjectConfig(cwd);
    await generateTypes({
      routesDir: resolve(cwd, config.routesDir),
      configPath,
      outDir: resolve(cwd, ".moons"),
    });
    return null;
  });
  if (!typegenOk) {
    return summarize(steps);
  }

  // 2) tsc --noEmit via typescript milik project.
  const tscOk = await record("tsc --noEmit", async () => {
    const tsBin = resolveTsBin(cwd);
    if (tsBin === null) {
      return {
        message: "`typescript` not found in node_modules",
        output: "Suggestion: `bun add -d typescript` in the project root.",
      };
    }
    const runtime = typeof Bun !== "undefined" ? process.execPath : "bun";
    const proc = Bun.spawn([runtime, tsBin, "--noEmit"], {
      cwd,
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const code = await proc.exited;
    if (code === 0) {
      return null;
    }
    return { code, output: `${stdout}${stderr}` };
  });
  if (!tscOk) {
    return summarize(steps);
  }

  // 3) build client + server (leak-check/transform §12 berjalan di dalam Vite).
  for (const [name, viteArgs] of [
    ["build client", ["build"]],
    ["build server", ["build", "--ssr"]],
  ] as const) {
    const buildOk = await record(name, async () => {
      const result = await spawnViteCapture(cwd, [...viteArgs]);
      if (result.code === 0) {
        return null;
      }
      return { code: result.code, output: result.output };
    });
    if (!buildOk) {
      return summarize(steps);
    }
  }

  // 4) D.5: runner prerender (no-op bila tidak ada route ber-prerender).
  const prerenderOk = await record("prerender", async () => {
    const process = Bun.spawn({
      cmd: ["bun", "dist/server/prerender.js"],
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await process.exited;
    if (code === 0) {
      return null;
    }
    const stdout = await new Response(process.stdout).text();
    const stderr = await new Response(process.stderr).text();
    return { code, output: `${stdout}${stderr}` };
  });
  if (!prerenderOk) {
    return summarize(steps);
  }

  return summarize(steps);
}

/**
 * `moons check [--json]` (Addendum A.4): exit code 0 hanya bila semua langkah
 * hijau. `--json` menulis satu dokumen JSON ke stdout (log ke stderr dimatikan).
 */
export async function runCheck(cwd: string, args: ReadonlyArray<string>): Promise<number> {
  const asJson = args.includes("--json");
  const result = await executeCheck(cwd, { quiet: asJson });

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log("[moons] check OK — typegen + tsc + build client/server + prerender passed");
  } else {
    console.error("[moons] check FAILED — fix the failing step(s), then re-run");
  }
  return result.ok ? 0 : 1;
}
