# Recipe: file uploads (multipart)

Source of truth: [`src/api/upload.ts`](https://github.com/moonsjs/cookbook/blob/main/src/api/upload.ts)
(exercised end-to-end by the cookbook CI script: small file → size, 70KB → 413,
missing field → 400, GET → 405).

Uploads are a plain `src/api` endpoint using the Web API — no framework surface:

```ts
import type { ApiHandlerArgs } from "@moonsjs/server";

const MAX_BYTES = 64 * 1024;

export const POST = async ({ req }: ApiHandlerArgs): Promise<Response> => {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES + 4096) return Response.json({ error: "too large" }, { status: 413 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "file required" }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) return Response.json({ error: "too large" }, { status: 413 });
  return Response.json({ name: file.name, size: bytes.byteLength });
};
```

Rules:

- `security.bodyLimitBytes` covers RPC only — enforce size limits per route
  (`content-length` **and** actual byte length; headers can lie).
- Never trust `file.name`/`file.type` for storage paths; generate server-side
  names and validate content (magic bytes) when it matters.
- Add rate limiting (global middleware pattern) to upload endpoints.
- `formData()` buffers into memory: pick sane limits; stream `req.body` for
  very large files.
