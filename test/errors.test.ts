import { expect, test } from "bun:test";
import { MOONS_ERROR_CODES } from "@moonsjs/core";
import { parseCommand } from "../src/args";
import { catalogJson } from "../src/commands/errors";

test("moons errors --json: katalog lengkap + versi framework", () => {
  const json = catalogJson();
  expect(json.count).toBe(MOONS_ERROR_CODES.length);
  expect(json.errors).toHaveLength(MOONS_ERROR_CODES.length);
  expect(json.moonsVersion.length).toBeGreaterThan(0);

  const codes = json.errors.map((entry) => entry.code).sort();
  expect(codes).toEqual([...MOONS_ERROR_CODES].sort());

  const schemaRef = json.errors.find((entry) => entry.code === "E_SCHEMA_LOCAL_REF");
  expect(schemaRef?.trigger).toContain("deklarasi lokal");
  expect(schemaRef?.suggestions.length ?? 0).toBeGreaterThan(0);
});

test("parseCommand mengenal `errors`", () => {
  expect(parseCommand(["errors", "--json"])).toEqual({ command: "errors", args: ["--json"] });
});
