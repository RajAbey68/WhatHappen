# Linear Issue: Hardening & Optimization for WhatsApp ZIP Ingestion Pipeline

**Title:** `[Pipeline] WhatsApp ZIP Uploader & Ingestion Hardening (Video Stripper, Race Condition & Decompression Guard)`

**Priority:** `High (P1)`  
**Labels:** `backend`, `frontend`, `reliability`, `security`

---

## Description

### Overview
A comprehensive JCode architectural review of the WhatsHapp ZIP ingestion pipeline (`components/file-upload.tsx`, `app/api/process-file/route.ts`, and `scripts/hermes-ingest-worker.ts`) identified several optimization, reliability, and security improvements needed for processing WhatsApp archive exports.

---

### Key Tasks & Acceptance Criteria

#### 1. Wire up `stripVideosFromZip` & Clean Up Dead Code
- [x] In `components/file-upload.tsx`, invoke `stripVideosFromZip(currentFile)` prior to upload / decompression to filter out heavy `.mp4/.mov` files from reaching serverless memory.
- [x] Remove unused / orphaned `uploadViaGCS` function (lines 693–791) to eliminate redundant code paths.

#### 2. Prevent Ingest Race Condition (API vs Hermes Worker)
- [x] In `app/api/process-file/route.ts` and `scripts/hermes-ingest-worker.ts`, add atomic session claiming using conditional update / row locking:
  ```sql
  UPDATE sessions 
  SET processing_status = 'processing', processing_error = 'Claimed by worker'
  WHERE id = :sessionId AND processing_status = 'pending'
  RETURNING id;
  ```
- [x] Ensure only one worker processes the archive.

#### 3. Serverless ZIP Decompression Bomb Guard
- [x] In `app/api/process-file/route.ts`, add cumulative decompressed bytes checking (`MAX_TOTAL_DECOMPRESSED = 300MB`) and entry count caps (`MAX_ZIP_ENTRIES = 1000`) before calling `entry.getData()` in `AdmZip`.

#### 4. Media & Transcription Association
- [x] Cross-reference OCR and voice note transcriptions with `<attached: file_name>` tags in the parsed WhatsApp message log to attribute media text to specific senders.
- [x] Emit detailed progress updates (`OCR: X/Y`, `Transcribing: X/Y`) to `sessions.processing_error` / status polling.

---

### Relevant Files
- `components/file-upload.tsx`
- `app/api/process-file/route.ts`
- `scripts/hermes-ingest-worker.ts`
- `lib/processWhatsapp.ts`
