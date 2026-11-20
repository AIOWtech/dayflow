-- Dayflow execution and Google connector schema
alter table public.tasks
  add column if not exists internal_plan jsonb not null default '{}'::jsonb,
  add column if not exists approval jsonb not null default '{"required":false,"approved":false,"reason":""}'::jsonb;

create index if not exists tasks_workspace_updated_idx
  on public.tasks(workspace_id, updated_at desc);
create index if not exists task_events_task_created_idx
  on public.task_events(task_id, created_at desc);

create table if not exists public.google_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists google_oauth_states_expiry_idx
  on public.google_oauth_states(expires_at);

create table if not exists public.google_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_email text not null,
  encrypted_refresh_token text not null,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_oauth_states enable row level security;
alter table public.google_connections enable row level security;
-- These tables are accessed only by the server using the Supabase service-role key.
-- No client-facing policies are intentionally defined.
