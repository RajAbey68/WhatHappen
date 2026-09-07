## ROUND FINDINGS

### [P0] Inconsistent API endpoint in tool implementations
- Section: 5.5 `whathappen_search_messages`, 5.6 `whathappen_get_chronology`, 5.7 `whathappen_extract_financials`
- Problem: Tools reference `POST /api/ai-chat/query` endpoint, but Section 3 and 4 describe authentication against `/api/auth/challenge` and `/api/project-token`. The `/api/ai-chat/query` endpoint is not defined in the API specification, and there's no documented contract for how it accepts project tokens, query parameters, or returns encrypted message structures. This is a phantom endpoint.
- Required fix: Define the actual WhatHappen API endpoints that return encrypted messages with salt/iv/ciphertext structure, or confirm `/api/ai-chat/query` exists with documented request/response schema matching the decryption logic.

### [P0] Salt cache key collision vulnerability
- Section: 4 (Bounded Per-Project Key Cache)
- Problem: The cache key `sha256Hex(JSON.stringify({ projectId, salt }))` is vulnerable to JSON key ordering ambiguity. `JSON.stringify({projectId: "A", salt: "B"})` and `JSON.stringify({salt: "B", projectId: "A"})` produce different strings, causing cache misses and redundant key derivation. Worse, if an attacker can influence salt values, they could potentially trigger cache pollution.
- Required fix: Use deterministic canonical ordering: `sha256Hex(projectId.toLowerCase() + "\0" + salt)` with explicit delimiter, or sort keys before stringification.

### [P1] Missing tool for passphrase rotation/re-entry
- Section: 5 (MCP Tools Specification)
- Problem: If `WHATHAPPEN_PASSPHRASE` is wrong or user needs to switch projects with different passphrases, the only recovery is restarting the entire MCP server process. No runtime passphrase update mechanism exists despite local-only scope.
- Required fix: Add `whathappen_set_passphrase` tool or document that server restart is required for passphrase changes.

### [P1] Unbounded `saltMap` growth within project session
- Section: 4 (Bounded Per-Project Key Cache), 5.3 `whathappen_unlock_project`
- Problem: The saltMap is initialized as `new Map()` with no eviction. While the text mentions "LRU Map capped at max 100 entries per project," the actual implementation in 5.3 shows a plain `Map`, not an LRU. A project with >100 unique message salts will grow unbounded in memory until session expiry.
- Required fix: Replace `new Map()` with actual LRU implementation (e.g., `lru-cache` package or custom) with documented 100-entry cap and eviction callback that wipes `CryptoKey` references.

### [P1] Rate limit state is undefined
- Section: 5.3 `whathappen_unlock_project`, 5.5 `whathappen_search_messages`
- Problem: "Enforces in-memory client-side rate limit" and "per-project rate limit throttle" are mentioned but no implementation details provided: no window sizes, no token bucket, no storage mechanism, no cleanup of stale entries. This is unimplementable as specified.
- Required fix: Specify rate limit data structure (e.g., `Map<projectId, {lastAttempt: number, backoffMs: number}>`), algorithm (exponential backoff with jitter), and maximum backoff ceiling.

### [P2] `whathappen_list_projects` lacks authentication
- Section: 5.1 `whathappen_list_projects`
- Problem: Tool calls `GET /api/projects` with no authentication mechanism described, yet Section 4 establishes that all data access requires project-token authentication. Either this endpoint is unauthenticated (security gap) or the plan omits required auth.
- Required fix: Clarify if `/api/projects` requires authentication and how it's provided, or mark as intentionally public with justification.

### [P2] Timestamp validation is underspecified
- Section: 5.5, 5.6, 5.7 (date parameters)
- Problem: "Strict ISO-8601 UTC date string ending in `Z`" is insufficient. ISO-8601 permits variations like `2026-01-01T00:00:00Z` (no milliseconds) and `2026-01-01T00:00:00.000+00:00` (numeric offset). The regex or parser is not specified.
- Required fix: Provide exact validation regex or reference specific parser (e.g., `Date.parse()` with explicit `Z` suffix check, or `zod` schema).

### [P2] No session cleanup on process signals
- Section: 4 (In-Memory Session Store), 6 (Resilience)
- Problem: The plan describes memory hygiene within `finally` blocks but omits process-level cleanup. On `SIGINT`/`SIGTERM`, sessions and derived keys may persist in memory until OS reclaim.
- Required fix: Add signal handler that iterates sessions, clears saltMaps, and overwrites sensitive buffers before exit.

### [P2] `anchorTimestamp` precision mismatch risk
- Section: 5.6 `whathappen_get_chronology`
- Problem: WhatsApp messages often have millisecond precision, but the example format shows `.sssZ`. No specification for how the server matches partial-second timestamps or handles timezone edge cases.
- Required fix: Document server-side timestamp matching behavior (exact, floor, or range-based).

### [P3] Redundant "Verified Canonical Ground-Truth Master" in title
- Section: 1 (document title)
- Problem: Version inflation ("v22.0") and grandiose titling don't improve technical accuracy. This is noise.
- Required fix: Use semantic versioning aligned with actual revision count (v2.0 per context).

---

## VERDICT
BLOCKED
P0=2 P1=3 P2=4 P3=1