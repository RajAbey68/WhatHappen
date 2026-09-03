## ROUND FINDINGS

### [P0] Missing passphrase validation in search/chronology/financials tools
- Section: 5.5, 5.6, 5.7 (whathappen_search_messages, whathappen_get_chronology, whathappen_extract_financials)
- Problem: These tools only check for session presence (`PROJECT_LOCKED`/`SESSION_EXPIRED`) but never validate that `WHATHAPPEN_PASSPHRASE` is still present and valid in the environment. If the user unsets the env var after unlock, the session token exists but decryption will fail with corrupted/missing key material, leading to silent failures or misleading `DECRYPTION_FAILED` errors that don't distinguish between passphrase removal vs. actual corruption.
- Required fix: Add pre-flight validation in all decryption-dependent tools to verify `WHATHAPPEN_PASSPHRASE` is present and meets minimum length before attempting any cryptographic operations.

### [P0] Race condition on passphrase mutation between unlock and decrypt
- Section: 4 (Cryptographic Handshake), 5.3, 5.5-5.7
- Problem: The plan describes deriving `keyHex = sha256Hex(passphrase)` at unlock time (step 5 in 5.3), but the saltMap stores `CryptoKey` objects, not the raw derived key. If `WHATHAPPEN_PASSPHRASE` environment variable changes between unlock and subsequent tool calls, the cached session token remains valid but future key derivations for new salts will use the wrong passphrase, causing silent decryption failures for messages with uncached salts. The LRU cache key `sha256Hex(projectId.toLowerCase() + "\0" + salt)` does not include the passphrase, so stale entries will appear valid.
- Required fix: Include a passphrase fingerprint (hash of passphrase) in the cache key or re-derive and verify a master key proof on every decryption batch to detect passphrase changes.

### [P1] Unauthenticated project listing contradicts zero-knowledge claims
- Section: 5.1 (whathappen_list_projects)
- Problem: The tool is documented as "intentionally unauthenticated for local loopback discovery" but this leaks project existence metadata (names, message counts, timestamps) to any process on the local machine without any authorization. This violates the principle that project metadata should be as protected as content, especially for legal archiving use cases.
- Required fix: Require `WHATHAPPEN_PASSPHRASE` validation or session token for project listing, or document explicit acceptance of this metadata leakage with threat model justification.

### [P1] Missing stream size enforcement on API responses
- Section: 5.5 (whathappen_search_messages) mentions "aborts if stream exceeds 50MB" but 5.6 and 5.7 lack this protection
- Problem: The 50MB stream abort is only mentioned for search_messages, but get_chronology and extract_financials call the same endpoint (`/api/ai-chat/${projectId}`) without documented size limits. Large projects could cause memory exhaustion during decryption.
- Required fix: Add explicit 50MB stream size abort to all tools calling `/api/ai-chat/${projectId}` endpoint.

### [P2] No defense against passphrase timing side-channels
- Section: 4 (Cryptographic Handshake), 5.3
- Problem: The HMAC-SHA256 proof computation uses standard library functions without constant-time guarantees. While local execution reduces remote exploitation, side-channel aware code should use timing-safe comparisons for cryptographic proofs.
- Required fix: Use `crypto.timingSafeEqual` for HMAC verification comparison, or document explicit acceptance of local-only threat model making this non-exploitable.

### [P2] Unclear mutex scope for cross-tool operations
- Section: 4 (In-Memory Session Store), 5.3-5.7
- Problem: The plan states "All operations on a project (unlock, query, background refresh) acquire a per-project Promise lock" but does not specify if this mutex is shared across all MCP tool invocations or per-process. Multiple AI agent queries in parallel could deadlock or race if the mutex implementation isn't process-global.
- Required fix: Clarify mutex implementation uses a process-global singleton or IPC-backed lock, not just a module-level variable that might not be shared across worker threads.

### [P2] Missing cleanup on process termination
- Section: 4 (Memory Hygiene), 6
- Problem: The plan describes explicit `buf.fill(0)` in `finally` blocks but has no signal handler for `SIGTERM`/`SIGINT` to wipe session cache and passphrase buffers on graceful shutdown. Sensitive data may persist in RAM after process exit.
- Required fix: Add `process.on('SIGTERM', ...)` and `SIGINT` handlers to iterate session cache, zero all buffers, and clear the passphrase reference before exit.

## VERDICT
BLOCKED
P0=2 P1=3 P2=3 P3=0