import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { MoonsError } from "@moonsjs/core";

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
/**
 * Versi per-paket untuk template `create` mode published (aturan proses
 * wave 0.7.0: rilis hanya paket yang berubah). Setiap `@moonsjs/*` yang
 * ditulis `workspace:*` di template WAJIB punya entri di sini — dijaga test.
 */
export const PUBLISHED_VERSIONS: Record<string, string> = {
  "@moonsjs/core": "0.6.0",
  "@moonsjs/server": "0.6.0",
  "@moonsjs/react": "0.6.0",
  "@moonsjs/vite": "0.7.0",
  "@moonsjs/cli": "0.7.1",
};

/** Versi terbit untuk sebuah paket; melempar bila template belum diperbarui. */
export function publishedVersionFor(packageName: string): string {
  const version = PUBLISHED_VERSIONS[packageName];
  if (version === undefined) {
    throw new MoonsError({
      code: "E_INTERNAL",
      message: `no published version registered for \`${packageName}\``,
      details:
        "The CLI template rewrites `workspace:*` ranges for standalone apps; " +
        "every @moonsjs package in the template needs an entry in PUBLISHED_VERSIONS.",
      suggestions: ["Add the package to PUBLISHED_VERSIONS in src/util.ts"],
    });
  }
  return version;
}

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
