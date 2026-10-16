export const CLI_COMMANDS = [
  "create",
  "dev",
  "build",
  "start",
  "typegen",
  "routes",
  "fns",
  "check",
  "errors",
] as const;

export type CliCommand = (typeof CLI_COMMANDS)[number];

export interface ParsedCommand {
  command: CliCommand;
  args: string[];
}

/** Parse `process.argv.slice(2)` → command + argumen; null bila tidak dikenal. */
export function parseCommand(argv: ReadonlyArray<string>): ParsedCommand | null {
  const first = argv[0];
  if (first === undefined) {
    return null;
  }
  if ((CLI_COMMANDS as readonly string[]).includes(first)) {
    return { command: first as CliCommand, args: argv.slice(1) };
  }
  return null;
}
