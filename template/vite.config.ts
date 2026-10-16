import { defineConfig } from "vite";
import moons from "@moonsjs/vite";

export default defineConfig({
  // Canary default (lapis kedua zero-trust §9.1): build client gagal bila string
  // ini muncul di output. Ganti dengan nilai unik app Anda bila mau.
  plugins: [moons({ leakTest: { canary: "MOONS_APP_CANARY_4f1c" } })],
});
