```
## ROUND FINDINGS
### [P0] Insecure HMAC-SHA256 Key Derivation
- Section: 4. Cryptographic Handshake & Key Management Ground-Truth
- Problem: Using `sha256Hex(passphrase)` as the HMAC key is insecure. HMAC keys should be full entropy, not derived from a passphrase. This weakens the security of the challenge-response handshake.
- Required fix: Use PBKDF2 with sufficient iterations to derive the HMAC key from the passphrase, similar to how the AES key is derived.

### [P1] Missing Rate Limit on Challenge Requests
- Section: 5.3 whathappen_unlock_project
- Problem: There's no rate limiting on `GET /api/auth/challenge` requests, allowing potential brute force attacks on the nonce generation.
- Required fix: Implement strict rate limiting (e.g., 1 request per 30 seconds per project) for challenge requests.

### [P2] Insufficient Passphrase Complexity Enforcement
- Section: 3. Configuration & Canonicalization Ground-Truth
- Problem: Only checking for minimum 16 characters is insufficient. Common weak passphrases could still be used.
- Required fix: Add basic complexity checks (e.g., reject common passwords, require mix of character types).

### [P2] Missing Validation on Financial Keywords
- Section: 5.7 whathappen_extract_financials
- Problem: The keywords parameter validation is too permissive (`^[a-zA-Z0-9\s,._-]+$`), potentially allowing injection of malicious patterns.
- Required fix: Use a stricter allowlist of characters and validate each keyword individually.

## VERDICT
BLOCKED
P0=1 P1=1 P2=2 P3=0
```