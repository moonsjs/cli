import { fnRegistryKey } from "@moonsjs/core";
import { analyzeServerFile, scanServerFiles } from "@moonsjs/vite/transform";
import { readFileSync } from "node:fs";
import { relative } from "node:path";

export interface FnJsonEntry {
  /** `<file-relatif>#<export>` (bentuk §21.3). */
  key: string;
  /** 16 hex pertama sha256 (PRD §12.2). */
  hash: string;
  /** Path file relatif project (posix). */
  file: string;
  export: string;
  line: number;
}

export interface FnsJson {
  count: number;
  fns: FnJsonEntry[];
  registry: Record<string, string>;
  /** Semua file `*.server.{ts,tsx}` hasil scan (posix, relatif project, sorted). */
  serverFiles: string[];
}

function toPosix(path: string): string {
  return path.split("\\").join("/");
}

/** Scan semua `*.server.{ts,tsx}` + analisis serverFn (tanpa build). */
export function collectFns(cwd: string): FnsJson {
  const files = scanServerFiles(cwd);
  const fns: FnJsonEntry[] = [];
  const registry: Record<string, string> = {};

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const analysis = analyzeServerFile(source, file, cwd);
    for (const fn of analysis.serverFns) {
      const key = fnRegistryKey(cwd, file, fn.name);
      registry[key] = fn.hash;
      fns.push({
        key,
        hash: fn.hash,
        file: toPosix(relative(cwd, file)),
        export: fn.name,
        line: fn.line,
      });
    }
  }

  fns.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  const serverFiles = files.map((file) => toPosix(relative(cwd, file))).sort();
  return { count: fns.length, fns, registry, serverFiles };
}

/** Render tabel ringkas untuk mode non-JSON. */
export function formatFns(json: FnsJson): string {
  const lines = [
    `[moons] fns (${json.count})`,
    ...json.serverFiles.map((file) => `  server-only: ${file}`),
  ];
  for (const fn of json.fns) {
    lines.push(`  ${fn.hash}  ${fn.export.padEnd(16)} ${fn.file}:${fn.line}`);
  }
  return lines.join("\n");
}

/** `moons fns [--json]` (Addendum A.4). */
export function runFns(cwd: string, args: ReadonlyArray<string>): void {
  const json = collectFns(cwd);
  if (args.includes("--json")) {
    console.log(JSON.stringify(json, null, 2));
    return;
  }
  console.log(formatFns(json));
}
