import { resolveViteBin } from "../vite-runner";
import { openDevLog } from "../dev-log";

/** `moons dev` (PRD §10.3): dev server Vite + plugin moons; port `PORT` env, default 3000. */
export async function runDev(cwd: string): Promise<void> {
  const port = Number(process.env["PORT"] ?? 3000);

  // L.4: log dev dikelola CLI di `.moons/dev.log` (dibaca `tail_dev_logs` MCP).
  const { stream: logStream } = openDevLog(cwd);

  const proc = Bun.spawn(
    [process.execPath, resolveViteBin(cwd), "--port", String(port), "--strictPort"],
    {
      cwd,
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    },
  );

  const tee = (
    stream: ReadableStream<Uint8Array> | null | undefined,
    target: Pick<typeof process.stdout, "write">,
  ): void => {
    if (stream === null || stream === undefined) {
      return;
    }
    void (async () => {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const text = decoder.decode(value, { stream: true });
        target.write(text);
        logStream.write(text);
      }
    })();
  };
  tee(proc.stdout, process.stdout);
  tee(proc.stderr, process.stderr);

  const forward = (): void => {
    proc.kill();
  };
  process.once("SIGTERM", forward);
  process.once("SIGINT", forward);

  const code = await proc.exited;
  logStream.end();
  process.exitCode = code;
}
