# Message to Antigravity — 2026-09-06

**From:** Claude (Cowork session, cloud) via Raj
**Re:** WhatHappen MCP server — findings, defects, and one unresolved contradiction
**Status:** ACTION REQUIRED — every item below is now a Linear issue. Review and fix them.

## >> YOUR INSTRUCTIONS

Work the Linear issues, not this file. This file is the evidence pack behind them.

| Linear | Priority | Title |
|---|---|---|
| RAJ-969 | Urgent | Resolve loopback vs remote-host contradiction (**blocks the rest**) |
| RAJ-970 | Urgent | Rotate `WHATSAPP_PASSPHRASE_HASH` — verifier exposed |
| RAJ-971 | High | `search_chat` returns gemma3:4b synthesis instead of verbatim messages |
| RAJ-972 | High | `get_metadata` returns 229KB and blows the client context window |
| RAJ-974 | High | Seven `nsec` keys + Windsor.ai key in plaintext markdown |
| RAJ-973 | Medium | Implement `extract_financials` and `search_messages` |
| RAJ-975 | High | Ko Lake: test the float-bundling hypothesis (Raj owns; needs 971 + 973) |

Team: RajAsimov-ai · Project: WhatHappen · https://linear.app/rajasimov-ai

**Order:** RAJ-969 first (it changes the config guard), then 971, 972, 973.
974 and 970 run in parallel — they block nothing.

Close each issue against its acceptance criteria, not against "looks done".
Comment on the issue with what you changed and the evidence it works.

---


## 1. VERIFIED WORKING — do not "fix" these

The MCP bridge is live and reaches a Cowork cloud session through the desktop proxy.
Three tools are exposed: `whathappen_get_metadata`, `whathappen_search_chat`,
`whathappen_get_timeline`.

Decryption works end to end. `get_metadata` returned the project decrypted:

- Project: Ko Lake Analysis (`7ba94f4c-fb4e-4ee4-bc90-19984c5a8b59`)
- 11,441 messages, 2025-08-23 → 2026-08-31, 15 participants, names in clear
- 112 active days; busiest 2026-05-06 (40 msgs); peak hour 05:00 (241)

The zero-knowledge model holds: Supabase stores only AES-GCM envelopes
(`{ciphertext, iv, salt}`), 11,441 of 11,441 rows encrypted, 4 distinct salts
(4 upload batches — they decrypt only if the same passphrase was used each time).

---

## 2. DEFECT — search returns a model's synthesis, not the data

`whathappen_search_chat` calls `POST /api/ai-chat/query`, which runs local
`gemma3:4b` in RAG mode. It picks ~2 session windows, summarises them, and returns
**Gemma's prose** instead of matching messages.

Observed, verbatim, from the MCP:

> query "salary Chandi" →
> `"The conversation does not contain information about Chandi's salary."`

That is false. A direct keyword pass over the decrypted store returns **468**
matches for `chandi|salary`, and **39** for `float|100,000`.

**Fix:** replace the `/api/ai-chat/query` call with direct keyword/regex matching
over the decrypted records. Return verbatim timestamped messages with sender —
no model in the path. Plan §5.4 already specifies the guardrails: default limit 20,
max 100, truncate at whole-message boundaries before 100,000 UTF-8 bytes
(`Buffer.byteLength(str,'utf8')`).

Rationale is already house rule: see `.agents/rules/no-third-party-synthesis.md`.

---

## 3. DEFECT — `get_metadata` payload is 229 KB

It calls `GET /api/projects/${projectId}` with no summary flag and returns every
daily/hourly histogram and interaction matrix. 229,040 characters / 3,203 lines —
enough to blow a client's context window in one call. It did exactly that here.

**Fix:** request `?summary=true` (~1.5 KB: counts, participants, date range).
Keep the full histograms behind an explicit opt-in parameter.

---

## 4. MISSING — two tools from the plan

Plan v16 §5.6 specifies `whathappen_extract_financials`; it does not exist. Neither
does a paginated `whathappen_search_messages`. Current server is a 3-tool prototype.

`extract_financials` must stay **deterministic** — regex and ledger parsers over
decrypted text, structured JSON out, no LLM anywhere in the path. Terms to match:
float, advance, fees, salary, transfer, petty cash, invoice, LKR, USD, and numerics.

---

## 5. UNRESOLVED CONTRADICTION — read this before writing any transport code

The repo disagrees with itself about where WhatHappen lives.

- `AGENTS.md` §1: "hosted and executed on the Hermes-Dev Server
  (`root@167.233.236.178`), **NOT on local host**", web interface at
  `http://167.233.236.178:3000`.
- `docs/mcp-server-plan-v16.md` §3: `WHATHAPPEN_API_URL` "must parse to exact
  loopback IP `http://127.0.0.1:3000`... Any other target immediately halts process",
  and §6.5 "Strict Loopback Binding".

Both cannot be true. A live test on 2026-09-06 minted a project token against
`http://167.233.236.178:3000` over **plain HTTP across the public internet** — which
the loopback rule exists to prevent, and which the guard, if implemented, should
have refused.

Resolve deliberately, do not paper over:
- If the server stays remote, the sanctioned route is the SSH local forward from
  plan §1: `ssh -N -L 3000:127.0.0.1:3000 -o StrictHostKeyChecking=yes user@167.233.236.178`,
  and the MCP still points at `127.0.0.1:3000`.
- If the loopback rule is being dropped, amend the plan and say why. Do not leave a
  guard in the spec that the code and AGENTS.md both ignore.

---

## 6. SECURITY — three items, all outstanding

1. **Rotate `WHATSAPP_PASSPHRASE_HASH`.** The value `e2e5fd9b…` was pasted into a
   chat transcript and a shell history on 2026-09-06. It is a verifier, not the
   decryption key — nothing decrypts with it — but it mints project tokens, which is
   enough to pull ciphertext. Regenerate and re-provision.
2. **Seven `nsec` private keys in plaintext** in `~/wiki/org-chart/KoLake-Villa-Org-Chart.md`.
   Any agent or IDE with read access to that directory can impersonate
   ContractForager, PermForager, GigForager, Pollen, Honey, Fizz on the relay.
   Move to `~/.secrets`, leave pointers.
3. **Windsor.ai key in plaintext** in `~/.agents/rules/buzzbar_standard.md`. Same move.
4. When the MCP is wired into an IDE, keep `WHATHAPPEN_PASSPHRASE` in user-scoped
   config or Keychain — never a repo `.mcp.json`. That is how it gets committed.

---

## 7. Suggested order of work

1. §5 contradiction — decide the transport story first; it changes the config guard.
2. §2 direct search — highest value per line of code; unblocks real analysis.
3. §3 summary flag — one query parameter.
4. §4 `extract_financials`.
5. §6 rotations — can run in parallel, does not block the above.

## 8. Why this matters commercially

First query once §2 lands: every float and fee message, May–June 2026. This message
was found on 2026-07-31 and it may close a reconciliation gap:

> "Total is 175,000. 100,000 your fees. Rest KLV spends and petty cash float."

The May/June accounting packs flag two 100,000/month management fees as unevidenced
in bank data, plus LKR 415,000 (May) and 158,771 (June) unexplained in Channa's
floats. If fees were routinely bundled inside float transfers, the bank would show
floats and no fees — exactly what was observed. Confirm or refute across all 39
matches. This is the question the whole corpus was built to answer.

---
*Written by Claude via the Cowork desktop bridge. No code was changed. Nothing was
sent to any channel or guest. All findings above are from live tool output on
2026-09-06 except §5's live test, which was run by Raj.*
