-- Dayflow product upgrades: notifications, onboarding, and team invitations.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  event_id uuid references public.task_events(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  message text not null default '',
  kind text not null default 'info' check (kind in ('info','success','warning','error')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, created_at desc) where read_at is null;
alter table public.notifications enable row level security;
drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications" on public.notifications
for select to authenticated using (user_id = auth.uid());
drop policy if exists "users update own notifications" on public.notifications;
create policy "users update own notifications" on public.notifications
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.dayflow_onboarding (
  user_id uuid primary key references auth.users(id) on delete cascade,
  completed_at timestamptz,
  dismissed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.dayflow_onboarding enable row level security;
drop policy if exists "users manage own onboarding" on public.dayflow_onboarding;
create policy "users manage own onboarding" on public.dayflow_onboarding
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invited_email text not null,
  role text not null default 'member' check (role in ('admin','member')),
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists workspace_invitations_workspace_idx
  on public.workspace_invitations(workspace_id, created_at desc);
alter table public.workspace_invitations enable row level security;
-- Invitation reads/writes are performed only by the trusted server using the service role.

create or replace function public.dayflow_notify_task_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_row public.tasks%rowtype;
  notification_title text;
  notification_kind text;
begin
  select * into task_row from public.tasks where id = new.task_id;
  if not found then return new; end if;

  notification_title := case
    when new.event_type = 'error' then 'Task needs attention'
    when new.event_type = 'success' then 'Task update'
    else 'Task activity'
  end;
  notification_kind := case
    when new.event_type in ('error','success','warning') then new.event_type
    else 'info'
  end;

  insert into public.notifications(workspace_id,user_id,task_id,event_id,title,message,kind)
  select task_row.workspace_id, m.user_id, task_row.id, new.id,
    notification_title, left(new.message,500), notification_kind
  from public.workspace_members m
  where m.workspace_id = task_row.workspace_id;

  return new;
end;
$$;
revoke all on function public.dayflow_notify_task_event() from public;
drop trigger if exists dayflow_task_event_notification on public.task_events;
create trigger dayflow_task_event_notification
after insert on public.task_events
for each row execute function public.dayflow_notify_task_event();
