import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/** Root repo (dipakai saat CLI dijalankan dari source di dalam monorepo). */
/** Root paket cli (repo ini) — dipakai test & templateDir. */
export const repoRoot = resolve(import.meta.dir, "..");

/**
 * Template untuk `moons create`:
 * 1. `template/` di dalam paket CLI (dibuat saat prepack; wajib ikut terpack —
 *    app dari registry tidak punya akses ke repo).
 * 2. Fallback dev: `examples/basic` (template asli di repo).
 */
export const templateDir = existsSync(join(resolve(import.meta.dir, ".."), "template"))
  ? join(resolve(import.meta.dir, ".."), "template")
  : join(repoRoot, "template");

/** Versi paket framework yang dipublikasikan (dipakai `create` di luar workspace). */
export const PUBLISHED_FRAMEWORK_VERSION = "0.2.0";

/**
 * Cari workspace root yang memuat `targetDir` sebagai anggota. Mendukung pola
 * `dir/*` dan path literal. Null bila target bukan anggota workspace.
 */
export function detectWorkspaceRoot(targetDir: string): string | null {
  let current = resolve(targetDir);

  while (true) {
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    const packageJsonPath = join(parent, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
          workspaces?: unknown;
        };
        if (Array.isArray(pkg.workspaces)) {
          const relativePath = relative(parent, targetDir).split("\\").join("/");
          for (const pattern of pkg.workspaces) {
            if (typeof pattern === "string" && matchesWorkspacePattern(relativePath, pattern)) {
              return parent;
            }
          }
        }
      } catch {
        // package.json tidak valid → lanjut ke atas
      }
    }
    current = parent;
  }
}

export function matchesWorkspacePattern(relativePath: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`).test(relativePath);
}
