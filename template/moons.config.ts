import { defineConfig } from "@moonsjs/core";

export default defineConfig({
  routesDir: "src/routes",
  context: async (req) => ({
    requestId: crypto.randomUUID(),
    url: req.url,
  }),
});
