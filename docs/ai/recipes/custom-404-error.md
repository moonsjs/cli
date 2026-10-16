# Recipe: custom 404 and error pages

Source of truth: [`_404.tsx`](https://github.com/moonsjs/cookbook/blob/main/src/routes/_404.tsx) and
[`_error.tsx`](https://github.com/moonsjs/cookbook/blob/main/src/routes/_error.tsx)

Both files are **root-only** (`src/routes/_404.tsx`, `src/routes/_error.tsx`)
and render standalone — no layout wraps them. They may only export `default`.

```tsx
// src/routes/_404.tsx — copy-paste shape
import { Link } from "@moonsjs/react";

export default function NotFound() {
  return (<div>
    <h1>404 — page not found</h1>
    <Link to="/">Back home</Link>
  </div>);
}
```

```tsx
// src/routes/_error.tsx
import { Link, useRouteError } from "@moonsjs/react";

export default function RouteError() {
  const error = useRouteError();
  const label = error instanceof Error
    ? error.message
    : "Internal error (production never ships details).";
  return (<>
    <h1>Something went wrong</h1>
    <pre>{label}</pre>
    <Link to="/">Try again</Link>
  </>);
}
```

- `useRouteError()` returns the real error in development; in production the
  payload contains no error details (by design).
- Unknown path → `_404.tsx` with status 404. A loader that throws → `_error.tsx`
  with status 500.
- Client-side navigation to a 404/500 document intentionally falls back to a
  **full document load** (the router only does SPA swaps for `ok` responses).
- Keep `_error` small and dependency-light: it must render even when app data is
  broken.
