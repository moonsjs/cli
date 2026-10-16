#!/usr/bin/env bun
import { MoonsError } from "@moonsjs/core";
import { parseCommand } from "./args";
import { runAudit } from "./commands/audit";
import { runBuild } from "./commands/build";
import { runCheck } from "./commands/check";
import { runCreate } from "./commands/create";
import { runDev } from "./commands/dev";
import { runErrors } from "./commands/errors";
import { runFns } from "./commands/fns";
import { runRoutes } from "./commands/routes";
import { runStart } from "./commands/start";
import { runTypegen } from "./commands/typegen";

const USAGE = [
  "moons <command>",
  "",
  "  moons create <name>   scaffold a new project",
  "  moons dev             dev server (HMR)",
  "  moons build           production build (dist/client + dist/server)",
  "  moons start           serve dist/",
  "  moons typegen         regenerate .moons/*.d.ts",
  "  moons routes [--json] route table from scan (no build)",
  "  moons fns [--json]    serverFn registry from .server.ts scan",
  "  moons check [--json]  typegen -> tsc --noEmit -> build client+server",
  "  moons errors [--json] machine-readable error catalog",
  "  moons audit [--json]  security audit (RPC, env, cookie, CSP, dist/client)",
];

/** Entry CLI (dipisah dari `process` agar bisa ditest). */
export async function runCli(argv: ReadonlyArray<string>, cwd = process.cwd()): Promise<number> {
  const first = argv[0];

  if (first === "help" || first === "--help" || first === "-h") {
    console.log(USAGE.join("\n"));
    return 0;
  }
  if (first === undefined) {
    console.log(USAGE.join("\n"));
    return 1;
  }

  const parsed = parseCommand(argv);
  if (parsed === null) {
    console.error(`[moons] unknown command \`${first}\``);
    console.error(USAGE.join("\n"));
    return 1;
  }

  try {
    switch (parsed.command) {
      case "create":
        await runCreate(cwd, parsed.args[0]);
        break;
      case "dev":
        await runDev(cwd);
        break;
      case "build":
        await runBuild(cwd);
        break;
      case "start":
        await runStart(cwd);
        break;
      case "typegen":
        await runTypegen(cwd);
        break;
      case "routes":
        await runRoutes(cwd, parsed.args);
        break;
      case "fns":
        runFns(cwd, parsed.args);
        break;
      case "errors":
        runErrors(parsed.args);
        break;
      case "check":
        return await runCheck(cwd, parsed.args);
      case "audit":
        return await runAudit(cwd, parsed.args);
    }
    return 0;
  } catch (error) {
    if (error instanceof MoonsError) {
      console.error(error.format());
      return 1;
    }
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    return 1;
  }
}

if (import.meta.main) {
  const code = await runCli(process.argv.slice(2));
  process.exitCode = code;
}
