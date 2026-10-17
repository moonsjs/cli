import { expect, test } from "bun:test";
import { MoonsError } from "@moonsjs/core";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffoldProject } from "../src/commands/create";
import { PUBLISHED_FRAMEWORK_VERSION } from "../src/util";
import { detectWorkspaceRoot, matchesWorkspacePattern, templateDir } from "../src/util";

test("matchesWorkspacePattern mendukung dir/*", () => {
  expect(matchesWorkspacePattern("examples/demo", "examples/*")).toBe(true);
  expect(matchesWorkspacePattern("packages/core", "packages/*")).toBe(true);
  expect(matchesWorkspacePattern("demo", "examples/*")).toBe(false);
  expect(matchesWorkspacePattern("packages/core/sub", "packages/*")).toBe(false);
});

test("detectWorkspaceRoot: workspace sintetis terdeteksi; di luar tidak", () => {
  const root = mkdtempSync(join(tmpdir(), "moons-workspace-"));
  writeFileSync(join(root, "package.json"), `${JSON.stringify({ private: true, workspaces: ["apps/*"] })}\n`);
  mkdirSync(join(root, "apps", "demo"), { recursive: true });

  expect(detectWorkspaceRoot(join(root, "apps", "demo"))).toBe(root);

  const outside = mkdtempSync(join(tmpdir(), "moons-outside-"));
  expect(detectWorkspaceRoot(join(outside, "app"))).toBeNull();
});

test("scaffoldProject: copy + exclude artefak + rewrite name + .gitignore", () => {
  const template = mkdtempSync(join(tmpdir(), "moons-template-"));
  mkdirSync(join(template, "src", "routes"), { recursive: true });
  writeFileSync(join(template, "src", "routes", "index.tsx"), "export default 1;\n");
  writeFileSync(
    join(template, "package.json"),
    `${JSON.stringify({ name: "old-name", private: true })}\n`,
  );
  mkdirSync(join(template, "node_modules"), { recursive: true });
  writeFileSync(join(template, "node_modules", "junk.txt"), "x");
  mkdirSync(join(template, "dist"), { recursive: true });
  writeFileSync(join(template, "dist", "out.js"), "x");
  mkdirSync(join(template, ".moons"), { recursive: true });
  writeFileSync(join(template, ".moons", "routes.d.ts"), "x");

  const target = join(mkdtempSync(join(tmpdir(), "moons-target-")), "Demo App");
  const result = scaffoldProject({ targetDir: target, templateDir: template, name: "Demo App" });

  expect(result.packageName).toBe("demo-app");
  expect(readFileSync(join(target, "package.json"), "utf8")).toContain('"name": "demo-app"');
  expect(existsSync(join(target, "src", "routes", "index.tsx"))).toBe(true);
  expect(existsSync(join(target, "node_modules"))).toBe(false);
  expect(existsSync(join(target, "dist"))).toBe(false);
  expect(existsSync(join(target, ".moons"))).toBe(false);
  expect(readFileSync(join(target, ".gitignore"), "utf8")).toContain(".moons");
});

test("scaffoldProject: template nyata (examples/basic) berfungsi", () => {
  const target = join(mkdtempSync(join(tmpdir(), "moons-real-")), "demo");
  const result = scaffoldProject({ targetDir: target, templateDir, name: "demo" });

  expect(result.packageName).toBe("demo");
  expect(existsSync(join(target, "src", "routes", "index.tsx"))).toBe(true);
  expect(existsSync(join(target, "index.html"))).toBe(true);
  expect(existsSync(join(target, "dist"))).toBe(false);
  // Fixture-only: assertion tipe route examples/basic tidak ikut ke app user.
  expect(existsSync(join(target, "src", "type-checks.ts"))).toBe(false);

  // Addendum A.5: konteks agen ikut scaffold, dengan peta route aktual.
  const agents = readFileSync(join(target, "AGENTS.md"), "utf8");
  expect(agents).toContain("moons check");
  expect(agents).toContain("/users/:id");
  expect(agents).toContain("src/routes/users/[id].tsx");
  const llms = readFileSync(join(target, "llms.txt"), "utf8");
  expect(llms).toContain("docs/ai/CONTEXT.md");
});

test("templateDir: menunjuk direktori template yang lengkap", () => {
  expect(existsSync(join(templateDir, "package.json"))).toBe(true);
  expect(existsSync(join(templateDir, "index.html"))).toBe(true);
  expect(existsSync(join(templateDir, "src", "routes", "index.tsx"))).toBe(true);
});

test("scaffoldProject: direktori tujuan non-kosong → MoonsError", () => {
  const target = mkdtempSync(join(tmpdir(), "moons-nonempty-"));
  writeFileSync(join(target, "x.txt"), "x");

  let thrown: unknown;
  try {
    scaffoldProject({ targetDir: target, templateDir, name: "x" });
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(MoonsError);
  expect((thrown as MoonsError).format()).toContain("not empty");
  expect((thrown as MoonsError).format()).toContain("Suggestion:");
});

test("scaffoldProject: template di dalam path ber-`node_modules` (layout bunx) tetap ter-copy", () => {
  // Regresi decisions/0014: filter tidak boleh memakai path absolut — path bunx
  // selalu memuat segmen `node_modules` (…/node_modules/@moonsjs/cli/template/…).
  const template = join(
    mkdtempSync(join(tmpdir(), "moons-bunx-")),
    "node_modules",
    "@moonsjs",
    "cli",
    "template",
  );
  mkdirSync(join(template, "src", "routes"), { recursive: true });
  writeFileSync(join(template, "package.json"), `${JSON.stringify({ name: "old" })}\n`);
  writeFileSync(join(template, "index.html"), "<div id=\"root\"></div>\n");
  writeFileSync(join(template, "src", "routes", "index.tsx"), "export default 1;\n");
  writeFileSync(join(template, "src", "type-checks.ts"), "// fixture\n");
  mkdirSync(join(template, "node_modules"), { recursive: true });
  writeFileSync(join(template, "node_modules", "junk.txt"), "x");

  const target = join(mkdtempSync(join(tmpdir(), "moons-target-bunx-")), "app");
  scaffoldProject({ targetDir: target, templateDir: template, name: "app" });

  expect(existsSync(join(target, "package.json"))).toBe(true);
  expect(existsSync(join(target, "index.html"))).toBe(true);
  expect(existsSync(join(target, "src", "routes", "index.tsx"))).toBe(true);
  expect(existsSync(join(target, "src", "type-checks.ts"))).toBe(false);
  expect(existsSync(join(target, "node_modules"))).toBe(false);
});

test("scaffoldProject: dependencyMode 'published' menulis ulang workspace:* ke versi publish + script satu pintu", () => {
  const template = mkdtempSync(join(tmpdir(), "moons-template-pub-"));
  writeFileSync(
    join(template, "package.json"),
    `${JSON.stringify({
      name: "old",
      scripts: { dev: "vite", build: "vite build", tsc: "tsc" },
      dependencies: { "@moonsjs/core": "workspace:*", react: "^19.3.0" },
      devDependencies: { "@moonsjs/vite": "workspace:*" },
    })}\n`,
  );

  const target = join(mkdtempSync(join(tmpdir(), "moons-target-pub-")), "app");
  scaffoldProject({
    targetDir: target,
    templateDir: template,
    name: "app",
    dependencyMode: "published",
  });

  const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  expect(pkg.dependencies["@moonsjs/core"]).toBe(`^${PUBLISHED_FRAMEWORK_VERSION}`);
  expect(pkg.dependencies["react"]).toBe("^19.3.0");
  expect(pkg.devDependencies["@moonsjs/vite"]).toBe(`^${PUBLISHED_FRAMEWORK_VERSION}`);
  // Satu pintu (decisions/0017): app standalone memakai CLI lokal.
  expect(pkg.scripts["dev"]).toBe("moons dev");
  expect(pkg.scripts["build"]).toBe("moons build");
  expect(pkg.scripts["start"]).toBe("moons start");
  expect(pkg.scripts["check"]).toBe("moons check");
  expect(pkg.scripts["test"]).toBe("moons test");
});

test("scaffoldProject: mode default (workspace) mempertahankan workspace:*", () => {
  const template = mkdtempSync(join(tmpdir(), "moons-template-ws-"));
  writeFileSync(
    join(template, "package.json"),
    `${JSON.stringify({ name: "old", dependencies: { "@moonsjs/core": "workspace:*" } })}\n`,
  );

  const target = join(mkdtempSync(join(tmpdir(), "moons-target-ws-")), "app");
  scaffoldProject({ targetDir: target, templateDir: template, name: "app" });

  const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
  };
  expect(pkg.dependencies["@moonsjs/core"]).toBe("workspace:*");
});
