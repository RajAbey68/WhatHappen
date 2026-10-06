## ROUND FINDINGS

### [P0] Missing token validation in `whathappen_search_messages` implementation
- Section: 5.3 `whathappen_search_messages`
- Problem: The tool validates a cached token but the spec doesn't specify how the token is obtained for this call. If `whathappen_unlock_project` wasn't called first, there's no cached token. The tool will fail with unclear error or attempt decryption with no passphrase context.
- Required fix: Explicitly require `whathappen_unlock_project` to be called first, or add a parameter to accept the token directly with fallback to env-based auth.

### [P0] `whathappen_trigger_ingest` allows arbitrary file path traversal
- Section: 5.6 `whathappen_trigger_ingest`
- Problem: The tool accepts an absolute file path with only extension and existence checks. No validation prevents reading sensitive files (SSH keys, browser cookies, other project data) or exfiltration via symlinks. The 100MB limit is also not enforced before streaming.
- Required fix: Restrict paths to a configurable allowlist directory, resolve symlinks, and verify size before streaming.

### [P1] `WHATSAPP_PASSPHRASE_HASH` naming inconsistency and unused verification
- Section: 3, 5.2 `whathappen_unlock_project`
- Problem: The hash is named `WHATSAPP_*` not `WHATHAPPEN_*`, breaking the established prefix convention. More critically, the spec describes using this hash for "verification" but the implementation uses HMAC-SHA256 proof against a challenge—there's no clear role for the pre-computed hash. This creates ambiguity about whether the hash is actually used or if it's dead code.
- Required fix: Rename to `WHATHAPPEN_PASSPHRASE_HASH` or remove if unused; clarify exact verification flow if retained.

### [P1] `whathappen_extract_financials` bypasses local decryption invariant
- Section: 5.5 `whathappen_extract_financials`
- Problem: The tool calls `/api/analyze-project` which runs server-side analysis. This contradicts the zero-knowledge invariant that "decryption occurs exclusively in local client RAM." Server-side analysis requires server-side decryption or the server already has plaintext access, breaking the security model.
- Required fix: Perform financial extraction locally after fetching and decrypting messages via the standard API, or document explicit server-side decryption exception with threat model update.

### [P1] `whathappen_get_chronology` lacks decryption key specification
- Section: 5.4 `whathappen_get_chronology`
- Problem: The implementation states "decrypts messages in RAM" but doesn't specify the key source. Unlike 5.3 which implies `WHATHAPPEN_PASSPHRASE` usage, this tool doesn't clarify if it uses the env var, cached derived key, or requires prior unlock.
- Required fix: Explicitly state the key source and dependency on prior `whathappen_unlock_project` call or env var presence.

### [P2] No rate limiting or retry logic for API calls
- Section: 5.x (all tools)
- Problem: All HTTP API calls lack specified rate limiting, exponential backoff, or circuit breaker patterns. Network flakes or 429 responses will propagate as tool failures without graceful degradation.
- Required fix: Add retry policy (3 attempts with jitter) and explicit 429/503 handling in implementation notes.

### [P2] Missing token refresh mechanism
- Section: 5.2 `whathappen_unlock_project`
- Problem: Tokens have a 2-hour TTL but no refresh mechanism is specified. Long-running analysis sessions will fail mid-operation when tokens expire.
- Required fix: Add automatic refresh on 401 responses or explicit re-auth flow in dependent tools.

### [P2] `limit` parameter clamping inconsistency
- Section: 5.3 `whathappen_search_messages`
- Problem: Parameter `limit` has max 200 but output is clamped to "max 100K chars"—these are different dimensions (count vs characters) with no clear relationship. A single message could exceed 100K chars, causing silent truncation.
- Required fix: Clarify clamping logic: apply limit first, then character cap with truncation warning.

### [P3] No versioning in tool names
- Section: 5.x (all tools)
- Problem: Tool names are unprefixed with version. Breaking changes will require client-side migration or name collisions.
- Required fix: Consider `whathappen_v1_*` prefixing or namespace versioning in tool names.

## VERDICT
BLOCKED
P0=2 P1=4 P2=3 P3=1