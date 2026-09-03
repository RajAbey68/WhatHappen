# 🐝 WhatHappen: Agentic Microservices Architecture Specification
**Standard:** Event-Driven Swarm & Agentic Microservices (EDAM)  
**Coordination Bus:** BuzzBar (`wss://theahg.communities.buzz.xyz:7070`)  
**Fast Responder Engine:** GrokBot / Gemini Flash Sub-Second Routing  
**Status:** Canonical Architecture Blueprint · **Version:** 2.0.0

---

## 1. Executive Summary & Design Vision

This specification defines the evolution of **WhatHappen** from a Next.js-centric web application into a **decoupled, event-driven agentic microservices ecosystem**.

By leveraging **BuzzBar** as the real-time asynchronous message bus and deploying specialized **Autonomous Agent Microservices** (including **GrokBot** for ultra-low-latency chat/telemetry and **Forensic/Chronology Agents** for deep analytics), the system achieves:
1. **Sub-second (<1.5s) real-time responsiveness** on chat streams and marketing notifications.
2. **Zero-Knowledge privacy at rest** with ephemeral decryption in worker enclaves.
3. **Resilient scale** via distributed worker queues that eliminate serverless execution timeouts.

---

## 2. Global Agentic Swarm Topology

```
                               ┌─────────────────────────────────────────────────┐
                               │       BuzzBar Relay Service Bus                 │
                               │   wss://theahg.communities.buzz.xyz:7070        │
                               └──────┬──────────────┬──────────────┬────────────┘
                                      │              │              │
                   ┌──────────────────┘              │              └──────────────────┐
                   ▼                                 ▼                                 ▼
   ┌──────────────────────────────┐  ┌──────────────────────────────┐  ┌──────────────────────────────┐
   │       #whathappen-ingest     │  │       #whathappen-analytics  │  │       #whathappen-chat       │
   │  Topic: Chat backup events   │  │  Topic: MoE Swarm Jobs       │  │  Topic: Live Q&A Stream      │
   └──────────────┬───────────────┘  └──────────────┬───────────────┘  └──────────────┬───────────────┘
                  │                                 │                                 │
                  ▼                                 ▼                                 ▼
   ┌──────────────────────────────┐  ┌──────────────────────────────┐  ┌──────────────────────────────┐
   │   Ingest Worker Microservice │  │    MoE Analytics Swarm       │  │     GrokBot / Fast Agent     │
   │  (AdmZip, Sanitizer, GCS)    │  │  - Forensic Ledger Agent     │  │  - Low-latency (<1.5s) RAG   │
   │  Host: Hermes (PM2 ID: 7)    │  │  - Sentiment Mediator        │  │  - Grok / Gemini 2.5 Flash   │
   └──────────────┬───────────────┘  │  - Chronology Mapper         │  │  - Context Streamer          │
                  │                  └──────────────┬───────────────┘  └──────────────┬───────────────┘
                  │                                 │                                 │
                  └─────────────────────────┬───────┴─────────────────────────────────┘
                                            ▼
                             ┌──────────────────────────────┐
                             │      Supabase Postgres       │
                             │   - Ciphertext at Rest       │
                             │   - Row Level Security (RLS) │
                             │   - Partitioned Meta Tables  │
                             └──────────────────────────────┘
```

---

## 3. Microservice Roles & Responsibilities

### 3.1 GrokBot Real-Time Context Agent (`agent.grokbot.live`)
* **Primary Role:** Sub-second interactive RAG query processor and BuzzBar channel assistant.
* **Underlying Engine:** `xai/grok-beta` or `google/gemini-2.5-flash`.
* **Execution Boundary:**
  - Listens to `#whathappen-chat` and `#marketing-kolake`.
  - Consumes ephemeral project access token `x-project-token`.
  - Performs memory-only vector search and returns streaming markdown responses directly to the user or Buzz channel in $< 1.2\text{ s}$.

### 3.2 Ingest & Sanitizer Microservice (`service.ingest.sanitizer`)
* **Primary Role:** Asynchronous ZIP backup ingestion, media pruning, and zero-knowledge batch encryption.
* **Host Runtime:** Node.js worker on Hermes DevServer (`/root/WhatHappen/scripts/hermes-ingest-worker.ts`).
* **Execution Flow:**
  1. Receives `UPLOAD_COMPLETED` event from GCS webhook / API upload.
  2. Inspects ZIP for decompression bomb thresholds ($< 200\text{ MB}$, $< 1,000$ files).
  3. Strips large video files client/worker side.
  4. Encrypts chat messages using AES-GCM-256 with isolated IVs.
  5. Publishes `CHAT_READY_FOR_ANALYSIS` event to BuzzBar.

### 3.3 Mixture of Experts (MoE) Swarm Pipeline (`swarm.analytics.moe`)
* **Forensic Ledger Agent:** Extracts financial transactions, bank receipts, debt obligations, and currencies into a structured accounting ledger.
* **Relationship Mediator Agent:** Tracks communication friction, escalation timestamps, and emotional sentiment arcs.
* **Chronology Mapper Agent:** Normalizes ambiguous date mentions ("last Tuesday", "the day after invoice") into a strict ISO-8601 timeline.
* **Chief Synthesis Agent (Claude Sonnet 3.5):** Merges outputs from the 3 expert agents into a formatted executive dossier.

---

## 4. Standard BuzzBar Event Protocol (CloudEvents Compliant)

All agent microservices exchange standardized JSON envelopes over BuzzBar:

```json
{
  "specversion": "1.0",
  "id": "evt-9a8b7c6d-5e4f-3a2b",
  "source": "https://whathappen.ai/services/ingest",
  "type": "ai.whathappen.chat.ingested",
  "datacontenttype": "application/json",
  "time": "2026-09-01T19:55:00Z",
  "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
  "data": {
    "projectId": "eea59134-c195-4d07-8a0d-5834540c1d4d",
    "sessionId": "sess_8823f9a1",
    "messageCount": 1420,
    "encrypted": true,
    "sourceApp": "kolake-ops"
  }
}
```

---

## 5. Security, Zero-Knowledge & Isolation Invariants

1. **Ephemeral Key Lifecycle:**
   - The master passphrase is never stored on disk or in database columns.
   - Ephemeral project tokens (`x-project-token`) carry a 2-hour TTL signed by `APP_SESSION_SECRET`.
   - Agents decrypt chat segments exclusively in RAM during task execution and clear buffers immediately after token generation.

2. **Multi-Tenant `source_app` Separation:**
   - Every event and database row is tagged with `source_app` (e.g., `kolake-conversations`, `booklets-app`).
   - Postgres Row-Level Security (RLS) policies strictly isolate tenant data from cross-application contamination.

3. **Circuit Breaking & Rate Limiting:**
   - If an LLM provider throttles or fails, requests dynamically failover across `DeepSeek` $\rightarrow$ `Gemini Flash` $\rightarrow$ `Grok` $\rightarrow$ `Claude 3.5 Sonnet`.

---

## 6. Implementation & Deployment Blueprint

```
WhatHappen/
├── app/api/                      # Next.js Edge / Node REST Gateway
│   ├── auth/challenge/           # Zero-Knowledge Challenge Handshake
│   ├── project-token/            # HMAC Project Access Token Mint
│   └── process-file/             # Ingest Orchestrator
├── lib/
│   ├── crypto.ts                 # Isomorphic WebCrypto / NodeJS Crypto
│   ├── session-store.ts          # In-Memory Passphrase Proof & Tokens
│   ├── llm.ts                    # Multi-provider Resilient LLM Client
│   └── swarm/                    # Swarm Coordinator
│       ├── SwarmManager.ts       # MapReduce Orchestrator
│       ├── BuzzClient.ts         # BuzzBar WebSocket Service Bus Client
│       └── experts/
│           ├── GrokBotLive.ts    # Sub-second RAG Fast Responder
│           ├── ForensicAnalyst.ts
│           ├── RelationshipMediator.ts
│           └── ChronologyMapper.ts
└── scripts/
    └── hermes-ingest-worker.ts   # PM2 Background Ingest Worker
```

---

## 7. Operational Checklist on Hermes DevServer

- [x] WebCrypto & `getRandomValues()` polyfills hardened across insecure and secure contexts.
- [x] Zero-knowledge challenge-response token authentication active.
- [ ] Deploy `BuzzClient.ts` connector to Hermes PM2 ecosystem.
- [ ] Connect GrokBot agent on `#whathappen-chat` channel.
- [ ] Enable Nginx reverse-proxy with Let's Encrypt SSL on `https://whathappen.kolakevilla.com`.
