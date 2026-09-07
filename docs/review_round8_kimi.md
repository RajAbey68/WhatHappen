## ROUND FINDINGS

### [P0] TOCTOU vulnerability in ingest path validation
- Section: 5.6 `whathappen_trigger_ingest` - Atomic Open-Then-Verify Security Validation
- Problem: The described validation sequence has a race condition. `fs.openSync()` opens the file, then `fs.realpathSync()` is called on the original `filePath` string, not the file descriptor. A malicious actor can swap the file between open and realpath resolution. Additionally, `fs.realpathSync(filePath)` on a potentially symlinked path returns the target, but the descriptor `fd` was already opened—if `filePath` was a symlink to an allowed path, the descriptor points to the target, yet the check validates the target is in allowlist, which passes. The real vulnerability: `realpath` should be called on `/proc/self/fd/<fd>` or equivalent to verify the opened file's actual path, not re-resolve the original path string.
- Required fix: Use `fs.realpathSync('/proc/self/fd/' + fd)` on Linux, or platform-equivalent, to verify the descriptor's actual backing file path against allowlist before streaming.

### [P0] Missing symlink attack defense in allowlist check logic
- Section: 5.6 `whathappen_trigger_ingest` - Allowlist Containment Check
- Problem: The allowlist check uses `path.relative(allowedDir, realPath).startsWith('..')` pattern, which is vulnerable to symlink directory traversal. If `/Users/rajabey/exports` is in allowlist and an attacker creates `/Users/rajabey/exports/evil -> /etc/passwd`, `realPath` resolves to `/etc/passwd`, and `path.relative('/Users/rajabey/exports', '/etc/passwd')` returns `../../etc/passwd`, which `startsWith('..')` is true—**but** the logic uses `!startsWith('..') && !isAbsolute(...)`, so this correctly rejects. However, the check `!path.isAbsolute(path.relative(...))` is always true since `path.relative` never returns absolute paths. More critically, if `allowedDir` itself contains a symlink component, or if `realPath` is exactly `allowedDir`, the relative path is empty string `''`, which `startsWith('..')` is false and `isAbsolute('')` is false, passing containment. But the real bug: `fs.constants.O_NOFOLLOW` is used with `|| 0` fallback, meaning on macOS/Windows where `O_NOFOLLOW` may be undefined, it silently becomes `0` (no flag), allowing symlink open. The descriptor is then used without path verification.
- Required fix: Remove the `|| 0` fallback—fail closed if `O_NOFOLLOW` is unavailable. Verify `fs.realpathSync('/proc/self/fd/' + fd)` against allowlist, not the original path.

### [P1] `O_NOFOLLOW` availability assumption breaks macOS/Windows
- Section: 5.6 `whathappen_trigger_ingest` - Open Handle First
- Problem: Node.js `fs.constants.O_NOFOLLOW` is Linux-specific. On macOS and Windows, `fs.constants.O_NOFOLLOW` is `undefined`, so `(fs.constants.O_NOFOLLOW || 0)` evaluates to `0`, silently disabling symlink protection. The code comments suggest awareness but accepts the fallback.
- Required fix: Explicitly check platform and require `O_NOFOLLOW` behavior; on macOS use `fs.lstat` + manual verification, or use `fs.open` with appropriate flags and verify descriptor path via `/proc/self/fd` equivalent.

### [P1] Missing macOS/Windows descriptor path resolution
- Section: 5.6 `whathappen_trigger_ingest`
- Problem: `/proc/self/fd/<fd>` is Linux-only. The plan mentions no macOS/Windows equivalent for verifying the actual path of an opened file descriptor, making the TOCTOU defense incomplete on non-Linux platforms.
- Required fix: Document platform limitation or implement platform-specific verification (e.g., `F_GETPATH` fcntl on macOS, `GetFinalPathNameByHandle` on Windows).

### [P1] Session key extractability via `extractable: false` bypass
- Section: 4. Cryptographic Handshake - Key Derivation
- Problem: The plan states `extractable: false` prevents key export, but `CryptoKey` objects with `extractable: false` can still be used with `crypto.subtle.wrapKey` if a wrapping key is available, or exfiltrated via side channels in the same process. More critically, the derived key is stored in a JavaScript `Map` (`sessions`) which is vulnerable to prototype pollution or memory inspection if the Node.js process is compromised. The "zeroing" of `derivedBuffer` is irrelevant since the `CryptoKey` object retains the key material internally.
- Required fix: Document that `extractable: false` is a best-effort browser/WebCrypto guarantee, not a hard security boundary in Node.js. Consider using `node:crypto` with ephemeral keys instead of WebCrypto for local-only operation.

### [P2] `PROJECT_LOCKED` error lacks authentication context
- Section: 5.3, 5.4, 5.5 - Fail-Fast Invariant
- Problem: The `PROJECT_LOCKED` error is thrown for both "never unlocked" and "token expired" cases. This leaks no information, but the auto-refresh at 90% TTL with fallback retention means a token could be expired for 10% of TTL (12 minutes) before detection, and the error gives no indication whether re-authentication will succeed.
- Required fix: Distinguish `PROJECT_LOCKED` (never authenticated) from `SESSION_EXPIRED` (re-authentication may succeed) to aid debugging without security loss.

### [P2] Missing output size limit enforcement on `whathappen_search_messages`
- Section: 5.3 - Implementation step 5
- Problem: The plan states "Stops appending complete message objects before exceeding 100,000 UTF-8 characters" but doesn't specify how this is measured or enforced. `JSON.stringify` of the envelope will exceed this if individual messages are large. The check appears to be on the formatted output array, not the final JSON string.
- Required fix: Clarify that character count is measured on `JSON.stringify(result).length` or document the approximation method and truncation behavior.

### [P2] `WHATHAPPEN_INGEST_ALLOWLIST` JSON parsing failure mode ambiguous
- Section: 3. Configuration - `WHATHAPPEN_INGEST_ALLOWLIST`
- Problem: "Fails closed (ingest tool disabled) if empty, unset, or invalid JSON" but doesn't specify the error behavior. Does `whathappen_trigger_ingest` return a specific error code, or is the tool absent from the tool list? MCP servers typically list tools statically; runtime disabling requires dynamic tool filtering or error responses.
- Required fix: Specify whether the tool is omitted from `tools/list` or returns `INGEST_DISABLED` error on call.

### [P3] Memory zeroing is best-effort only
- Section: 4. Cryptographic Handshake - Memory Hygiene
- Problem: `buf.fill(0)` is explicitly noted as relying on OS encrypted swap/FileVault. This is accurate but the plan presents it as sufficient. V8's moving garbage collector and potential buffer copies during `Buffer` operations mean passphrase material may exist in multiple locations.
- Required fix: Document as defense-in-depth, not guarantee. Consider using `Buffer.alloc` with `zeroFill: false` and explicit overwrite, or `crypto.zeroFill` if available.

## VERDICT

BLOCKED
P0=2 P1=3 P2=3 P3=1