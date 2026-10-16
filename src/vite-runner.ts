import { MoonsError } from "@moonsjs/core";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** Cari bin vite (`node_modules/vite/bin/vite.js`) dari cwd ke atas. */
export function resolveViteBin(cwd: string): string {
  let current = cwd;
  while (true) {
    const candidate = join(current, "node_modules/vite/bin/vite.js");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new MoonsError({
        code: "E_INTERNAL",
        message: "`vite` not found in node_modules",
        details: "The project needs the `vite` dependency.",
        suggestions: ["Run `bun install` in the project root"],
      });
    }
    current = parent;
  }
}

function viteRuntime(): string {
  return typeof Bun !== "undefined" ? process.execPath : "bun";
}

/** Jalankan vite dengan runtime bun (deterministik; lihat decisions 0009). */
export async function spawnVite(cwd: string, args: string[]): Promise<number> {
  const viteBin = resolveViteBin(cwd);
  // Eksekusi file vite.js LANGSUNG dengan bun — melewati shebang (`env node`).
  // Di environment yang punya Node, `vite` polos maupun `bun x vite` mengikuti
  // shebang dan berjalan di Node, sehingga import sumber tanpa ekstensi
  // (mis. `./plugin`) gagal (docs/decisions/0009).
  const proc = Bun.spawn([viteRuntime(), viteBin, ...args], {
    cwd,
    env: process.env,
    stdio: ["inherit", "inherit", "inherit"],
  });
  return await proc.exited;
}

export interface ViteRunResult {
  code: number;
  output: string;
}

/** Varian capture (untuk `moons check`): stdout/stderr dikumpulkan, tidak dialirkan. */
export async function spawnViteCapture(cwd: string, args: string[]): Promise<ViteRunResult> {
  const viteBin = resolveViteBin(cwd);
  const proc = Bun.spawn([viteRuntime(), viteBin, ...args], {
    cwd,
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { code, output: `${stdout}${stderr}` };
}
