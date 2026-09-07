## ROUND FINDINGS

### [P0] Missing passphrase-to-key derivation alignment with server
- Section: 4. Cryptographic Handshake & Key Management Ground-Truth
- Problem: The plan specifies HMAC key as `sha256Hex(passphrase)` for server authentication, but the WhatHappen server ground-truth (`lib/session-store.ts`) uses `PBKDF2(passphrase, salt, 100000, 32)` for the actual encryption key derivation. The plan conflates two different key derivations: HMAC authentication uses SHA-256 hash of passphrase, but AES-GCM decryption requires PBKDF2-derived key. The plan's step 6 in `whathappen_unlock_project` says "Derives non-extractable AES-GCM CryptoKey" but doesn't specify using the server's salt from the challenge response, making it impossible to derive the correct decryption key.
- Required fix: Explicitly state that the challenge response includes `salt`, and AES-GCM key derivation must use `PBKDF2(passphrase, salt, 100000, 32)` matching `lib/crypto.ts`, not a standalone derivation.

### [P0] Challenge-response protocol underspecified
- Section: 5.3 `whathappen_unlock_project`
- Problem: The plan describes `GET /api/auth/challenge?projectId=<id>` returning a `nonce`, but doesn't mention the `salt` field that the actual server returns and requires for correct PBKDF2 key derivation. Without salt extraction and usage, decryption will fail with `DECRYPTION_FAILED` on every message.
- Required fix: Document that challenge response includes `{ nonce: string, salt: string, expiresAt: number }` and both fields must be used for HMAC proof and key derivation respectively.

### [P1] Session cache key collision risk
- Section: 4. In-Memory Session Store & Auto-Eviction
- Problem: Lowercase UUID normalization is applied, but RFC 4122 UUIDs are case-insensitive in the spec—however, the server may return or accept mixed-case in some contexts. If the server returns uppercase in API responses but the tool normalizes to lowercase for cache lookup, session validation will fail with `PROJECT_LOCKED` despite valid server-side session.
- Required fix: Explicitly require lowercase normalization on both storage and retrieval, and verify server responses are normalized before comparison.

### [P1] Rate limit state not shared across tools
- Section: 5.3 `whathappen_unlock_project`
- Problem: "Exponential backoff" is mentioned for unlock attempts, but no shared rate-limiting state exists between `whathappen_unlock_project` and other tools. A malicious or buggy agent could bypass the 3s unlock rate limit by calling `whathappen_search_messages` with invalid project IDs to trigger authentication loops, or the throttle on `list_projects` (1/5s) is independent of unlock throttling.
- Required fix: Implement global rate-limiting state per projectId across all tools, or explicitly document that rate limits are per-tool and acceptable.

### [P2] Missing server certificate/SSH validation
- Section: 1. Infrastructure & Security Ground-Truth
- Problem: The SSH tunnel command includes `-o StrictHostKeyChecking=yes` which is correct, but the plan doesn't specify how the MCP server validates it's actually talking to the real WhatHappen server vs. a local attacker on port 3000. Since it's HTTP (not HTTPS), there's no TLS pinning or certificate validation possible.
- Required fix: Document that this is accepted risk in single-user local model, or add a server identity verification step (e.g., challenge-response includes server public key fingerprint).

### [P2] AbortController cleanup race condition
- Section: 5.5 `whathappen_search_messages`
- Problem: "Uses `AbortController` in a `try...finally` block; aborts and cleans up stream if incoming bytes exceed 50MB" — if the abort triggers during active decryption, the `finally` block may zero buffers that are still being read by the decryption stream, causing undefined behavior or crash rather than clean error.
- Required fix: Specify that stream must be fully drained or destroyed before buffer zeroing, or use separate buffer copies for decryption.

### [P2] `process.uid` verification non-portable
- Section: 4. In-Memory Session Store & Auto-Eviction
- Problem: `process.uid` is undefined on Windows. The plan claims "Single-user local process binding (`process.uid` verified)" but this will fail or be bypassed on Windows workstations.
- Required fix: Replace with cross-platform process identifier (e.g., `process.pid` combined with machine ID hash) or document Windows as unsupported.

### [P3] 100KB plaintext truncation may break UTF-8 sequences
- Section: 5.5 `whathappen_search_messages`
- Problem: "Truncates strictly at whole message boundaries" is good, but the 100,000 byte limit is measured via `Buffer.byteLength(str, 'utf8')` on the already-constructed string. If a message boundary falls in the middle of a multi-byte UTF-8 sequence, the "whole message boundary" guarantee may fail depending on implementation.
- Required fix: Verify boundary check operates on raw bytes before string conversion, or explicitly document that messages are atomic units guaranteed to be below truncation threshold.

## VERDICT
BLOCKED
P0=2 P1=2 P2=3 P3=1