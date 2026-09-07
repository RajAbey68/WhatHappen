## ROUND FINDINGS

### [P0] Tool parameter schema leaks projectId sensitivity pattern
- Section: 5.3 `whathappen_unlock_project` and all tools with `projectId`
- Problem: The RFC 4122 UUID regex validation pattern `[0-9a-fA-F]{8}-...` is documented in the tool schemas exposed to the LLM. While not a secret leak per se, this exposes the exact validation logic to prompt injection attacks where adversarial prompts could craft UUID-like strings to probe project existence. More critically, the `projectId` parameter is passed through MCP JSON-RPC tool calls, which may be logged by MCP clients (Claude Desktop, Cursor) in plaintext local logs, creating a metadata trail linking AI sessions to specific legal cases.
- Required fix: Add explicit documentation that MCP clients must not log tool parameters, or implement projectId hashing/obfuscation in tool calls with a local lookup table.

### [P0] Missing proof-of-possession for passphrase in unlock flow
- Section: 4. Cryptographic Handshake & 5.3 `whathappen_unlock_project`
- Problem: The handshake protocol as described is vulnerable to replay attacks. The server returns `{ nonce, expiresAt }` and the client responds with `HMAC-SHA256(sha256Hex(passphrase), nonce)`. An attacker with temporary access to local process memory could capture this proof and replay it within the expiry window. There is no binding to the specific unlock request or client identity. The plan references `lib/passphrase-proof.ts:39` but does not describe server-side challenge binding verification.
- Required fix: Require server to verify that the proof includes request-specific binding (e.g., HMAC over `nonce || client_timestamp || projectId`) or document that the server implementation already enforces single-use nonces with server-side state tracking.

### [P1] LRU saltMap cache eviction does not wipe CryptoKey material
- Section: 4. AES-GCM Decryption Key Derivation & Deterministic Salt Cache
- Problem: The plan states "Raw derived buffers are wiped with `buf.fill(0)` immediately upon WebCrypto import" but the LRU Map eviction at 100 entries only removes Map entries. The WebCrypto `CryptoKey` objects in the saltMap are non-extractable but remain in memory until garbage collected; they are not explicitly destroyed. On LRU eviction, the `CryptoKey` reference is dropped but the underlying key material may persist in the JS heap.
- Required fix: Use `crypto.subtle.exportKey` is impossible (non-extractable), so document explicit cache clearing on `lock_project` and session expiry, or switch to extractable keys with explicit buffer wiping.

### [P1] Rate limit throttle is client-side only and easily bypassed
- Section: 5.3 `whathappen_unlock_project` and 5.5 `whathappen_search_messages`
- Problem: The "min 3s interval per project, exponential backoff" and "min 1s interval" are implemented client-side in the MCP server. A malicious or buggy local process could instantiate multiple MCP server processes or bypass the throttle entirely. There is no mention of server-side rate limiting coordination via the `x-project-token` or challenge endpoint.
- Required fix: Document server-side rate limiting enforcement or implement cross-process throttle using file-based locks or OS-level synchronization.

### [P1] `whathappen_get_chronology` missing output size limit
- Section: 5.6 `whathappen_get_chronology`
- Problem: Unlike `whathappen_search_messages` which has explicit "100,000 UTF-8 bytes" truncation, `whathappen_get_chronology` has no output size bound. With `windowSize: 50` and large messages, this could exceed context window limits or cause memory pressure. The "structured message envelope" is undefined.
- Required fix: Add explicit cumulative byte limit matching `search_messages` (100,000 UTF-8 bytes) with whole-message boundary truncation.

### [P2] `WHATHAPPEN_PASSPHRASE` length validation is insufficient
- Section: 3. Configuration & Canonicalization Ground-Truth
- Problem: Minimum 16 characters is weak for a high-sensitivity legal archiving platform. Passphrases of exactly 16 characters with low entropy (e.g., "aaaaaaaaaaaaaaaa") pass validation. No entropy estimation or dictionary check is performed.
- Required fix: Add minimum entropy requirement (e.g., 80 bits) or zxcvbn-style strength check, or document that this is enforced server-side.

### [P2] Missing mlock/mprotect for passphrase and key material
- Section: 4. Cryptographic Handshake & Key Management Ground-Truth
- Problem: The plan describes `buf.fill(0)` for memory hygiene but Node.js provides no guarantee that buffers aren't swapped to disk. High-sensitivity legal data with `WHATHAPPEN_PASSPHRASE` and derived keys should use `mlock` equivalent or document acceptance of swap risk.
- Required fix: Document swap risk acceptance or investigate `process.setuid` with locked memory limits.

### [P2] `anchorTimestamp` precision ambiguity in chronology
- Section: 5.6 `whathappen_get_chronology`
- Problem: "Closest message to `anchorTimestamp`" is undefined—closest by absolute difference? What if two messages have identical distance? Tie-breaking rule is unspecified. Sub-millisecond precision in WhatsApp exports may cause non-deterministic selection.
- Required fix: Define tie-breaking (earlier message wins, or stricter ordering) and document timestamp resolution handling.

### [P3] `extract_financials` keyword list is hardcoded and locale-specific
- Section: 5.7 `whathappen_extract_financials`
- Problem: Keywords `payment`, `bank`, `invoice`, `transfer`, `receipt`, `deposit` and currency symbols are English-centric. German legal chats with "Überweisung", "Rechnung", "Zahlung" will not match. This limits utility for international legal archiving.
- Required fix: Document locale limitation or make keywords configurable via environment variable.

## VERDICT
BLOCKED
P0=2 P1=3 P2=3 P3=1