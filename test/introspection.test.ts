import { expect, test } from "bun:test";
import { MoonsError, computeFnHash } from "@moonsjs/core";
import { join } from "node:path";
import { parseCommand } from "../src/args";
import { resolveTsBin } from "../src/commands/check";
import { collectFns, formatFns } from "../src/commands/fns";
import { collectRoutes, filterRoutesByKind, formatRoutes } from "../src/commands/routes";

test("filterRoutesByKind: menyaring pages-only dan menolak kind tidak dikenal", async () => {
  const cwd = join(import.meta.dir, "fixtures", "app");
  const json = await collectRoutes(cwd);

  const pages = filterRoutesByKind(json, "page");
  expect(pages.count).toBe(pages.routes.length);
  expect(pages.routes.every((route) => route.kind === "page")).toBe(true);
  expect(pages.count).toBeLessThan(json.count);

  expect(() => filterRoutesByKind(json, "nope")).toThrow(MoonsError);
});

test("parseCommand mengenal routes/fns/check (Addendum A.4)", () => {
  expect(parseCommand(["routes", "--json"])).toEqual({ command: "routes", args: ["--json"] });
  expect(parseCommand(["fns"])).toEqual({ command: "fns", args: [] });
  expect(parseCommand(["check", "--json"])).toEqual({ command: "check", args: ["--json"] });
});

test("collectRoutes: peta route + layout chain dari fixture lokal", async () => {
  const cwd = join(import.meta.dir, "fixtures", "app");
  const json = await collectRoutes(cwd);

  const home = json.routes.find((route) => route.path === "/" && route.kind === "page");
  expect(home).toBeDefined();
  expect(home?.key).toBe("index");
  expect(home?.layouts).toEqual(["_layout"]);

  const user = json.routes.find((route) => route.key === "users/[id]");
  expect(user?.path).toBe("/users/:id");
  expect(user?.params).toEqual(["id"]);

  expect(json.routesDir).toBe("src/routes");
  expect(formatRoutes(json)).toContain("routes");
});

test("collectFns: hash cocok dengan computeFnHash + registry §21.3 + serverFiles", () => {
  const cwd = join(import.meta.dir, "fixtures", "app");
  const json = collectFns(cwd);

  const getUser = json.fns.find((fn) => fn.export === "getUser");
  expect(getUser).toBeDefined();
  expect(getUser?.file).toBe("src/server/users.server.ts");
  expect(getUser?.hash).toBe(computeFnHash(cwd, join(cwd, "src/server/users.server.ts"), "getUser"));
  expect(getUser?.hash).toMatch(/^[0-9a-f]{16}$/);
  expect(json.registry[getUser?.key ?? ""]).toBe(getUser?.hash);
  expect(formatFns(json)).toContain("getUser");

  // F4 temuan eval: file server-only tanpa serverFn ikut terdaftar.
  expect(json.serverFiles).toContain("src/server/users.server.ts");
  expect(json.serverFiles).toContain("src/server/secrets.server.ts");
  expect(formatFns(json)).toContain("server-only: src/server/secrets.server.ts");
});

test("resolveTsBin: menemukan typescript dari project contoh, null di root fs", () => {
  const tsBin = resolveTsBin(join(import.meta.dir, "fixtures", "app"));
  expect(tsBin).not.toBeNull();
  expect(tsBin ?? "").toContain("typescript");
});
