# DESIGN — WhatHappen as the Common WhatsApp-Zip Microservice

**Status:** Design draft for adversarial review (Qwen latest + GLM 5.2), AKOS method.
**Date:** 2026-08-07 · **Owner:** Rajiv Abeysinghe
**Companion:** `../second-brain/projects/whathappen-common-microservice-design.md`

---

## 0. THESIS — THE SHARING BOUNDARY

> **We share ONLY common code microservices. Nothing else is shared.**

This repo's backend pipeline (`upload-url` → GCS → `process-file` → OCR → normalized
commit) is consumed as a **shared microservice** by multiple product apps (BookLets,
the WhatHappen UI, future consumers). What is shared is the *code/capability*. What is
**NOT** shared: consumer databases, user identities, credentials, ledgers, or chat
contents across consumers. Each consumer lands data in its own isolated store.

---

## 1. Mental model

```
BookLets (UI)          WhatHappen (UI)         [future consumers]
     │                      │
     └─────────┬────────────┘
               ▼
   COMMON TESTED MICROSERVICE  (this repo's backend pipeline, reused as shared code)
   upload-url → GCS → process-file → OCR(ocr-microservice) → normalized commit
               │
               ▼
   Per-consumer ISOLATED store  (tagged source_app)
```

Neither consumer calls the other. Both authenticate to this service and receive
processing scoped to their own data.

---

## 2. Existing endpoints (tested — do NOT rebuild)

| Endpoint | Behaviour |
|---|---|
| `app/api/upload-url` | Mints `sessions` row + signed GCS URL. 500 MB cap. Accepts `.txt/.zip/.pst/.csv/.json`. `source_app` isolates callers. Requires Supabase auth. |
| `app/api/process-file` | Downloads from GCS, extracts WhatsApp `.zip` (AdmZip, ZIP-bomb guarded 300 MB), parses chat, OCRs images, writes `messages_meta`, flips `sessions.processing_status`. |

Schema `001_whathappen_schema.sql`: `sessions`, `messages_meta` (year-partitioned),
`message_stats`, `llm_usage`, per-user RLS, read-only role + `execute_safe_query` guard.

OCR slice: `RajAbey68/ocr-microservice` (`POST /ocr`, `/ocr/pdf`), Gemini Flash Vision,
**zero DB credentials**.

---

## 3. Tenancy & isolation (the "nothing else" rule)

- Consumer identified by `source_app`; lands data in its **own** Supabase project / isolated schema. No cross-consumer commingling.
- This service holds only its OWN service-role key; never a consumer's credentials (architecture canon §6).
- RLS keyed on consumer identity; `FORCE ROW LEVEL SECURITY` on every sensitive table.

---

## 4. Delivery — thin client, no new service

Reuse via a thin client (`whatsapp-uploader`):
`auth → POST /api/upload-url → PUT to signed GCS URL → POST /api/process-file?sessionId= → poll sessions.processing_status`.
No parallel service; the earlier `chat-archive` scaffold is abandoned.

---

## 5. AKOS — TDD + 4EYES

- TDD RED: contract tests vs real endpoints (401 without JWT; zip→session tagged; 415 wrong ext; process-file→messages_meta>0; OCR returns text; ZIP-bomb rejected).
- 4EYES: adversarial review by **Qwen (latest) + GLM 5.2**, non-Anthropic pair. Live run only on owner sign-off.

---

## 6. Open questions

1. Target store: this instance vs per-consumer project?
2. `source_app` for owner rows (default `raj-personal`).
3. Auth: Supabase JWT from env vs service token.
