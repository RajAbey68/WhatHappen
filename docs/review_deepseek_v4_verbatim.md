**Adversarial Architecture Review: WhatHappen Forensic RAG & MCP**  
*Reviewer: Senior Systems & Distributed Systems Architect (Adversarial)*

---

### **P0 – Critical (Immediate Production Risk / Blockers)**

#### 1. **False “Air‑Gap” and Complete Host Compromise via MCP**
- **Flaw:** The document claims “air‑gapped” while exposing a **root‑level SSH pipe** (`root@167.233.236.178`) as the MCP transport. Any client (Claude Desktop, Cursor) that adds this MCP server gains **unrestricted shell access** to the host, bypassing all application‑layer controls. Execution `BatchMode=yes` with no authentication token or restricted command set means an attacker who can influence a user’s MCP configuration (or steal the key) owns the box.
- **Remedy:**  
  - Abolish direct SSH as MCP transport. Use a hardened TLS‑gRPC/WebSocket MCP server that enforces **application‑level authentication** (e.g., scoped API keys, OAuth2, or short‑lived JWTs).  
  - If SSH is unavoidable for local tool use, spawn the MCP process inside a **restricted unprivileged container** (not `root`) with readonly access to necessary project files, no shells, and no outbound network except to `localhost:3000`.

#### 2. **Ephemeral In‑Memory Vector Cache – Data Loss & DoS**
- **Flaw:** The entire RAG index (`Map<projectId, Vectors>`) lives in Node.js runtime memory with **no persistence**. Every host restart, OOM kill, or process crash **destroys all ingestion state**, forcing a full recompute that blocks the pipeline for minutes. The Roadmap mention of “future” `vectors_<projectId>.json` shows this is acknowledged but currently missing.
- **Remedy:** Implement a **crash‑resilient vector store immediately**. Simplest: write‑through to `sqlite‑vss` or LMDB‑backed key‑value store on disk. Warm‑start from disk on boot, avoiding O(N) recomputation. Alternatively, shard vectors to mmap’d files with a metadata index.

#### 3. **No Access Control on MCP Tools – Cross‑Project Data Leakage**
- **Flaw:** `whathappen_search_chat(query, projectId)` accepts a `projectId` parameter with **zero authorisation**. Any MCP client (or an attacker with network access to the Next.js API) can read any project’s timeline, messages, and metadata, regardless of ownership.
- **Remedy:** Introduce per‑project, per‑session authentication. Every API call must carry a **cryptographic capability token** tied to a specific `projectId` and a session bound to the client. Reject calls with mismatched token.

#### 4. **Ingestion Gateway (Port 8081) – Unauthenticated & Plaintext**
- **Flaw:** The Hermes Ingestion Gateway (`:8081`) is described without TLS or authentication. An arbitrary actor on the network (or even the same host) can push arbitrary files, trigger decryption, and exhaust compute resources.
- **Remedy:**  
  - Enforce **mutual TLS (mTLS)** with client certificates.  
  - Require an HMAC‑signed ingestion token per upload, validated at the gateway.  
  - If meant for local‑only use, bind strictly to `127.0.0.1` and use Unix domain sockets with filesystem permissions.

---

### **P1 – High (Will Cause Outages / Incorrect Results)**

#### 5. **Race Conditions on In‑Memory Vector Map**
- **F law:** File upload (Stage 2) asynchronously mutates `Map<projectId, Vectors>` while searches (Stage3) read from it. Node.js’s event loop guarantees no true parallelism, but an ingestion `await` could yield control, letting a query operate on a **half‑written project index** (missing sessions, partial vectors) and produce invalid search results or exceptions.
- **Remedy:** Implement a **read‑write lock** or use **copy‑on‑write semantics**. On upload, build a new `Map` for that project, then atomically swap the reference after the embedding batch completes. Queries always read from the committed snapshot.

#### 6. **Golden Q&A Cache – Stale & Unbounded**
- **Flaw:** A cache hit returns results in 12 0ms, but there is **no invalidation strategy** described. If a project receives new ingested messages, the cache will return outdated timelines, citations, and sentiment analyses. No eviction policy, leading to unbounded memory growth.
- **Remedy:**  
  - Associate each cache entry with a *version* (project‑level sequence number). On ingestion, increment the version and flush all entries for that project.  
  - Implement LFU/LRU eviction with a configurable max size per project.  
  - Use a cryptographic hash of the query + context fingerprint to detect semantic drift.

#### 7. **Silent Timeout on Embedding Generation Overload**
- **Flaw:** Stage 2 (bge‑m3) is a “one‑time asynchronous background cost” but **no concurrency throttling**. Two simultaneous 50k‑line uploads will double the load on Ollama, causing embedding latency to spike beyond the HTTP timeout, cascading failures. The fix for the CPU prompt (top‑3 windows) masks only the LLM side, not embedding saturation.
- **Remedy:** Add a **queue with concurrency gate** (e.g., `p‑limit` of 1) for Ollama embedding calls. Queue status must be visible via metadata API; reject uploads with `429 Too Many Requests` if the embedding pipeline is already over threshold.

---

### **P2 – Medium (Design Deficiencies That Accelerate Decay)**

#### 8. **Exact‑Match Cosine Search – No ANN Index, O(N) at Scale**
- **Flaw:** “In‑Memory Vector Search (Cosine Similarity)” that sweeps all 50k vectors (12ms). While acceptable for 50k, it is a **linearly degrading path** with no indexing. Under any load spike or with multi‑project concurrency, this becomes a CPU hot spot, starving the event loop.
- **Remedy:** Integrate a lightweight ANN library (e.g., `hnswlib-node`) that builds in‑memory graphs during ingestion and provides O(logN) queries. Persist the index structure alongside vectors.

#### 9. **Missing Input Sanitization – Prompt Injection & Regex DoS**
- **Flaw:** The “verbatim citations” and `whathappen_search_chat` accept free‑form user queries. These are injected directly into LLM prompts and regex parsers. A crafted query (e.g., `Ignore previous instructions…`) can jailbreak the Cot or cause catastrophic backtracking in the temporal regex.
- **Remedy:**  
 - Apply allowlist‑based input sanitisation (strip control characters, limit length).  
 - Use RE2‑style safe regex libraries or impose a timeout on regex evaluation.  
 - For LLM prompts, wrap user input in a strict “ #### QUERY BEGIN … #### QUERY END ” fence and never use it as system prompt.

#### 10. **No Data Integrity Verification or Chain of Custody**
- **Flaw:** The system claims “forensic analysis” but lacks **tamper‑evident logging** of ingestion, query history, or LLM output. No Merkle tree over uploaded transcripts, no attestation that results correspond to the original file. An attacker with root (see P0) can silently alter the PostgreSQL store and change timelines.
- **Remedy:**  
  - On ingestion, compute a SHA‑256 of the original file and store it as an immutable fact.  
  - Sign each API response with a timestamped HMAC + version.  
  - Exportable audit trail linking every output to the exact input slice and model version used.

#### 11. **No Failure Mode for Decryption or “Zero‑Knwledge” Claim**
- **Flaw:** “AES‑GCM Zero‑Knowledge” is underspecified. If keys are stored on the same server or derived from user‑supplied passwords without hardware‑backed key management, it’s **at‑rest encryption, not zero‑knowledge**. Key compromise (through P0) decrypts all data. No error handling for decryption failures (corrupted file, wrong key).
- **Remedy:** Define KMS: keys must be held in a separate enclave (e.g., a Rust sidecar with memory locking) or derived from a mnemonic that the server never sees. Add explicit ` 400 Bad Request` responses for decryption failures with structured error codes.

#### 12. **Ollama Dependency with No Circuit Breaker**
- **Flaw:** Both embedding and LLM inference depend on local Ollama. A crash or hang of the Ollama daemon freezes the entire pipeline indefinitely (no timeout/retry, no fallback). The 180 s `AbortController` only wraps the HTTP call, but if Ollama accepts the connection and then stalls, Node.js may wait for the response body forever.
- **Remedy:** Wrap all Ollama calls with a **circuit breaker** (e.g., `opn`) and a hard **response‑level timeout** (socket‑level). When the circuit opens, return a cached fallback or a 503 with a clear status.

---

### **P3 – Low (Operational Hygiene)**

#### 13. **No Monitoring / Health Endpoints**
- **Flaw:** No mention of `/health`, `/ready`, or metrics (promQL). An SRE cannot determine if the pipeline is stuck or memory pressure is rising.
- **Remedy:** Expose a `/healthz` that verifies Ollama connectivity, vector cache size, and last successful ingestion timestamp. Emit metrics for ingestion latency, cache hit rate, and queue depth.

#### 14. **Hardcoded Host IP and Ports**
- **Flaw:** MCP config hardcodes `167.233.236.178` and `127.0.0.1:3000`. Any network re‑numbering breaks the client. Port conflicts on `:3000` or `:8081` are unhandled.
- **Remedy:** Use environment variables with sane defaults and a **configuration management layer** (e.g., `dotenv` + validation via `zod`). The MCP server should auto‑discover the API from a well‑known Unix socket or environment variable.

---

**Summary of Critical Actions:**  
1. Remove SSH‑as‑MCP root access – **P0**  
2. Persist vector store immediately – **P0**  
3. Add per‑project authentication and token binding – **P0**  
4. Secure ingestion gateway with mTLS – **P0**  
5. Fix concurrency (snapshot‑swap) and cache invalidation – **P1**  
6. Hardened input sanitization and circuit breakers – **P2**  
7. Operational health endpoints – **P3**  

The document fails to deliver an “air‑gapped” or “forensic‑grade” system in its current deployment; treating these gaps as urgent engineering debt.