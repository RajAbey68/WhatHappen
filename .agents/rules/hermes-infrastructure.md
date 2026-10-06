# 🌐 Hermes-Dev Server Infrastructure & Endpoints

> **CRITICAL RULE FOR ALL AGENTS (Antigravity, Claude, Codex, Cline):**
> WhatHappen and related backend services are hosted and executed on the **Hermes-Dev Server** (`root@167.233.236.178`), NOT on localhost. Always verify, deploy, and query services against Hermes-Dev endpoints.

---

## 1. 🖥️ Host & SSH Connection
* **Host IP:** `167.233.236.178`
* **User:** `root`
* **SSH Command:** `ssh root@167.233.236.178`

---

## 2. 🚀 WhatHappen Services & Endpoints

| Service | Port / URL | PM2 Process ID / Name | Directory / Script |
|---|---|---|---|
| **WhatHappen Web & API** | `http://167.233.236.178:3000` | `6` / `whathappen` | `/root/WhatHappen` |
| **WhatHappen Upload Gateway** | `http://167.233.236.178:8081` | `3` / `whathappen-upload` | `/root/file-upload/server.js` |
| **Hermes Ingestion Worker** | Outbound Worker | `7` / `hermes-ingest` | `/root/WhatHappen/scripts/hermes-ingest-worker.ts` |
| **Executive Command Center** | `http://167.233.236.178:8080/` | `2` / `dashboard` | `/root/dashboard` |
| **BuzzBar Relay Bus** | `wss://theahg.communities.buzz.xyz` (`:7070`) | `11` / `buzz-bar` | `/root/buzz-bar` |
| **n8n Webhook Gateway** | `http://167.233.236.178:5678/webhook/kolake-marketing` | Docker container | `5678` |

---

## 3. 📂 Supabase Database Context
* **Active Migrated Project Name:** `"KoLake Conversations"`
* **Project ID:** `eea59134-c195-4d07-8a0d-5834540c1d4d`
* **Description:** `"KoLake Ops, KoLake Resurrection, and some one-to-ones like Channa Sudath."`
* **Environment Files on Hermes:** `/root/WhatHappen/.env.production` (mirrored to `.env.local` and `.env`)
