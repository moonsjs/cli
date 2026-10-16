# Recipe: mutation + `refresh()`

Source of truth: [`examples/cookbook/src/routes/mutate.tsx`](https://github.com/moonsjs/cookbook/blob/main/src/routes/mutate.tsx)

Pattern: call a serverFn, then revalidate the page with `refresh()`. There is no
cache and no optimistic API in v1 — the server is always the source of truth.

```tsx
import { refresh, useLoaderData } from "@moonsjs/react";
import { addNote, listNotes } from "../server/notes.server";

export const loader = async () => ({ notes: await listNotes({ input: {} }) });

export default function MutatePage() {
  const data = useLoaderData<typeof loader>();

  async function submit(): Promise<void> {
    await addNote({ input: { title } });
    refresh(); // re-runs this URL through the document-fetch pipeline
  }
}
```

Rules:

- `refresh()` re-fetches the current URL, swaps the DOM and re-hydrates — no
  full browser reload.
- Call it after the mutation resolves; show an error when the serverFn throws.
- If you need instant local feedback (e.g. a counter), use `useState` *and*
  still `refresh()` for server state. Keep one source of truth.
