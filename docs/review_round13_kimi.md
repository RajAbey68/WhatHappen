## ROUND FINDINGS

### [P0] Trial Decryption Gate Circularity
- Section: 4. Cryptographic Handshake & Key Management Ground-Truth, step 3 of Sequential Trial Decryption
- Problem: Step 3 states the caller uses "the freshly minted token to fetch the first message ciphertext via `POST /api/ai-chat/query?limit=1`", but the API endpoint `POST /api/ai-chat/query` is not authenticated by token alone—it requires the derived AES key to decrypt responses. However, the key derivation (step 2) happens BEFORE the trial decryption that validates the key works. This creates a circular dependency: you cannot verify the derived key works without fetching ciphertext, but you cannot fetch ciphertext without a valid session, which you already have. More critically, if the passphrase is wrong, the server has already issued a token (step 1), meaning the trial decryption failure occurs client-side only—leaving a server-side token orphaned with no client-side cleanup mechanism described, and no server-side revocation on failed trial decryption.

- Required fix: Add explicit server-side token revocation on trial decryption failure, or redesign so token issuance is contingent on successful proof-of-decryption. Alternatively, document the orphaned token cleanup mechanism and maximum token accumulation risk.

### [P1] Session Cache Key Collision Risk
- Section: 4. In-Memory Session Store & Auto-Refresh
- Problem: The composite key `http://127.0.0.1:3000:${projectId.toLowerCase()}` embeds the canonicalized URL, but if a user legitimately uses SSH port forwarding (mentioned in Context) to access Hermes-Dev at `localhost:3000`, the canonicalization to `127.0.0.1:3000` would cause key collision with a local server also running on `127.0.0.1:3000`. Two different servers (local vs forwarded remote) with the same projectId would share a session cache entry, causing cross-server session leakage or token misuse.

- Required fix: Include the original (pre-canonicalization) hostname or a server fingerprint in the session key, or explicitly document that simultaneous connections to multiple servers are unsupported.

### [P1] Missing API Endpoint Specification Mismatch
- Section: 5.3 whathappen_unlock_project, step 3
- Problem: The plan specifies `GET /api/auth/challenge?projectId=<id>` but WhatHappen's actual API uses `POST /api/auth/challenge` with body parameters per standard REST patterns, or the endpoint may not exist as specified. The HTTP method and parameter encoding are unverified assumptions that will cause 404/405 errors on implementation.

- Required fix: Verify and document the actual WhatHappen API endpoint method and parameter structure, or add fallback logic for both GET query and POST body variants.

### [P2] Truncation Byte Count Ambiguity
- Section: 5.4 whathappen_search_messages, Implementation step 5
- Problem: "100,000 UTF-8 bytes using safe codepoint stream boundaries" is contradictory—UTF-8 byte boundaries do not align with codepoint boundaries for multi-byte characters. The implementation must choose: truncate at byte boundary (risking split multi-byte sequences) or at codepoint boundary (risking exceeding byte limit). The spec claims both simultaneously.

- Required fix: Clarify whether truncation is byte-precise with validation, or codepoint-precise with approximate byte limit, and document the exact algorithm.

### [P2] Rate Limit State Machine Undefined
- Section: 4. In-Memory Session Store & Auto-Refresh and 6. Resilience, Retries & Security Guardrails
- Problem: "per-project exponential backoff (max 3 unlock attempts per 10s)" and "exponential backoff (3 attempts with jitter) on 429/503 errors" describe two overlapping rate limit systems without clarifying interaction. If a 429 triggers retry-with-backoff, does it consume the unlock attempt quota? Is the backoff state persisted across server restarts (MCP stdio servers restart frequently)?

- Required fix: Define whether rate limits are in-memory only (reset on restart) or persisted, and clarify interaction between HTTP retry backoff and unlock attempt throttling.

### [P2] Missing Memory Zeroing Verification
- Section: 4. Cryptographic Handshake & Key Management Ground-Truth
- Problem: Multiple `buf.fill(0)` calls are specified for sensitive buffers, but Node.js Buffer zeroing does not guarantee immediate garbage collection or protection from memory dumps. The plan claims "zero-knowledge" but lacks `crypto.subtle` secure memory handling for the passphrase itself—only the derived key uses `extractable: false`.

- Required fix: Document that `passphrase` remains in Node.js heap until GC, and consider using `Buffer.allocUnsafe` with explicit overwrite or a native secure buffer module for the passphrase lifecycle.

### [P3] SSH Port Forwarding Security Caveat
- Section: Context and 3. Configuration & Canonicalization Ground-Truth
- Problem: The plan acknowledges SSH port forwarding to Hermes-Dev but does not warn that this violates the strict loopback-only security model—SSH forwarding exposes the local port to network interception if the SSH connection is compromised, and the canonicalization logic treats it as local.

- Required fix: Add explicit security warning that SSH forwarding is supported for development only and bypasses zero-knowledge network isolation guarantees.

## VERDICT
BLOCKED
P0=1 P1=2 P2=3 P3=1