-- Dayflow workspace intelligence: persistent assistant memory and reusable workflows.
create table if not exists public.workspace_memories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'preference' check (category in ('preference','instruction','project','decision')),
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workspace_memories_user_idx on public.workspace_memories(user_id, updated_at desc);
alter table public.workspace_memories enable row level security;
drop policy if exists "users manage own workspace memories" on public.workspace_memories;
create policy "users manage own workspace memories" on public.workspace_memories
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '',
  instruction text not null check (char_length(instruction) between 8 and 4000),
  mode text not null default 'auto' check (mode in ('auto','plan','research','document','email','browser')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workflow_templates_workspace_idx on public.workflow_templates(workspace_id, updated_at desc);
alter table public.workflow_templates enable row level security;
drop policy if exists "users manage own workflow templates" on public.workflow_templates;
create policy "users manage own workflow templates" on public.workflow_templates
for all to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
