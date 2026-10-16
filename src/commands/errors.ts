import { ERROR_CATALOG, MOONS_VERSION, type ErrorCatalogEntry } from "@moonsjs/core";

export interface ErrorsJson {
  moonsVersion: string;
  count: number;
  errors: ErrorCatalogEntry[];
}

/** Katalog error machine-readable (Addendum B.6). */
export function catalogJson(): ErrorsJson {
  return {
    moonsVersion: MOONS_VERSION,
    count: ERROR_CATALOG.length,
    errors: ERROR_CATALOG.map((entry) => ({ ...entry })),
  };
}

function formatErrors(json: ErrorsJson): string {
  const lines = [`[moons] errors (${json.count}) — Moons ${json.moonsVersion}`];
  for (const entry of json.errors) {
    lines.push(`  ${entry.code}`);
    lines.push(`    ${entry.trigger}`);
  }
  return lines.join("\n");
}

/** `moons errors [--json]` (Addendum B.6). */
export function runErrors(args: ReadonlyArray<string>): void {
  const json = catalogJson();
  if (args.includes("--json")) {
    console.log(JSON.stringify(json, null, 2));
    return;
  }
  console.log(formatErrors(json));
}
