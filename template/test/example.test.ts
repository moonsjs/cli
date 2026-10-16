import { expect, test } from "bun:test";
import { scanRoutes, type MoonsConfig, type RouteModule } from "@moonsjs/core";
import { createTestServer } from "@moonsjs/vite/server";
import { join } from "node:path";

/**
 * Contoh test in-process (PRD §19.5): dispatch request tanpa port/browser.
 * Jalankan: `bun test`.
 */
const routesDir = join(import.meta.dir, "..", "src", "routes");
const routes = scanRoutes(routesDir);
const config: MoonsConfig = {
  routesDir: "src/routes",
  context: async () => ({ requestId: "test", url: "" }),
};

const server = createTestServer({
  routes,
  config,
  routesDir,
  loadRoute: {
    _layout: async () =>
      (await import("../src/routes/_layout")) as unknown as RouteModule,
    index: async () => (await import("../src/routes/index")) as unknown as RouteModule,
  },
});

test("/ merender SSR dengan data loader", async () => {
  const response = await server.fetch("/");
  expect(response.status).toBe(200);
  const body = await response.text();
  expect(body).toContain("Halo dari SSR");
  expect(body).toContain("2024-01-01");
});

test("/about tersedia", async () => {
  const about = createTestServer({
    routes,
    config,
    routesDir,
    loadRoute: {
      _layout: async () =>
        (await import("../src/routes/_layout")) as unknown as RouteModule,
      about: async () => (await import("../src/routes/about")) as unknown as RouteModule,
    },
  });
  const response = await about.fetch("/about");
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("about-title");
});
