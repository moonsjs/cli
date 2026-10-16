import { expect, test } from "bun:test";
import { parseCommand } from "../src/args";

test("parseCommand: command dikenal + argumen", () => {
  expect(parseCommand(["create", "demo"])).toEqual({ command: "create", args: ["demo"] });
  expect(parseCommand(["build"])).toEqual({ command: "build", args: [] });
  expect(parseCommand(["typegen"])).toEqual({ command: "typegen", args: [] });
});

test("parseCommand: tidak dikenal / kosong → null", () => {
  expect(parseCommand(["nope"])).toBeNull();
  expect(parseCommand([])).toBeNull();
});
