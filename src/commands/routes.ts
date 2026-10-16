import {
  findLayouts,
  MoonsError,
  routeKeyFromFile,
  scanApiRoutes,
  scanRoutes,
  type RouteDefinition,
} from "@moonsjs/core";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { loadProjectConfig } from "../config-load";

export interface RouteJsonEntry {
  path: string;
  /** Path file relatif project (posix). */
  file: string;
  /** Key route (PRD §13), mis. `users/[id]`. */
  key: string;
  kind: RouteDefinition["kind"] | "api";
  params: string[];
  /** Hanya untuk kind `page`: rantai layout root→leaf (key). */
  layouts?: string[];
  /** Hanya untuk kind `api`: method handler yang diekspor (Addendum D.1). */
  methods?: string[];
  /** Hanya untuk kind `page`: literal `export const prerender` (Addendum D.5). */
  prerender?: boolean;
}

export interface RoutesJson {
  routesDir: string;
  count: number;
  routes: RouteJsonEntry[];
}

function toPosix(path: string): string {
  return path.split("\\").join("/");
}

/** Scan route tanpa build (dipakai `moons routes` + `moons check`). */
export async function collectRoutes(cwd: string): Promise<RoutesJson> {
  const { config } = await loadProjectConfig(cwd);
  const routesDir = resolve(cwd, config.routesDir);
  const routes = scanRoutes(routesDir);

  const entries: RouteJsonEntry[] = routes.map((route) => {
    const key = routeKeyFromFile(routesDir, route.file);
    const entry: RouteJsonEntry = {
      path: route.path,
      file: toPosix(relative(cwd, route.file)),
      key,
      kind: route.kind,
      params: [...route.params],
    };
    if (route.kind === "page") {
      entry.layouts = findLayouts(route, routes).map((layout) =>
        routeKeyFromFile(routesDir, layout.file),
      );
      const prerender = detectPrerenderLiteral(route.file);
      if (prerender !== undefined) {
        entry.prerender = prerender;
      }
    }
    return entry;
  });

  // Addendum D.1: endpoint HTTP mentah `src/api` ikut terdaftar (kind "api").
  const apiDir = resolve(cwd, (config as { apiDir?: string }).apiDir ?? "src/api");
  if (existsSync(apiDir)) {
    for (const route of scanApiRoutes(apiDir)) {
      entries.push({
        path: route.path,
        file: toPosix(relative(cwd, route.file)),
        key: route.file.replace(/\.ts$/, ""),
        kind: "api",
        params: [...route.params],
        methods: detectApiMethods(route.file),
      });
    }
  }

  entries.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  return { routesDir: toPosix(relative(cwd, routesDir)), count: entries.length, routes: entries };
}

/** Deteksi literal `export const prerender = true|false` untuk display (D.5). */
function detectPrerenderLiteral(file: string): boolean | undefined {
  let code = "";
  try {
    code = readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  const match = /export\s+const\s+prerender\s*=\s*(true|false)/.exec(code);
  return match === null ? undefined : match[1] === "true";
}

/** Deteksi method handler statis untuk `routes --json` (validasi penuh di plugin). */
function detectApiMethods(file: string): string[] {
  let code = "";
  try {
    code = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const methods = new Set<string>();
  const pattern = /\bexport\s+(?:const|function)\s+(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\b/g;
  for (const match of code.matchAll(pattern)) {
    if (match[1] !== undefined) {
      methods.add(match[1]);
    }
  }
  return [...methods].sort();
}

/** Render tabel ringkas untuk mode non-JSON. */
export function formatRoutes(json: RoutesJson): string {
  const lines = [`[moons] routes (${json.count}) — ${json.routesDir}`];
  for (const route of json.routes) {
    const layouts = route.layouts === undefined ? "" : `  layouts=[${route.layouts.join(", ")}]`;
    lines.push(`  ${route.kind.padEnd(6)} ${route.path.padEnd(24)} ${route.file}${layouts}`);
  }
  return lines.join("\n");
}

const ROUTE_KINDS: ReadonlyArray<RouteJsonEntry["kind"]> = ["page", "layout", "error", "404", "api"];

/** Filter `--kind=<page|layout|error|404>` (temuan eval T6: pages-only). */
export function filterRoutesByKind(json: RoutesJson, kind: string): RoutesJson {
  if (!(ROUTE_KINDS as readonly string[]).includes(kind)) {
    throw new MoonsError({
      code: "E_INTERNAL",
      message: `unknown \`--kind=${kind}\``,
      details: `Valid values: ${ROUTE_KINDS.join(", ")}.`,
      suggestions: ["Example: `moons routes --json --kind=page`"],
    });
  }
  const routes = json.routes.filter((route) => route.kind === kind);
  return { routesDir: json.routesDir, count: routes.length, routes };
}

function parseKindArg(args: ReadonlyArray<string>): string | undefined {
  const withEquals = args.find((arg) => arg.startsWith("--kind="));
  if (withEquals !== undefined) {
    return withEquals.slice("--kind=".length);
  }
  const index = args.indexOf("--kind");
  if (index !== -1) {
    return args[index + 1];
  }
  return undefined;
}

/** `moons routes [--json] [--kind=<kind>]` (Addendum A.4). */
export async function runRoutes(cwd: string, args: ReadonlyArray<string>): Promise<void> {
  let json = await collectRoutes(cwd);
  const kind = parseKindArg(args);
  if (kind !== undefined && kind.length > 0) {
    json = filterRoutesByKind(json, kind);
  }
  if (args.includes("--json")) {
    console.log(JSON.stringify(json, null, 2));
    return;
  }
  console.log(formatRoutes(json));
}
