import { expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runTypegen } from "../src/commands/typegen";

test("moons typegen menulis .moons/routes.d.ts + context.d.ts", async () => {
  // In-place di fixture (bukan /tmp) supaya `@moonsjs/core` tetap teresolusi
  // dari node_modules paket cli — di monorepo maupun di repo paket standalone.
  const cwd = join(import.meta.dir, "fixtures", "app");
  try {
    await runTypegen(cwd);

    const routesDts = readFileSync(join(cwd, ".moons", "routes.d.ts"), "utf8");
    expect(routesDts).toContain('"/users/[id]"');
    expect(routesDts).toContain("export type RoutePath = keyof RouteMap;");

    const contextDts = readFileSync(join(cwd, ".moons", "context.d.ts"), "utf8");
    expect(contextDts).toContain('import type config from "../moons.config";');
  } finally {
    rmSync(join(cwd, ".moons"), { recursive: true, force: true });
  }
});
