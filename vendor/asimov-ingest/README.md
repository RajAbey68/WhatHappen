# @asimov/ingest

One file-ingest pipeline, shared by **WhatHappen** and **booklets**. Guard → type detection → optional storage → app-specific handling.

Extracted from booklets' `src/lib/upload-guard.ts` (RAJ-456), which had been in production. It was not rewritten — booklets' existing test suite is the behavioural contract for this package.

## Why this exists

Both apps take a user file, validate it, OCR it, and land structured output in a database. Only the last step genuinely differs. Before this package that shared behaviour existed as two independent implementations, including two 243-line copies of `gemini-ocr.ts` pointed at the same microservice. A security fix applied to one would silently miss the other.

## The one design decision worth knowing

**Storage is optional, not `retention: { days: 0 }`.**

An earlier draft expressed booklets' "never store anything" behaviour as a retention window of zero days. Third-party review rejected that, correctly: it turns booklets' core safety property into an integer that a one-character diff (`days: 0` → `days: 1`) would flip into silently persisting other people's financial documents — with no other code change and no failing test.

So `storage` is an optional capability. Omit it and the pipeline **cannot** persist, because there is nothing to persist to. Ask such a pipeline to persist and it throws loudly rather than skipping quietly; in an evidence system, "I thought it was saved" is worse than an error.

```ts
// booklets — cannot persist, by construction
createIngestPipeline({
  accept: ['jpeg', 'png', 'webp', 'heic'],
  maxBytes: 5 * 1024 * 1024,
  onExtracted: async (p) => { /* OCR in memory, write journal entries */ },
})

// WhatHappen — persists to Supabase Storage
createIngestPipeline({
  accept: ['zip', 'txt', 'pdf'],
  maxBytes: 500 * 1024 * 1024,
  storage: createSupabaseStorageAdapter({ client: supabase, bucket: 'evidence' }),
  rateLimit: { capacity: 10, refillPerMinute: 10 },
  onExtracted: async (p) => { /* parse chat, write messages rows */ },
})
```

## What is shared vs what stays in each app

| Shared (this package) | Per-app |
|---|---|
| Size guard (O(1), no decode) | The `onExtracted` handler |
| Magic-byte type detection | The accept-list |
| Per-tenant rate limiting | Whether a storage adapter exists at all |
| `StorageAdapter` (Supabase / GCS) | What the extracted data *means* |

## Booklets adoption

`src/lib/upload-guard.ts` becomes a re-export. Every existing import path keeps working and **the test suite needs no edits** — that is the adoption gate. If a booklets test needs changing to pass, this package changed behaviour and the change is wrong.

```ts
export {
  UploadGuardError, type UploadGuardCode,
  MAX_RECEIPT_BYTES, estimateDecodedBytes, assertPayloadSize,
  assertImageMagicBytes, RateLimiter, type RateLimiterOptions,
} from '@asimov/ingest'
```

Verified: booklets' `tests/unit/receipt-upload-guard.test.ts`, byte-identical (md5 `82f85a11…`), 25/25 passing against this package.

## Install

```json
"@asimov/ingest": "github:RajAbey68/asimov-ingest#v0.1.0"
```

## Tests

`npm test` — 49 tests. Covers the inherited booklets contract, the generalised accept-list (proving a zip is refused for booklets and accepted for WhatHappen), the storage-optional invariants, and adapter failure modes.

## Known limitation, inherited

`RateLimiter` is per-process. On Cloud Run (`min-instances=0, max-instances=10`) the effective global limit is up to 10× capacity and resets on cold start. Defence in depth, not a hard cap. A shared store is required for that.
