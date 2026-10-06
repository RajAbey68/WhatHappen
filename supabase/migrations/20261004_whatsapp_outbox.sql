-- Outbound task-sending on the sync number (outbox pattern, mirrors media_jobs).
-- Dashboard / API queue rows; the live-sync worker sends via its open Baileys
-- session. Single worker instance (PM2 instances: 1), so claim-by-update is safe.

create table if not exists whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  to_jid text not null,
  text text not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts int not null default 0,
  max_attempts int not null default 3,
  next_retry_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists idx_outbox_due on whatsapp_outbox (status, next_retry_at) where status = 'pending';
create index if not exists idx_outbox_project on whatsapp_outbox (project_id, created_at desc);

alter table whatsapp_outbox enable row level security;
-- Service-role only (worker + API routes use the service key, which bypasses RLS).
