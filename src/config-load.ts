import { MoonsError, validateConfig, type MoonsConfig } from "@moonsjs/core";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfigFromFile } from "vite";

export interface ProjectConfig {
  config: MoonsConfig;
  configPath: string;
}

/** Muat + validasi `moons.config.ts` (dipakai typegen/routes/fns/check). */
export async function loadProjectConfig(cwd: string): Promise<ProjectConfig> {
  const configPath = join(cwd, "moons.config.ts");
  if (!existsSync(configPath)) {
    throw new MoonsError({
      code: "E_CONFIG_INVALID",
      file: configPath,
      message: "`moons.config.ts` not found",
      details: "This command requires a config file at the project root.",
      suggestions: ["Create `moons.config.ts` with `export default defineConfig({ ... })`"],
    });
  }

  const loaded = await loadConfigFromFile(
    { command: "build", mode: "production" },
    configPath,
    cwd,
    // Sunyi: `moons routes|fns|check --json` tidak boleh menambah noise stderr
    // dari peringatan configLoader Vite (temuan eval T6).
    "silent",
  );
  const config = validateConfig(loaded?.config, { file: configPath, projectRoot: cwd });
  return { config, configPath };
}
