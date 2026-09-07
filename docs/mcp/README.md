# WhatHappen MCP 3.0

Eight read-only tools expose cited archive evidence and deterministic analytics. The backend holds the archive decryption key. Evidence returned to an MCP client is visible to that client and potentially its model provider. This is encrypted storage with an authorized trusted backend, not zero knowledge.

## Run

Use Node 22 and install locked dependencies with `npm ci`. Apply `supabase/migrations/20260906120000_mcp_archive_revision.sql` before starting this MCP version. Keep the application reachable through a verified SSH tunnel at `http://127.0.0.1:3000`. Run `node scripts/whathappen-mcp.mjs`; stdout is reserved for the MCP protocol.

Set `WHATHAPPEN_ENV_FILE` to an absolute protected environment file when the client has another working directory. Configuration:

- `WHATHAPPEN_API_URL`: HTTP loopback origin only, default `http://127.0.0.1:3000`.
- `WHATHAPPEN_PROJECT_ID`: archive UUID; the legacy default remains for compatibility.
- `PROJECT_PASSPHRASE_HASHES`: JSON object mapping project UUIDs to SHA-256 authentication verifiers. Configure matching values on client and server. Unmapped projects fail closed on the server unless explicitly allowlisted using `LEGACY_PASSPHRASE_PROJECT_IDS`.
- `WHATSAPP_PASSPHRASE_HASH`: legacy shared verifier when scoped configuration is absent. It is a bearer-equivalent secret, not a harmless password digest.
- Server only: `PROJECT_PASSPHRASE` for existing archive decryption, `APP_SESSION_SECRET`, Supabase service credentials. The MCP process does not need the decryption key.
- Server `APP_SESSION_VERSION`: change to revoke issued project tokens without changing the archive key.

Authentication verifier rotation and archive encryption-key rotation are separate operations. Preserve the existing encryption key. Coordinate new authentication credentials with browser users and MCP clients before rotating; restarting with a new session version alone does not revoke a leaked authentication verifier.

## Contract and limits

Tool names remain compatible; responses use a new `schemaVersion: "3.0"` envelope in both `structuredContent` and JSON text content. Read `source`, `data`, `pagination`, and `warnings`. `source.complete` describes archive retrieval, while pagination describes the returned result slice. Use `nextCursor` with identical arguments to continue. Cursors are tied to the tool, filters, archive revision, and running MCP process. Restart pagination after any change or process restart.

All serialized tool results, including both representations, are at most 100,000 UTF-8 bytes. Default metadata stays below 4KB. Whole oversized records are skipped and counted in `omittedOversized`. Limits are 100 result records per call, 500 archive rows per HTTP page, 50,000 archive messages and 64MiB decoded page data per project snapshot. Four project snapshots are retained. Each archive HTTP request has a 20-second timeout; one authentication retry and one changed-revision restart are allowed. Every tool call probes the backend even when its snapshot is cached.

Search supports literal all-word or phrase matching, never arbitrary regex. Dates are UTC; `startDate` is inclusive and `endDate` exclusive. A month name spans all years; use `YYYY-MM` for one year. Context requires an exact stored message ID and known conversation provenance. Legacy records without conversation IDs remain explicitly unknown; response-time estimates exclude them and operational candidates cannot be marked resolved from them. New nullable provenance columns do not reconstruct missing source information.

Financial extraction returns currency-anchored source assertions with amount, currency, intent and quotation. A claimed payment is not proof of settlement. Separate messages may repeat the same real transaction; no ledger balance or cross-currency total is inferred. Operational resolutions remain candidates, and reply delays are estimates, not service-level measurements.

The separate application chat route uses local Ollama (`OLLAMA_URL`, `OLLAMA_MODEL`, default `gemma3:4b`). It reports limited evidence coverage and returns HTTP503 if inference fails. There is no successful metadata-only sandbox fallback.

## Verification and release

Run `npm run test:mcp`, `npm test -- --runInBand`, `npm run type-check`, and `npm run build`. The MCP suite opens a real stdio SDK client against synthetic HTTP evidence; it does not depend on private production messages. Apply the migration transactionally after checking the target project. It adds nullable columns, a monotonic revision, mutation triggers and a service-role-only snapshot RPC. It does not rewrite messages.

Deploy the tested commit, restart the application with its protected environment and verify authenticated archive pagination and a grounded chat answer. Capture the commit, archive revision, exact arguments and raw result for any reported metric. Compare repeated calls on the same revision. A browser page returning HTTP200 is insufficient verification. Keep Linear issues open for any unverified rollout or credential rotation.

Rollback: restore the previous application commit and restart. Leave the additive migration in place; dropping it would break new MCP clients. Preserve the protected environment and archive encryption key throughout.
