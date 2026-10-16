# Recipe: dynamic routes

Source of truth: [`src/routes/notes/[id].tsx`](https://github.com/moonsjs/cookbook/blob/main/src/routes/notes/[id].tsx)

`[id]` folders/files become dynamic segments (`:id`). `[...rest]` is a
catch-all and must be the last segment.

```tsx
export const loader = async ({ params }: LoaderArgs<"/notes/[id]">) => ({
  note: await noteById({ input: { id: params.id } }), // serverFn, in-process on SSR
});

export default function NotePage() {
  const data = useLoaderData<typeof loader>();
  const params = useParams<"/notes/[id]">(); // { id: string }
  if (data.note === null) return <p>Note {params.id} not found</p>;
  return <h1>{data.note.title}</h1>;
}
```

Links to dynamic routes fill params in the URL:

```tsx
<Link to="/notes/[id]" params={{ id: note.id }}>{note.title}</Link>
```

- Param names and types come from the generated `.moons/routes.d.ts` — run
  `moons typegen` (or just `moons dev`/`moons build`) after adding routes.
- A loader that cannot find the resource should return a nullable value and let
  the component decide (as above), or throw if the whole page should hit
  `_error.tsx`.
