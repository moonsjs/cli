import { resolveViteBin } from "../vite-runner";

/** `moons dev` (PRD §10.3): dev server Vite + plugin moons; port `PORT` env, default 3000. */
export async function runDev(cwd: string): Promise<void> {
  const port = Number(process.env["PORT"] ?? 3000);

  const proc = Bun.spawn(
    [process.execPath, resolveViteBin(cwd), "--port", String(port), "--strictPort"],
    {
      cwd,
      env: process.env,
      stdio: ["inherit", "inherit", "inherit"],
    },
  );

  const forward = (): void => {
    proc.kill();
  };
  process.once("SIGTERM", forward);
  process.once("SIGINT", forward);

  const code = await proc.exited;
  process.exitCode = code;
}
