## ROUND FINDINGS

### [P0] TOCTOU Race Condition in File Ingest
- Section: 5.6 `whathappen_trigger_ingest` — Security Validation & TOCTOU Defense
- Problem: The plan describes `fs.realpathSync(filePath)` followed by `fs.openSync(realPath, 'r')` as separate synchronous calls. Between resolution and open, an attacker with directory write access can swap the file (symlink attack). The "Atomic File Open" claim is false—`openSync` on a path string is not atomic with respect to path resolution.
- Required fix: Use `fs.openSync` with the original path and `O_NOFOLLOW` flag (where available), then `fstat` on the returned descriptor, or implement proper race-resistant validation using file descriptors exclusively after open.

### [P0] Missing Symlink Attack Mitigation
- Section: 5.6 `whathappen_trigger_ingest`
- Problem: `fs.realpathSync` resolves symlinks but provides no guarantee the resolved path remains stable. An attacker can race between `realpathSync` and `openSync` to redirect to arbitrary files (e.g., `/etc/shadow`, SSH keys) outside the allowlist. The allowlist containment check is therefore unreliable.
- Required fix: Open the file first, then validate the file descriptor's resolved path via `/proc/self/fd` (Linux) or `fgetpath` (macOS), or use `open(O_NOFOLLOW)` and reject if `O_NOFOLLOW` fails with `ELOOP`.

### [P1] HMAC Key Derivation Mismatch Risk
- Section: 4. Cryptographic Handshake — HMAC Proof Generation
- Problem: The plan states `sha256Hex(passphrase)` as the HMAC key, but references `lib/session-store.ts` as ground-truth without specifying its implementation. If `lib/session-store.ts` uses raw bytes rather than hex encoding, or uses different casing/encoding, authentication will fail with no recovery path.
- Required fix: Explicitly document the exact byte sequence expected by the server API, or provide a test vector in the plan to verify interoperability before implementation.

### [P1] Trial Decryption Gate Undefined
- Section: 4. Cryptographic Handshake — Trial Decryption Gate
- Problem: The plan mandates "test decryption of a sample ciphertext or project verification metadata" but does not specify what ciphertext is used, how it is obtained, or what constitutes success. Without this, implementers cannot build the gate correctly.
- Required fix: Specify the API endpoint and response field containing the trial ciphertext, or define the expected verification metadata structure and its location in the project record.

### [P1] Session Cache TTL Mismatch
- Section: 4. In-Memory Session Store and 5.2 `whathappen_unlock_project`
- Problem: The plan states session stored with "matching 2-hour TTL" but does not specify how this TTL is determined or synchronized with the server's token expiry. If the server returns a different expiry, the client will incorrectly assume session validity.
- Required fix: Explicitly state that TTL is derived from the `POST /api/project-token` response's `expiresAt` field, or require the server to return a fixed 2-hour expiry.

### [P2] Allowlist Path Traversal via Unicode Normalization
- Section: 3. Configuration — `WHATHAPPEN_INGEST_ALLOWLIST`
- Problem: The plan validates allowlist containment using `path.relative` after `fs.realpathSync`, but does not address Unicode normalization attacks (e.g., NFC vs NFD forms) or case-insensitivity on macOS/Windows. An attacker may craft paths that bypass containment checks on certain filesystems.
- Required fix: Normalize paths to NFC and perform case-fold comparison appropriate to the platform, or reject paths containing non-ASCII characters entirely.

### [P2] Rate Limit State Not Specified
- Section: 4. In-Memory Session Store — Concurrency Lock & Rate Limit
- Problem: The plan describes "max 3 attempts per 10s with exponential backoff" but does not specify whether this is per-project, global, or per-tool-invocation, nor how state persists across MCP server restarts (it doesn't, creating a bypass).
- Required fix: Clarify scope of rate limiting and accept that restart clears state as a known limitation, or implement persistent rate limit tracking.

### [P2] Missing Response Size Limit on API Calls
- Section: 5.3 `whathappen_search_messages` and others
- Problem: The plan limits output to 100,000 UTF-8 characters but does not specify a maximum response size from `POST /api/ai-chat/query`. A malicious or compromised server could stream unlimited ciphertext, causing memory exhaustion before decryption.
- Required fix: Add a hard response size limit (e.g., 50MB) with streaming JSON parser to abort oversized responses.

### [P3] Passphrase Length Minimum Arbitrary
- Section: 3. Configuration — `WHATHAPPEN_PASSPHRASE`
- Problem: 16-character minimum with "mixed characters" is insufficient guidance; it permits "1234567890123456a" which has minimal entropy. The plan does not reference WhatHappen's actual passphrase generation requirements.
- Required fix: Reference the platform's documented entropy requirements or remove client-side validation in favor of server rejection with specific error.

## VERDICT
BLOCKED
P0=2 P1=3 P2=3 P3=1