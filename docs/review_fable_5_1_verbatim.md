# Adversarial Architecture Review: WhatHappen Forensic RAG & MCP

**Reviewer stance:** This document is labeled "Deployed & Verified." Below are the reasons I would block that label. Findings are ordered by severity; each includes the concrete failure mode and a required remedy.

---

## P0 — CRITICAL (block deployment / immediate remediation)

### P0-1. The "air-gapped" claim is false, and the architecture is designed to exfiltrate evidence to a third-party cloud
- The host has a public IPv4 (`167.233.236.178`) on a commodity Hetzner box.
- Stage 4b explicitly routes retrieved forensic evidence ("verbatim tool citations") to Claude 3.5/3.7 via Claude Desktop/Cursor/Windsurf. Every `whathappen_search_chat` result is transmitted to Anthropic/OpenAI/Codeium infrastructure and is subject to their retention and training policies.
- Client IDEs on developer laptops hold SSH keys to the box.
This is not air-gapped; it is a public server with a cloud-LLM egress path baked into the primary workflow. For "courtroom-grade" material this misrepresentation is a legal and chain-of-custody liability, not a wording issue.
**Remedy:** Strike "air-gapped" from all documentation. Produce a formal data-flow diagram showing every network boundary crossed by transcript content. Gate Stage 4b behind an explicit per-project "cloud processing consented" flag with a DPA on file. If true isolation is a requirement, the MCP bridge must terminate at a local model, not a SaaS endpoint.

### P0-2. MCP transport = unrestricted root shell distributed to every AI client
`"command": "ssh", "args": ["-o","BatchMode=yes","root@…","node …"]`
- Every IDE/agent user is issued a passphrase-less (BatchMode) root key.
- No `command=` forced-command or `restrict` option in `authorized_keys`, so the key grants an interactive root shell, port forwarding, and SCP — not just the MCP script.
- The MCP script path, host IP, and project UUID are in a document that will be pasted into tickets and Slack.
- An LLM agent operating the client (Cursor/Windsurf agentic mode) can be prompt-injected into invoking arbitrary commands over that same channel.
**Remedy:** (1) Dedicated non-root `whathappen-mcp` user; (2) `authorized_keys` entries with `restrict,command="/usr/local/bin/whathappen-mcp-wrapper"` and `from="<CIDR>"`; (3) per-user keys with rotation and revocation; (4) move to MCP over HTTPS/SSE with short-lived bearer tokens and mTLS instead of shell-spawned stdio; (5) `PermitRootLogin no` in `sshd_config`; (6) rotate the currently issued root key immediately.

### P0-3. `projectId` is a caller-supplied parameter with no authorization → cross-tenant IDOR
All three MCP tools accept `projectId`. The `env` block sets a default, but the tool schema exposes it as an argument, so the LLM (or a prompt-injected transcript) can request any UUID. Combined with an unauthenticated internal API on `: