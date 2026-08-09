-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Projects Table
-- RAJ-780: `user_id` was missing from this file even though it exists in the live
-- database and is the column the `users_own_projects` RLS policy keys on. A
-- rebuild from this file alone produced a schema with no ownership concept and no
-- row-level security at all. See
-- supabase/migrations/20260803_0001_raj780_authz_hardening.sql for the
-- idempotent migration that reconciles an existing database.
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  description text,
  message_count integer default 0,
  participants text[] default '{}',
  date_range jsonb,
  analysis jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_projects_user on projects(user_id);

-- Messages Table
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  sender text not null,
  message text not null,
  timestamp text,
  processed boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- AI Conversations Table
create table if not exists ai_conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Auto-update updated_at trigger for projects
-- RAJ-780: search_path pinned (Supabase linter 0011_function_search_path_mutable).
create or replace function update_updated_at_column()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_projects_updated_at on projects;
create trigger update_projects_updated_at
  before update on projects
  for each row
  execute function update_updated_at_column();

-- ─── ROW-LEVEL SECURITY ──────────────────────────────────────────────────────
-- RAJ-780: this file previously enabled no RLS whatsoever. The anon key is public
-- (NEXT_PUBLIC_SUPABASE_ANON_KEY, and it is committed in cloudbuild.yaml), so
-- without these policies every project, message and conversation is readable
-- directly over PostgREST by anyone who loads the site.
--
-- NOTE: the application's own API routes use the service-role key, which bypasses
-- RLS entirely. These policies protect direct PostgREST access only — the API
-- path is enforced in lib/api-auth.ts (`requireProjectAccess`).
alter table projects         enable row level security;
alter table messages         enable row level security;
alter table ai_conversations enable row level security;

drop policy if exists "users_own_projects"      on projects;
drop policy if exists "users_own_messages"      on messages;
drop policy if exists "users_own_conversations" on ai_conversations;

create policy "users_own_projects"
  on projects for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users_own_messages"
  on messages for all to authenticated
  using (project_id in (select id from projects where auth.uid() = user_id));

create policy "users_own_conversations"
  on ai_conversations for all to authenticated
  using (project_id in (select id from projects where auth.uid() = user_id));
