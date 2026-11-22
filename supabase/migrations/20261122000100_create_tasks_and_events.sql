begin;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  created_by uuid not null references auth.users (id),
  title text not null constraint tasks_title_valid check (length(title) <= 255 and btrim(title) <> ''),
  description text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status text not null default 'active' check (status in ('active', 'completed')),
  due_date date,
  is_inbox boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_workspace_id_idx on public.tasks (workspace_id);

create table public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id),
  event_type text not null check (event_type in ('completed', 'reopened')),
  actor_user_id uuid not null references auth.users (id),
  occurred_at timestamptz not null default now()
);

create index task_events_task_id_idx on public.task_events (task_id);

alter table public.tasks enable row level security;
alter table public.task_events enable row level security;

revoke all on public.tasks, public.task_events from public, anon, authenticated, service_role;
grant select, insert, update on public.tasks to authenticated;
grant select on public.task_events to authenticated;

-- The workspace SELECT policy is the existing authorization boundary: owners of
-- private workspaces and explicitly granted members of shared workspaces only.
create policy tasks_read_workspace on public.tasks for select to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and exists (select 1 from public.workspaces w where w.id = tasks.workspace_id)
  );
create policy tasks_insert_workspace on public.tasks for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and exists (select 1 from public.workspaces w where w.id = tasks.workspace_id)
  );
create policy tasks_update_workspace on public.tasks for update to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and exists (select 1 from public.workspaces w where w.id = tasks.workspace_id)
  )
  with check (
    (select auth.uid()) is not null
    and (select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and exists (select 1 from public.workspaces w where w.id = tasks.workspace_id)
  );
create policy task_events_read_workspace on public.task_events for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_events.task_id));

-- Trigger functions run with table-owner rights to write the otherwise read-only
-- history table. They have no client-facing EXECUTE grant and never take actor
-- identity from row data. Every real status change and its event share one SQL
-- statement/transaction, including direct status updates and concurrent updates.
create function kuttberg_private.tasks_before_write() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $function$
begin
  if auth.uid() is null or (auth.jwt() ->> 'is_anonymous') = 'true' then
    raise exception 'A permanent authenticated user is required' using errcode = '42501';
  end if;

  if TG_OP = 'INSERT' then
    if NEW.created_by is distinct from auth.uid() or NEW.status <> 'active' then
      raise exception 'Invalid task creator or initial status' using errcode = '42501';
    end if;
    NEW.created_at := now();
  else
    if NEW.id is distinct from OLD.id or NEW.created_by is distinct from OLD.created_by
      or NEW.created_at is distinct from OLD.created_at then
      raise exception 'Task identity and creation time are immutable' using errcode = '42501';
    end if;
  end if;
  NEW.updated_at := now();
  return NEW;
end;
$function$;

create function kuttberg_private.record_task_transition() returns trigger
language plpgsql security definer set search_path = pg_catalog
as $function$
begin
  if NEW.status is distinct from OLD.status then
    insert into public.task_events (task_id, event_type, actor_user_id)
    values (NEW.id, case when NEW.status = 'completed' then 'completed' else 'reopened' end, auth.uid());
  end if;
  return null;
end;
$function$;

revoke all on function kuttberg_private.tasks_before_write(),
  kuttberg_private.record_task_transition() from public, anon, authenticated, service_role;

create trigger tasks_before_write before insert or update on public.tasks
  for each row execute function kuttberg_private.tasks_before_write();
create trigger tasks_record_transition after update of status on public.tasks
  for each row execute function kuttberg_private.record_task_transition();

commit;
