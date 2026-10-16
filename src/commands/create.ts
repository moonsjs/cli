import { MoonsError } from "@moonsjs/core";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { renderAgentsMd, renderScaffoldLlmsTxt } from "../scaffold-ai";
import { PUBLISHED_FRAMEWORK_VERSION, detectWorkspaceRoot, templateDir } from "../util";

const EXCLUDED_SEGMENTS = new Set(["node_modules", "dist", ".moons", ".git"]);

export interface ScaffoldOptions {
  targetDir: string;
  templateDir: string;
  /** Nama project (dipakai untuk `name` di package.json). */
  name: string;
  /**
   * "workspace": dependensi `workspace:*` dipertahankan (target anggota workspace).
   * "published": dependensi `workspace:*` ditulis ulang ke `^<versi publish>`
   * agar `bun install` berjalan dari registry (target standalone).
   */
  dependencyMode?: "workspace" | "published";
}

export interface ScaffoldResult {
  packageName: string;
}

/** Copy template → target (exclude artefak), rewrite `name`, tulis `.gitignore`. */
export function scaffoldProject(options: ScaffoldOptions): ScaffoldResult {
  const target = resolve(options.targetDir);

  if (existsSync(target) && readdirSync(target).length > 0) {
    throw new MoonsError({
      code: "E_INTERNAL",
      file: target,
      message: "target directory already exists and is not empty",
      details: "`moons create` can only write to a new or empty directory.",
      suggestions: ["Pick another name", "Remove or move the contents of the target directory"],
    });
  }

  mkdirSync(target, { recursive: true });
  cpSync(options.templateDir, target, {
    recursive: true,
    // PENTING: exclusion dihitung relatif ke templateDir — path absolut bisa
    // mengandung `node_modules` (layout bunx: …/node_modules/@moonsjs/cli/…)
    // sehingga filter berbasis path absolut mengeksklusi SEMUA file (decisions/0014).
    filter: (source) => !isExcluded(relative(options.templateDir, source)),
  });

  const packageName = sanitizePackageName(options.name);
  const packageJsonPath = join(target, "package.json");
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Record<string, unknown>;
  pkg["name"] = packageName;

  if (options.dependencyMode === "published") {
    for (const field of ["dependencies", "devDependencies", "peerDependencies"] as const) {
      const deps = pkg[field] as Record<string, string> | undefined;
      if (deps === undefined) {
        continue;
      }
      for (const [dependency, range] of Object.entries(deps)) {
        if (range === "workspace:*") {
          deps[dependency] = `^${PUBLISHED_FRAMEWORK_VERSION}`;
        }
      }
    }

    // Satu pintu untuk app standalone (decisions/0017): script memakai CLI
    // lokal (`@moonsjs/cli` devDep) — dev port 3000, start production.
    pkg["scripts"] = {
      dev: "moons dev",
      build: "moons build",
      start: "moons start",
      check: "moons check",
      tsc: "tsc",
    };
  }

  writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

  const gitignorePath = join(target, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, "node_modules/\ndist/\n.moons/\n*.tsbuildinfo\n");
  }

  // Addendum A.5: setiap app membawa konteks untuk agen (route map aktual).
  writeFileSync(join(target, "AGENTS.md"), renderAgentsMd({ targetDir: target, packageName }));
  writeFileSync(join(target, "llms.txt"), renderScaffoldLlmsTxt({ packageName }));

  return { packageName };
}

/** `relativePath` relatif terhadap templateDir (bukan path absolut). */
function isExcluded(relativePath: string): boolean {
  if (relativePath.split(sep).some((segment) => EXCLUDED_SEGMENTS.has(segment))) {
    return true;
  }
  // Fixture-only M1 di examples/basic (assertion tipe untuk route fixture);
  // tidak boleh ikut ke app user — route bisa berbeda dan file ini akan gagal tsc.
  return relativePath === join("src", "type-checks.ts");
}

function sanitizePackageName(name: string): string {
  const base = basename(resolve(name)).trim().toLowerCase();
  const cleaned = base.replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "moons-app";
}

/** `moons create <name>` (PRD §10.2). */
export async function runCreate(cwd: string, name: string | undefined): Promise<void> {
  if (name === undefined || name.trim().length === 0) {
    throw new MoonsError({
      code: "E_INTERNAL",
      message: "`moons create` requires a project name",
      details: "Usage: `moons create <name>`.",
      suggestions: ["Example: `moons create demo`"],
    });
  }

  const targetDir = resolve(cwd, name);
  const workspaceRoot = detectWorkspaceRoot(targetDir);
  const result = scaffoldProject({
    targetDir,
    templateDir,
    name,
    dependencyMode: workspaceRoot === null ? "published" : "workspace",
  });
  console.log(`[moons] project \`${result.packageName}\` created in ${targetDir}`);

  if (workspaceRoot === null) {
    console.log("[moons] running `bun install` ...");
    const proc = Bun.spawn(["bun", "install"], {
      cwd: targetDir,
      env: process.env,
      stdio: ["inherit", "inherit", "inherit"],
    });
    const code = await proc.exited;
    if (code !== 0) {
      throw new MoonsError({
        code: "E_INTERNAL",
        message: "`bun install` failed in the new project",
        details: `Exit code ${code}.`,
        suggestions: [
          "Run `bun install` manually in the project directory",
          "Check the connection to the npm registry",
        ],
      });
    }
  } else {
    console.log(
      `[moons] workspace detected (${workspaceRoot}) — skipping \`bun install\`; dependencies are provided by the workspace.`,
    );
  }

  console.log("");
  console.log("Done! Next steps:");
  console.log(`  cd ${name}`);
  console.log("  moons dev        # dev server (port 3000)");
  console.log("  moons check      # verify: typegen -> tsc -> build");
  console.log("  moons build      # production build (dist/client + dist/server)");
  console.log("  moons start      # serve the build output");
  console.log("");
  console.log("AGENTS.md + llms.txt written to the project (context for AI agents).");
}
