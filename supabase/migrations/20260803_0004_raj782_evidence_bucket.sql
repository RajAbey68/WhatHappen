-- RAJ-782 (four-eyes finding #7) — create the evidence bucket in code.
--
-- APPLIED TO PRODUCTION 2026-08-03. Idempotent.
--
-- WHY THIS IS A MIGRATION AND NOT A DASHBOARD STEP: two source comments said
-- "BUCKET MUST BE PRIVATE" and nothing enforced it. Whoever provisions the
-- bucket next — a new environment, a rebuild, a colleague — can leave it public
-- with one click, and every uploaded evidence file becomes anonymously readable
-- by URL, bypassing the whole RAJ-780 authorization effort. A comment is not a
-- control. The ON CONFLICT clause also FORCES public = false on an existing
-- bucket, so re-running this repairs a bucket someone opened up.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence',
  'evidence',
  false,
  524288000, -- 500 MB, matching MAX_FILE_BYTES in app/api/upload-url/route.ts
  array[
    'application/zip',
    'application/x-zip-compressed',
    'text/plain',
    'text/csv',
    'application/json',
    'application/pdf',
    'application/vnd.ms-outlook',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- NOTE: the MIME list here is a coarse gate only — it reflects the
-- Content-Type the client claims, not the bytes. Real content validation is a
-- magic-byte check performed in app/api/process-file/route.ts the first time
-- the object is read, using detectType() from @asimov/ingest. Rejected objects
-- are deleted from this bucket rather than left sitting in it.
