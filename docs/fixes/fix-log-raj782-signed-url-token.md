# Fix Log: RAJ-782 — Signed Upload URL Token

**Branch:** `fix/upload-signed-url-token`
**Date:** 2026-08-19

## Root Cause

`/api/upload-url` minted a signed Supabase Storage URL but never returned the
`token` required to upload against it. The client (`components/file-upload.tsx`)
attempted a raw `PUT` to `uploadUrl`, which Supabase Storage always rejects
(400) because signed-upload endpoints require the companion token for
authentication.

An empirical test confirmed the failure path:

```
SDK uploadToSignedUrl(path, token, file)  →  200 OK
raw PUT to signed URL (no token)           →  400 Bad Request
```

## Files Changed

### 1. Adapter — `vendor/asimov-ingest/src/storage/adapter.ts`

**Issue:** The `SignedUploadUrl` interface defined `url` and `path` but had no
`token` field. The Supabase implementation (`supabase.ts`) received `data.token`
from the SDK but dropped it.

**Fix:** Added `token?: string` to the interface. Return object includes
`token: data.token`.

### 2. Adapter types — `vendor/asimov-ingest/dist/storage/adapter.d.ts`

**Issue:** The dist types (consumed by `@asimov/ingest`) still had the old
interface without `token`.

**Fix:** Added `token?: string` for parity with the source.

### 3. Adapter dist — `vendor/asimov-ingest/dist/storage/supabase.js`

**Issue:** The compiled JS returned `{ url: data.signedUrl, path }` —
`data.token` was fetched but never serialised into the return.

**Fix:** Added `token: data.token` to the return object.

### 4. Route — `app/api/upload-url/route.ts`

**Issue:** The response body included `sessionId`, `uploadUrl`, and `path` but
not the `token` the client needs to call `uploadToSignedUrl`.

**Fix:** Added `token: signed.token` and `bucket` to the response JSON. Comment
documents the client contract.

### 5. Client — `components/file-upload.tsx`

**Issue (destructure):** `const { sessionId, uploadUrl }` did not capture
`path`, `token`, or `bucket`.

**Fix:** Destructure all five: `const { sessionId, uploadUrl, path, token,
bucket }`.

**Issue (upload):** The `else` branch issued `fetch(uploadUrl, { method: 'PUT',
... })` — a raw PUT that Supabase always rejects because it lacks the signed
token.

**Fix:** Replaced with the Supabase Storage SDK:
```ts
const { supabase } = await import('@/lib/supabase')
const { error } = await supabase.storage
  .from(bucket ?? 'evidence')
  .uploadToSignedUrl(path, token!, currentFile)
```

**Issue (redeclaration):** A second `const { supabase } = await
import('@/lib/supabase')` at line 380 (for polling) was in the same block scope
as the new upload import at line 356, causing a TypeScript build error.

**Fix:** Removed the second import; the polling code uses the already-imported
`supabase` binding.

### 6. Tests — `__tests__/api/raj782-upload-url.test.ts`

**Issue:** The mock `createSignedUploadUrl` returned `{ signedUrl }` without a
`token`. The contract test asserted only `sessionId` and `uploadUrl`.

**Fix:** Mock now returns `{ signedUrl, token: 'mock-supabase-token' }`.
Contract test asserts `body.token` and `body.bucket`.

## Verification

- **Typecheck:** `tsc --noEmit` passes
- **Unit tests:** `npm test -- --testPathPatterns=raj782` → 18/18 pass
- **Full suite:** 327 pass, 11 pre-existing failures (unrelated: auth env vars,
  component rendering)