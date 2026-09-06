# Gates: WhatHappen MCP completion

OWNS: scripts/**, lib/**, app/api/**, __tests__/**, docs/**, package.json, package-lock.json
Scope: complete and verify MCP remediation against the seven Linear issues.

- [x] G1: Authentication and decryption regressions pass without unsafe fallback credentials or URL keys.
  EVIDENCE: 458 Jest tests passed, including backend auth and decryption regression suites. Production verifier rotation remains separate under G5.
- [x] G2: Synthetic analytics prove conversation isolation, financial assertion accuracy, temporal filters and bounded citation output.
  EVIDENCE: 18 Node MCP tests passed; independent review fixes include indexed 50k issue scan, sender reply context and negative financial contractions.
- [x] G3: Real stdio protocol and synthetic HTTP integration prove input validation, pagination, retries and resource bounds.
  EVIDENCE: Real SDK stdio client exercised all eight tools against synthetic HTTP archive; input, cursor, byte-bound and retry assertions passed.
- [x] G4: Full repository test suite, build and quality gate pass; independent review findings resolved.
  EVIDENCE: 40 Jest suites/458 tests, 18 MCP tests, fresh nonincremental TypeScript check, local and server production build passed.
- [ ] G5: Commit and reviewable remote PR exist; deployment and revocation are verified before issues are closed.
  EVIDENCE: pending

Ruling: use a standalone local clone within the writable workspace to avoid altering Antigravity's checkout or its untracked files.
Ruling: retain the existing trusted-backend architecture and state it honestly; true client-side key custody is a different migration.
Ruling: remove unsafe regex support from the public contract; literal AND/phrase search with date and provenance filters is the safe supported behavior.
