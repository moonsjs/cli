# Recipe: query string (search params)

Source of truth: [`src/routes/search.tsx`](https://github.com/moonsjs/cookbook/blob/main/src/routes/search.tsx)

The query string is read from `req.url` in the loader (server-side) and from
`useSearchParams()` in the component (the same values, embedded into the SSR
payload). `Link search` builds the href.

```tsx
// Loader: SSR truth (also used for client-side navigations)
export const loader = async ({ req }: LoaderArgs<"/search">) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return { q, results: filterItems(q) };
};

// Component
const searchParams = useSearchParams();
const activeQuery = searchParams["q"] ?? "";

<Link to="/search" search={{ q: "alpha" }}>alpha</Link>
<Link to="/search" search={{ q: undefined }}>all</Link> {/* undefined dropped */}
```

Rules:

- `useSearchParams()` returns `Record<string, string>` — identical on server and
  client for the same URL.
- `search` accepts `string | number | boolean | undefined`; `undefined` keys are
  omitted from the href.
- Do not fetch data client-side from query params; put the filter logic in the
  loader (works for both SSR and client-side navigation).

Notes: [`src/shared/search.ts`](https://github.com/moonsjs/cookbook/blob/main/src/shared/search.ts)
holds the pure filter helper (pure helpers must live outside `src/routes/` —
route files can only export `default | loader | meta`).
