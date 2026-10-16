import { generateTypes } from "@moonsjs/core";
import { resolve } from "node:path";
import { loadProjectConfig } from "../config-load";

/** `moons typegen` (PRD §10.1/§13): regenerate `.moons/*.d.ts`. */
export async function runTypegen(cwd: string): Promise<void> {
  const { config, configPath } = await loadProjectConfig(cwd);

  await generateTypes({
    routesDir: resolve(cwd, config.routesDir),
    configPath,
    outDir: resolve(cwd, ".moons"),
  });

  console.log("[moons] typegen selesai: .moons/routes.d.ts + .moons/context.d.ts");
}
