-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Projects Table
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  name text not null,
  description text,
  message_count integer default 0,
  participants text[] default '{}',
  date_range jsonb,
  analysis jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Messages Table
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  user_id uuid,
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
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_projects_updated_at
  before update on projects
  for each row
  execute function update_updated_at_column();

-- Row-level security for legacy project/message tables
alter table projects enable row level security;
alter table messages enable row level security;
alter table ai_conversations enable row level security;

drop policy if exists projects_owner_read on projects;
drop policy if exists projects_owner_insert on projects;
drop policy if exists projects_owner_update on projects;
drop policy if exists projects_owner_delete on projects;

drop policy if exists messages_owner_read on messages;
drop policy if exists messages_owner_insert on messages;
drop policy if exists messages_owner_update on messages;
drop policy if exists messages_owner_delete on messages;

drop policy if exists ai_conversations_owner_read on ai_conversations;
drop policy if exists ai_conversations_owner_insert on ai_conversations;
drop policy if exists ai_conversations_owner_update on ai_conversations;
drop policy if exists ai_conversations_owner_delete on ai_conversations;

create policy projects_owner_read
  on projects for select
  using (auth.uid() = user_id);

create policy projects_owner_insert
  on projects for insert
  with check (auth.uid() = user_id);

create policy projects_owner_update
  on projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy projects_owner_delete
  on projects for delete
  using (auth.uid() = user_id);

create policy messages_owner_read
  on messages for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from projects p
      where p.id = messages.project_id and p.user_id = auth.uid()
    )
  );

create policy messages_owner_insert
  on messages for insert
  with check (
    auth.uid() = user_id
    or exists (
      select 1 from projects p
      where p.id = messages.project_id and p.user_id = auth.uid()
    )
  );

create policy messages_owner_update
  on messages for update
  using (
    auth.uid() = user_id
    or exists (
      select 1 from projects p
      where p.id = messages.project_id and p.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    or exists (
      select 1 from projects p
      where p.id = messages.project_id and p.user_id = auth.uid()
    )
  );

create policy messages_owner_delete
  on messages for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1 from projects p
      where p.id = messages.project_id and p.user_id = auth.uid()
    )
  );

create policy ai_conversations_owner_read
  on ai_conversations for select
  using (
    exists (
      select 1 from projects p
      where p.id = ai_conversations.project_id and p.user_id = auth.uid()
    )
  );

create policy ai_conversations_owner_insert
  on ai_conversations for insert
  with check (
    exists (
      select 1 from projects p
      where p.id = ai_conversations.project_id and p.user_id = auth.uid()
    )
  );

create policy ai_conversations_owner_update
  on ai_conversations for update
  using (
    exists (
      select 1 from projects p
      where p.id = ai_conversations.project_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from projects p
      where p.id = ai_conversations.project_id and p.user_id = auth.uid()
    )
  );

create policy ai_conversations_owner_delete
  on ai_conversations for delete
  using (
    exists (
      select 1 from projects p
      where p.id = ai_conversations.project_id and p.user_id = auth.uid()
    )
  );
