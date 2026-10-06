-- Live Baileys sync buffer (Option C1).
-- The whatsapp-live-sync worker (PM2, Hermes-Dev) writes every normalized inbound
-- message here. The dashboard "Sync" button (POST /api/whatsapp-sync) flushes
-- buffered rows for one chat into messages via idempotent upsert.
-- No message content is duplicated: buffer rows carry message_id = wa_<baileys-id>.

create table if not exists whatsapp_live_buffer (
  id uuid primary key default gen_random_uuid(),
  message_id text not null unique,
  session_id text not null,
  remote_jid text not null,
  sender_jid text not null,
  sender_name text not null,
  text text not null,
  occurred_at timestamptz not null,
  is_group boolean not null default false,
  group_name text,
  created_at timestamptz not null default now()
);
create index if not exists idx_live_buffer_remote_jid on whatsapp_live_buffer (remote_jid, occurred_at desc);
create index if not exists idx_live_buffer_created on whatsapp_live_buffer (created_at desc);

create table if not exists whatsapp_sync_state (
  session_id text primary key,
  phone text,
  status text not null default 'disconnected',
  last_seen_at timestamptz,
  groups jsonb not null default '[]'::jsonb,
  locked_out_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table whatsapp_live_buffer enable row level security;
alter table whatsapp_sync_state enable row level security;
-- Service-role only (worker + API routes use the service key, which bypasses RLS).
-- No authenticated-user policies: direct PostgREST access stays denied.
