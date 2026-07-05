# WhatHappen — Production-Readiness Loop (Runbook)

Source: independent review (DeepSeek `deepseek-v4-flash` + Gemini `gemini-2.5-pro`), 2026-06-28.
Linear project: WhatHappen — Production Readiness (RAJ-217..230). Product class: **legal-grade**.

## Roles (per owner's model)
- **Builder:** Antigravity / branch WIP.
- **Reviewer (this loop):** Claude — review-led, builds only untouched issues.
- **Decider:** Raj.

## Model tiers (P7-compliant)
- **Iterative loop critic:** local Ollama `gemma3:12b` (free; no external cron spend).
- **Final gate (human-triggered):** Gemini + Z.AI. Author family (Claude) barred from reviewing its own diffs.

## Loop protocol (per work item)
1. Implement (TDD: failing test first) **or** review-existing WIP.
2. `gemma3:12b` critical pass over the diff → findings.
3. Iterate until the local critic is clean.
4. At sprint end: batch human-gate via `~/bin/adversarial-review --panel` (Gemini + Z.AI), verbatim.
5. Verify the REAL done (cross-tenant test green; build green), then mark Linear done.

## Sprints
- **Sprint 1 — M0 (ship-blocker):** RAJ-217 SEC-10 (review WIP), RAJ-218 SEC-11 (review WIP), RAJ-219 SEC-12 (BUILD).
- **Sprint 2 — M1:** RAJ-220 SEC-13, RAJ-221 SEC-14, RAJ-222 QA-1, RAJ-223 QA-2, RAJ-224 CMP-1.
- **Sprint 3 — M2:** RAJ-225 CMP-2, RAJ-226 CMP-3, RAJ-227 CRYPTO-1.
- **Sprint 4 — M3:** RAJ-228 ARC-1, RAJ-229 ARC-2, RAJ-230 ARC-3.

## Stop conditions (hard)
- Stop + report at each sprint's human-gate (Gemini/Z.AI) — do not auto-advance sprints unattended.
- Stop if a fix would clobber uncommitted work on another branch/worktree.
- Stop if the local critic flags a CRITICAL that needs a product decision.
- No default/config change (deploy target, region, model) without explicit confirm + 1-cmd rollback.

## State
- WIP preserved: branch `fix/sec-2-3-auth-tenancy` @ `d9fd95b` (SEC-10/11). Not pushed. Behind `main` (3ac6d92) — rebase before merge.
- Other in-flight: `fix/p0-service-role-rls` (SEC-2/3), worktree `agents/frequent-cardinal`.
