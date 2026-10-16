# Recipe: two-sided validation

Source of truth: [`src/routes/guard.tsx`](https://github.com/moonsjs/cookbook/blob/main/src/routes/guard.tsx)
and [`src/shared/schemas.ts`](https://github.com/moonsjs/cookbook/blob/main/src/shared/schemas.ts)

One schema, used by both sides: the client validates for instant feedback; the
serverFn re-validates because the client can never be trusted.

```ts
// src/shared/schemas.ts — imported by BOTH the component and the serverFn
export const addNoteInput = z.object({ title: z.string().min(1).max(80) });
```

```ts
// src/server/notes.server.ts
export const addNote = serverFn({
  input: addNoteInput,  // server-side truth
  output: noteSchema,
  handler: async ({ input }) => { /* ... */ },
});
```

```tsx
// component: fast feedback before hitting the network
const parsed = addNoteInput.safeParse({ title });
if (!parsed.success) { setError("title must be 1–80 chars"); return; }
try {
  await addNote({ input: parsed.data });
} catch (error) {
  // [moons] E_RPC_INVALID_INPUT + details + suggestions
  setError(error instanceof Error ? error.message : String(error));
}
```

Client-side checks are UX, not security. The server always validates `input`
before the handler and `output` after it; schema drift shows up as
`E_RPC_INVALID_INPUT` / `E_RPC_INVALID_OUTPUT`.
