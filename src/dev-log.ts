import { createWriteStream, existsSync, mkdirSync, statSync, truncateSync, type WriteStream } from "node:fs";
import { join } from "node:path";

/** Batas ukuran `.moons/dev.log` sebelum dipotong di awal sesi (L.4). */
export const MAX_DEV_LOG_BYTES = 1_000_000;

/**
 * Buka (dan rotasi bila perlu) log dev `.moons/dev.log` — file yang dibaca
 * `tail_dev_logs` MCP. Dipotong bila sudah melewati batas ukuran.
 */
export function openDevLog(cwd: string): { path: string; stream: WriteStream } {
  const outDir = join(cwd, ".moons");
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, "dev.log");
  if (existsSync(path) && statSync(path).size > MAX_DEV_LOG_BYTES) {
    truncateSync(path, 0);
  }
  return { path, stream: createWriteStream(path, { flags: "a" }) };
}
