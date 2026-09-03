# 🪐 GEMINI.md — Antigravity Agent Directive

> [!IMPORTANT]
> **SERVER INFRASTRUCTURE GROUND-TRUTH:**
> WhatHappen and related backend services are hosted and executed on the **Hermes-Dev Server** (`root@167.233.236.178`), NOT on local host.

---

## 1. 🌐 Infrastructure & Endpoints

* **Primary Host:** `root@167.233.236.178`
* **WhatHappen Web Interface:** `http://167.233.236.178:3000`
* **WhatHappen Upload Gateway:** `http://167.233.236.178:8081`
* **Executive Command Center:** `http://167.233.236.178:8080/`
* **n8n Webhook Gateway:** `http://167.233.236.178:5678/webhook/kolake-marketing`
* **BuzzBar Relay Bus:** `wss://theahg.communities.buzz.xyz` (`:7070`)

---

## 2. 🗄️ Database & Project Context

* **Active Migrated Project Name:** `"KoLake Conversations"`
* **Project ID:** `eea59134-c195-4d07-8a0d-5834540c1d4d`
* **Description:** `"KoLake Ops, KoLake Resurrection, and some one-to-ones like Channa Sudath."`
* **Server Working Directory:** `/root/WhatHappen`
* **PM2 Processes on Hermes:**
  - `whathappen` (ID: 6) — Next.js Application on `:3000`
  - `hermes-ingest` (ID: 7) — WhatsApp / Media Ingestion Worker
  - `whathappen-upload` (ID: 3) — Upload Service on `:8081`

---

## 3. 🐝 BuzzBar Session Startup Protocol

* **Manifest Location:** `.agent-bus.json` in project root (synced with `~/.buzz/OUTBOX/whathappen-agent-bus.json`).
* **Active Project Channels:**
  - `#whathappen-chat` (`04a3d252-20d6-4ef1-9a3e-57cb7f73350b`) — Live coordination, Q&A, and heartbeats.
  - `#whathappen-ingest` (`253b4da8-6c1f-4eb1-938e-09287721f2ac`) — Ingestion CloudEvents & worker state.
  - `#whathappen-analytics` (`48346229-5842-49ca-986b-0de3a957a4ac`) — MoE Swarm analysis triggers.
* **Startup Handshake:** On startup, read `.agent-bus.json`, announce status as `Antigravity-IDE` on `#whathappen-chat`, and stay off the decryption path.
* **CLI Invocation:** `export $(cat ~/.buzz/.cli-env | xargs) && buzz messages ...`
