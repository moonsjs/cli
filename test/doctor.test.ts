import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkCanary,
  checkDeps,
  checkTypegen,
  findMoonsCopies,
  readPackageVersion,
  type DoctorCheck,
} from "../src/commands/doctor";

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writePackage(dir: string, version: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "@moonsjs/x", version }));
}

function installWorkspaceDeps(root: string, version = "0.3.0"): void {
  for (const pkg of ["core", "server", "react", "vite"]) {
    writePackage(join(root, "node_modules", "@moonsjs", pkg), version);
  }
  for (const pkg of ["react", "react-dom", "zod"]) {
    writePackage(join(root, "node_modules", pkg), "19.0.0");
  }
}

function checkById(checks: ReadonlyArray<DoctorCheck>, id: string): DoctorCheck {
  const found = checks.find((check) => check.id === id);
  if (found === undefined) {
    throw new Error(`check ${id} not found`);
  }
  return found;
}

test("findMoonsCopies: mendeteksi salinan langsung, bersarang, dan bersarang ber-scope", () => {
  const root = tempDir("doctor-copies-");
  writePackage(join(root, "node_modules", "@moonsjs", "core"), "0.3.0");
  writePackage(join(root, "node_modules", "some-dep", "node_modules", "@moonsjs", "core"), "0.1.8");
  writePackage(
    join(root, "node_modules", "@scope", "pkg", "node_modules", "@moonsjs", "core"),
    "0.1.8",
  );

  const copies = findMoonsCopies(root, "core");
  expect(copies).toHaveLength(3);
  expect(copies[0]).toContain(join("node_modules", "@moonsjs", "core"));
  expect(copies.some((copy) => copy.includes("some-dep"))).toBe(true);
  expect(copies.some((copy) => copy.includes("@scope"))).toBe(true);
  expect(findMoonsCopies(root, "vite")).toEqual([]);
});

test("checkDeps: sehat → pass semua; duplikat → fail; minor campuran → warn; hilang → fail", () => {
  const healthy = tempDir("doctor-deps-ok-");
  installWorkspaceDeps(healthy);
  const okChecks = checkDeps(healthy);
  expect(checkById(okChecks, "deps.installed").level).toBe("pass");
  expect(checkById(okChecks, "deps.duplicates").level).toBe("pass");
  expect(checkById(okChecks, "deps.versions").level).toBe("pass");

  const duplicated = tempDir("doctor-deps-dupe-");
  installWorkspaceDeps(duplicated);
  writePackage(join(duplicated, "node_modules", "other", "node_modules", "@moonsjs", "server"), "0.1.8");
  const dupeChecks = checkDeps(duplicated);
  expect(checkById(dupeChecks, "deps.duplicates").level).toBe("fail");
  expect(checkById(dupeChecks, "deps.duplicates").detail).toContain("@moonsjs/server");

  const mixed = tempDir("doctor-deps-mixed-");
  installWorkspaceDeps(mixed);
  writePackage(join(mixed, "node_modules", "@moonsjs", "react"), "0.2.0");
  expect(checkById(checkDeps(mixed), "deps.versions").level).toBe("warn");

  const missing = tempDir("doctor-deps-missing-");
  expect(checkById(checkDeps(missing), "deps.installed").level).toBe("fail");
  expect(checkById(checkDeps(missing), "deps.peer").level).toBe("warn");
});

test("checkTypegen: hilang → warn; basi → warn; segar → pass", () => {
  const missing = tempDir("doctor-typegen-missing-");
  expect(checkById(checkTypegen(missing, "src/routes"), "typegen.files").level).toBe("warn");

  const stale = tempDir("doctor-typegen-stale-");
  mkdirSync(join(stale, ".moons"), { recursive: true });
  mkdirSync(join(stale, "src", "routes"), { recursive: true });
  writeFileSync(join(stale, ".moons", "routes.d.ts"), "export {};");
  writeFileSync(join(stale, ".moons", "context.d.ts"), "export {};");
  writeFileSync(join(stale, "src", "routes", "index.tsx"), "export default function Page() { return null; }");
  // Paksa mtime .moons lebih tua dari sumber route.
  const old = new Date("2026-01-01T00:00:00Z");
  for (const file of ["routes.d.ts", "context.d.ts"]) {
    utimesSync(join(stale, ".moons", file), old, old);
  }
  expect(checkById(checkTypegen(stale, "src/routes"), "typegen.fresh").level).toBe("warn");

  const fresh = tempDir("doctor-typegen-fresh-");
  mkdirSync(join(fresh, ".moons"), { recursive: true });
  mkdirSync(join(fresh, "src", "routes"), { recursive: true });
  writeFileSync(join(fresh, "src", "routes", "index.tsx"), "export default function Page() { return null; }");
  const now = new Date();
  writeFileSync(join(fresh, ".moons", "routes.d.ts"), "export {};");
  writeFileSync(join(fresh, ".moons", "context.d.ts"), "export {};");
  const future = new Date(now.getTime() + 60_000);
  for (const file of ["routes.d.ts", "context.d.ts"]) {
    utimesSync(join(fresh, ".moons", file), future, future);
  }
  expect(checkById(checkTypegen(fresh, "src/routes"), "typegen.fresh").level).toBe("pass");
});

test("checkCanary: tanpa vite.config → warn; tanpa leakTest → warn; dengan canary → pass", () => {
  const none = tempDir("doctor-canary-none-");
  expect(checkCanary(none)[0]?.level).toBe("warn");

  const noCanary = tempDir("doctor-canary-missing-");
  writeFileSync(join(noCanary, "vite.config.ts"), "export default {};");
  expect(checkById(checkCanary(noCanary), "project.canary").level).toBe("warn");

  const withCanary = tempDir("doctor-canary-ok-");
  writeFileSync(
    join(withCanary, "vite.config.ts"),
    'moons({ leakTest: { canary: "MOONS_X" } })',
  );
  expect(checkById(checkCanary(withCanary), "project.canary").level).toBe("pass");
});

test("readPackageVersion: JSON rusak → null", () => {
  const dir = tempDir("doctor-version-");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), "{ not json");
  expect(readPackageVersion(dir)).toBeNull();
  expect(readPackageVersion(join(dir, "nope"))).toBeNull();
});
