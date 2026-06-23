#!/usr/bin/env bash
# Apply P0 security fixes and push a reviewable branch. Run from a clone with push access.
# Place p0-security.patch next to this script.
set -euo pipefail
git checkout main && git pull --ff-only
git checkout -b fix/p0-security
git apply --reject --whitespace=fix p0-security.patch
npm ci
echo ">> Running tests — merge is BLOCKED unless these pass (four-eyes requirement):"
npm test            # MUST be green: sql-validator hardening + auth-gate (401) suites
git add -A
git commit -m "P0 security: auth-gate 13 legacy handlers + harden SQL validator to single-flat-SELECT (TDD)"
git push -u origin fix/p0-security
echo "Pushed fix/p0-security. Open a PR."
