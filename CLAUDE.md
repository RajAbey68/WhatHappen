# CLAUDE.md — Project rules
> Inherits global rules from ~/.claude/CLAUDE.md

## Verification & action protocol (added 2026-06-01)
See ~/.claude/CLAUDE.md for full rules. Summary:
V1 — Verify before asserting: run a command, show output, then conclude.
V2 — Move before delete: SSD first, then Drive, then delete (caches excepted).
V3 — Confirm before irreversible actions, even mid a "be aggressive" session.
V4 — Separate OBSERVED / INFERRED / ASSUMED in all reports.
V5 — Acknowledge errors immediately and explicitly.
V6 — Git repos → SSD only. macOS packages → exFAT/APFS SSD only. Docs/media → owner chooses.
V7 — NEVER synthesize or simulate third-party reviews, models, or named tools. If unavailable, explicitly state lack of tool access and request verbatim input.
V8 — Mandatory Quality Gate: run `npm run quality-gate` (or `./scripts/quality-gate.sh`) and ensure zero fragile `.select(...).single()` violations before declaring any task complete.
V9 — Infrastructure Ground-Truth: WhatHappen backend and services run on **Hermes-Dev Server** (`root@167.233.236.178`), NOT localhost. Web endpoint: `http://167.233.236.178:3000`. Active migrated project: `"KoLake Conversations"` (`eea59134-c195-4d07-8a0d-5834540c1d4d`).
