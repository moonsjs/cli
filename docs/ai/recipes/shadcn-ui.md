# Recipe: shadcn/ui components (Radix included)

Source of truth: [`src/components/ui/`](https://github.com/moonsjs/cookbook/blob/main/src/components/ui/),
[`src/shared/cn.ts`](https://github.com/moonsjs/cookbook/blob/main/src/shared/cn.ts), and usage in
[`src/routes/dashboard.tsx`](https://github.com/moonsjs/cookbook/blob/main/src/routes/dashboard.tsx).

The cookbook now ships the real pattern — copy-in components, Tailwind, `cva`,
`cn`, and **Radix primitives** for behavior:

| File | Contents |
| --- | --- |
| `button.tsx` | `cva` variants (`default`/`outline`/`destructive`) |
| `input.tsx`, `card.tsx` | styling wrappers |
| `dialog.tsx` | Radix `@radix-ui/react-dialog` (Trigger/Content/Title/Description/Footer/Close) |
| `dropdown-menu.tsx` | Radix `@radix-ui/react-dropdown-menu` (Trigger/Content/Item, `asChild` + `Link`) |

Setup for a new app:

1. `bun add -d tailwindcss @tailwindcss/vite` and wire Tailwind
   ([Tailwind recipe](tailwind.md)).
2. `bun add clsx tailwind-merge class-variance-authority @radix-ui/react-dialog @radix-ui/react-dropdown-menu`
   (add more `@radix-ui/*` packages as you copy more components).
3. Copy `cn.ts` and the components you need under `src/components/ui/`
   (shadcn CLI output works as-is; keep relative or `@/` imports consistent).
4. Use them in routes — all client-safe. External state (e.g. deleting a todo)
   goes through serverFns, never direct fetch of secrets.

The E2E cookbook test opens a Radix Dialog and DropdownMenu in a real browser
(hydration parity, no pageerror). Zero-trust is unaffected: components are
client modules; data flows through loaders/serverFns only.
