import { createRequire } from "node:module";
import { MoonsError } from "@moonsjs/core";

/**
 * `moons test` — run `bun test` with the Moons server transform preloaded, so
 * route modules that import `serverFn` can be loaded in tests.
 */
export async function runTest(cwd: string, args: readonly string[]): Promise<number> {
  const require = createRequire(import.meta.url);
  let preload: string;
  try {
    preload = require.resolve("@moonsjs/vite/testing/preload");
  } catch {
    throw new MoonsError({
      code: "E_INTERNAL",
      message: "`@moonsjs/vite` test preload could not be resolved",
      details: "`moons test` needs the test preload shipped with @moonsjs/vite.",
      suggestions: [
        "Install @moonsjs/vite (it is a dev dependency of the app)",
        "Re-run `bun install`",
      ],
    });
  }
  const proc = Bun.spawn([process.execPath, "test", "--preload", preload, ...args], {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  return await proc.exited;
}
