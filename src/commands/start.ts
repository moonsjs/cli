import { MoonsError } from "@moonsjs/core";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * `moons start` = server production: pastikan `NODE_ENV=production` walau shell
 * user tidak mengekspornya. Tanpa ini, jalur production (tanpa detail error di
 * payload §16.6) tidak aktif dan pesan loader bocor ke response (temuan eval T4;
 * docs/decisions/0015). Nilai eksplisit dari user dipertahankan.
 */
export function ensureProductionEnv(env: Record<string, string | undefined> = process.env): void {
  if (env["NODE_ENV"] === undefined) {
    env["NODE_ENV"] = "production";
  }
}

/**
 * `moons start` (PRD §10.5): load `dist/server/index.js` in-process.
 * Entry menyalakan server (node:http) dan menangani SIGTERM (drain, §19.5).
 */
export async function runStart(cwd: string): Promise<void> {
  const entry = join(cwd, "dist/server/index.js");
  if (!existsSync(entry)) {
    throw new MoonsError({
      code: "E_INTERNAL",
      file: entry,
      message: "`dist/server/index.js` tidak ditemukan",
      details: "Hasil build belum ada.",
      suggestions: ["Jalankan `moons build` lebih dulu"],
    });
  }

  ensureProductionEnv();
  await import(pathToFileURL(entry).href);
}
