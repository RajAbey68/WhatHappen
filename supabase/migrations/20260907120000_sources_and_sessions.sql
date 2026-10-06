-- Create sources table
create table if not exists sources (
    id uuid primary key default gen_random_uuid(),
    project_id uuid references projects(id) on delete cascade not null,
    remote_jid text not null,
    name text,
    type text not null check (type in ('group', 'dm')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(project_id, remote_jid)
);

-- RLS policies
alter table sources enable row level security;

drop policy if exists "users_own_sources" on sources;
create policy "users_own_sources"
  on sources for all to authenticated
  using (project_id in (select id from projects where auth.uid() = user_id));

-- Expand messages table
alter table messages add column if not exists source_id uuid references sources(id) on delete set null;
alter table messages add column if not exists receiving_session_id text;
alter table messages add column if not exists remote_jid text;
