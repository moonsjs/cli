# Recipe: Tailwind CSS v4

Source of truth: [`vite.config.ts`](https://github.com/moonsjs/cookbook/blob/main/vite.config.ts),
[`src/styles.css`](https://github.com/moonsjs/cookbook/blob/main/src/styles.css), and
[`src/client/main.tsx`](https://github.com/moonsjs/cookbook/blob/main/src/client/main.tsx).

Steps (cookbook is the tested reference):

1. `bun add -d tailwindcss @tailwindcss/vite`
2. Add the plugin **before** the Moons plugin in `vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import moons from "@moonsjs/vite";

export default defineConfig({
  plugins: [tailwindcss(), moons({ leakTest: { canary: "…" } })],
});
```

3. Create `src/styles.css`:

```css
@import "tailwindcss";
```

4. Import it once from the client entry (`src/client/main.tsx`):

```ts
import "../styles.css";
import { hydrate } from "@moonsjs/react/client";

await hydrate();
```

Notes:

- Tailwind scans your source automatically (v4); no `content` config needed for
  the default setup. Keep utility classes in route/component files.
- The CSS is processed by the Vite client build; SSR markup stays class-based —
  hydration parity is unaffected (covered by the cookbook hydration test).
- Zero-trust is untouched: Tailwind runs in the client pipeline only; never put
  server imports in `styles.css`-adjacent modules.
