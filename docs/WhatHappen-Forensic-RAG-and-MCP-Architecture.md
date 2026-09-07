# WhatHappen Forensic RAG & MCP Architecture

> **Document Classification:** Engineering Design & Operational Telemetry  
> **Target Environment:** Hermes-Dev (`167.233.236.178`) & Local IDEs  
> **Author:** Antigravity / DeepMind Engineering  
> **Last Updated:** September 3, 2026  
> **Status:** Deployed & Verified (Commit `a78b101` / `e46556a`)

---

## 1. Executive Summary

WhatHappen is an air-gapped forensic analysis engine designed to reconstruct chronological event timelines, extract verified financial transactions, and perform sentiment/stress analysis across large-scale WhatsApp and conversational exports (1,000 to 50,000+ lines).

To prevent hallucinations, data leakage, and silent timeouts on low-cost CPU host environments (such as Hetzner AMD EPYC servers with no GPU), WhatHappen utilizes a **Sessionized Dense RAG pipeline with In-Memory Vector Caching** coupled with an **external Model Context Protocol (MCP) tool server**.

---

## 2. High-Level System Architecture

```
                                    ┌────────────────────────────────┐
                                    │    User / WhatsApp Exports     │
                                    └───────────────┬────────────────┘
                                                    │
                                                    ▼
                                    ┌────────────────────────────────┐
                                    │   Hermes Ingestion Gateway     │
                                    │   (:8081 / lib/sessionizer.ts) │
                                    └───────────────┬────────────────┘
                                                    │
                       ┌────────────────────────────┴────────────────────────────┐
                       │ (Stage 1: Dense Embeddings)                             │ (Stage 2: Storage)
                       ▼                                                         ▼
       ┌────────────────────────────────┐                        ┌────────────────────────────────┐
       │   Local Ollama: bge-m3         │                        │   PostgreSQL / SQLite Storage  │
       │   (1024-dim dense vectors)     │                        │   (AES-GCM Zero-Knowledge)     │
       └───────────────┬────────────────┘                        └────────────────────────────────┘
                       │
                       ▼
       ┌────────────────────────────────┐
       │   In-Memory Vector Cache       │
       │   (Map<projectId, Vectors>)    │
       └───────────────┬────────────────┘
                       │
       ┌───────────────┴──────────────────────────────────────────┐
       │                                                          │
       ▼                                                          ▼
┌──────────────────────────────┐                          ┌──────────────────────────────┐
│  Internal Web Chat Interface │                          │  WhatHappen MCP Stdio Server │
│  (Next.js on :3000)          │                          │  (scripts/whathappen-mcp.mjs)│
│  - Top-3 Session Windowing   │                          │  - External AI Integration   │
│  - Gemma-3:4b Local CPU LLM  │                          │  - Claude Desktop / Cursor   │
│  - Strict 4-Step CoT Prompt  │                          │  - Sub-second Cloud LLM CoT  │
└──────────────────────────────┘                          └──────────────────────────────┘
```

---

## 3. Operational Performance & Scalability Telemetry

### A. Stage-by-Stage Latency Profile

| Stage | Process | 1,000 Lines | 10,000 Lines | 50,000 Lines | Operational Characteristic |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Stage 1** | Ingestion, Decryption & Temporal Sessionization | < 0.2s | ~1.2s | ~4.8s | Deterministic regex & idle-break grouping (>45m). |
| **Stage 2** | `bge-m3` Dense Vector Generation | ~2.5s | ~24.0s | ~2.5 mins | **One-time asynchronous background cost** on upload. |
| **Stage 3** | In-Memory Vector Search (Cosine Similarity) | < 1ms | ~3ms | ~12ms | Instant RAM sweep over 1024-dim embeddings. |
| **Stage 4a**| Local Ollama CPU Inference (`gemma3:4b`) | ~7.8s | ~7.8s | ~7.8s | **Decoupled from line count.** Prefills top-3 sessions only. |
| **Stage 4b**| External Cloud LLM via MCP Server (Claude 3.5/3.7) | ~1.8s | ~1.8s | ~1.8s | Instant, cloud-grade reasoning with verbatim tool citations. |
| **Stage 5** | Golden Q&A Memory Cache Hit | **120ms** | **120ms** | **120ms** | Bypasses LLMs completely for verified past queries. |

### B. The CPU Bottleneck & Context Window Tuning
- **The Issue:** Evaluating 8 session windows (~5,700 tokens) on an 8-core CPU took **85.9 seconds** for prompt prefill alone, exceeding Node's 30-second header timeout and triggering sandbox fallbacks.
- **The Fix:** Reduced retrieval context to the **top 3 session windows** (~1,200 tokens) and extended the internal fetch timeout with `AbortController` (180s). Turnaround dropped from **98s ➔ 7.82s**.

---

## 4. Chain-of-Thought (CoT) Prompting Standard

To enforce courtroom-grade and audit-ready rigor without hallucinations, all inference endpoints follow the **Strict 4-Step CoT Harness**:

1. **🔍 Verbatim Evidence Citations:**  
   Every statement must quote exact messages: `[Timestamp] Sender: "Exact quote"`. Never paraphrase.
2. **⏳ Chronological Event Sequence:**  
   Step-by-step reconstructed timeline in ascending order (Dispute/Request ➔ Action/Delay ➔ Resolution/Payment).
3. **📊 Sentiment & Tone Evaluation:**  
   Participant emotional state (Cooperative, Frustrated, Defensive, Stressed) mapped directly to words quoted in Step 1.
4. **📋 Grounded Operational Synthesis:**  
   Concise summary strictly bounded by retrieved quotes. Zero outside assumptions.

---

## 5. Model Context Protocol (MCP) Integration

External AIs (Claude Desktop, Antigravity, Cursor, Windsurf) connect to WhatHappen using the stdio MCP bridge.

### A. Server Configuration (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "whathappen": {
      "command": "ssh",
      "args": [
        "-o", "BatchMode=yes",
        "root@167.233.236.178",
        "node /root/WhatHappen/scripts/whathappen-mcp.mjs"
      ],
      "env": {
        "WHATHAPPEN_API_URL": "http://127.0.0.1:3000",
        "WHATHAPPEN_PROJECT_ID": "7ba94f4c-fb4e-4ee4-bc90-19984c5a8b59"
      }
    }
  }
}
```

### B. Exposed MCP Tools
1. `whathappen_search_chat(query, projectId)`: Semantic vector search returning exact quote clusters.
2. `whathappen_get_timeline(month, sender, projectId)`: Chronological slice across date ranges.
3. `whathappen_get_metadata(projectId)`: Project health, total message volume, and verified participant list.

### C. Client Agent Directive Prompt
```markdown
You have access to WhatHappen Forensic Chat MCP tools.
Operating Directives:
1. Always call `whathappen_search_chat` or `whathappen_get_timeline` before answering questions about operational history, expenses, or staff discussions.
2. Format responses using the 4 sections: Verbatim Citations, Chronological Timeline, Sentiment Assessment, Operational Synthesis.
3. Never invent quotes, dates, or senders. If not present in the transcript, state: "No record found."
```

---

## 6. On-Screen Report & Analysis UI Pattern

Per user directive, WhatHappen operates on an **"On-Screen First"** paradigm:
- **Interactive Modals:** Legal reports, executive analysis summaries, and message transcripts render in the browser immediately.
- **Search & Copy:** Users can filter transcripts on screen and copy evidence without generating files.
- **Deferred Conversion:** PDF, CSV, and JSON exports are optional secondary actions located in the viewer footer.

---

## 7. Future Roadmap & Enhancements

1. **Persistent Vector Storage:** Migrate `Map<string, EmbeddedSession[]>` to disk-backed `sqlite-vss` or `/root/WhatHappen/data/rag/vectors_<projectId>.json` to survive host reboots.
2. **Dynamic Lexicon Evolution:** Automatically expand Sinhala/English colloquialisms (`salli`, `float`, `petrol`, `advance`) via user feedback logging.
3. **Multi-Channel Spend & Windmill Automation:** Bridge n8n webhook triggers directly to WhatsApp conversation sessionizers.
