import { MoonsError } from "@moonsjs/core";
import { spawnVite } from "../vite-runner";

/** `moons build` (PRD §10.4): vite build client + server; leak check canary via plugin. */
export async function runBuild(cwd: string): Promise<void> {
  console.log("[moons] build client...");
  const clientCode = await spawnVite(cwd, ["build"]);
  if (clientCode !== 0) {
    throw buildFailed("client", clientCode);
  }

  console.log("[moons] build server...");
  const serverCode = await spawnVite(cwd, ["build", "--ssr"]);
  if (serverCode !== 0) {
    throw buildFailed("server", serverCode);
  }

  // Addendum D.5: jalankan runner prerender (no-op bila tidak ada route
  // ber-`prerender = true`). Kesalahan kontrak (E_PRERENDER_*) menggagalkan build.
  console.log("[moons] prerender...");
  const prerender = Bun.spawn({
    cmd: ["bun", "dist/server/prerender.js"],
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  const prerenderCode = await prerender.exited;
  if (prerenderCode !== 0) {
    throw new MoonsError({
      code: "E_INTERNAL",
      message: `prerender gagal (exit ${prerenderCode})`,
      details: "Runner `dist/server/prerender.js` mengembalikan exit code non-zero; lihat output di atas.",
      suggestions: [
        "Perbaiki error [moons] E_PRERENDER_* yang tampil",
        "Atau hapus `prerender`/`paths` dari route terkait",
      ],
    });
  }

  console.log("[moons] build selesai: dist/client + dist/server/index.js");
}

function buildFailed(target: string, code: number): MoonsError {
  return new MoonsError({
    code: "E_INTERNAL",
    message: `build ${target} gagal (exit ${code})`,
    details: "`vite build` mengembalikan exit code non-zero; lihat output di atas.",
    suggestions: ["Perbaiki error build yang tampil", "Jalankan `moons build` ulang"],
  });
}
