import { expect, test } from "bun:test";
import { ensureProductionEnv } from "../src/commands/start";

test("ensureProductionEnv: isi production bila kosong, hormati nilai eksplisit", () => {
  const empty: Record<string, string | undefined> = {};
  ensureProductionEnv(empty);
  expect(empty["NODE_ENV"]).toBe("production");

  const custom: Record<string, string | undefined> = { NODE_ENV: "staging" };
  ensureProductionEnv(custom);
  expect(custom["NODE_ENV"]).toBe("staging");
});
