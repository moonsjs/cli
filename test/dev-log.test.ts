import { expect, test } from "bun:test";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_DEV_LOG_BYTES, openDevLog } from "../src/dev-log";

test("L.4: openDevLog membuat .moons/dev.log dan menulis append", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "moons-devlog-"));
  const { path, stream } = openDevLog(cwd);
  expect(path).toBe(join(cwd, ".moons", "dev.log"));
  stream.write("baris-1\n");
  await new Promise<void>((resolve) => stream.end(resolve));
  expect(statSync(path).size).toBeGreaterThan(0);

  const again = openDevLog(cwd);
  expect(statSync(again.path).size).toBeGreaterThan(0); // append, bukan truncate
  await new Promise<void>((resolve) => again.stream.end(resolve));
});

test("L.4: openDevLog memotong file yang melewati batas ukuran", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "moons-devlog-big-"));
  const { path } = openDevLog(cwd);
  writeFileSync(path, "x".repeat(MAX_DEV_LOG_BYTES + 1));
  const { stream } = openDevLog(cwd);
  expect(statSync(path).size).toBe(0);
  await new Promise<void>((resolve) => stream.end(resolve));
});
