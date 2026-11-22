begin;
create extension if not exists pgtap with schema extensions;
set local search_path = pg_catalog, public, extensions;
select plan(56);

insert into auth.users (id, email, is_anonymous) values
  ('30000000-0000-4000-8000-000000000001', 'matt-fixture@example.invalid', false),
  ('30000000-0000-4000-8000-000000000002', 'chana-fixture@example.invalid', false),
  ('30000000-0000-4000-8000-000000000003', 'outsider-fixture@example.invalid', false);
select lives_ok($sql$select kuttberg_private.provision_household(
  '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002')$sql$, 'provision fixture');
do $fixture$ begin
  perform set_config('test.matt_workspace', (select id::text from public.workspaces where slug = 'personal-1'), true);
  perform set_config('test.shared_workspace', (select id::text from public.workspaces where slug = 'frances'), true);
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000001","is_anonymous":false}', true);
end $fixture$;
select throws_ok($sql$insert into public.tasks (workspace_id, created_by, title)
  values ('50000000-0000-4000-8000-000000000001', auth.uid(), 'Invalid workspace')$sql$,
  '23503', null, 'workspace foreign key rejects missing workspace');

set local role authenticated;
set local "request.jwt.claims" = '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000001","is_anonymous":false}';
select ok(row_security_active('public.tasks'::regclass) and row_security_active('public.task_events'::regclass), 'RLS active');
select lives_ok($sql$insert into public.tasks (id, workspace_id, created_by, title, due_date)
  select '40000000-0000-4000-8000-000000000001', id, auth.uid(), 'Personal inbox', date '2026-12-01'
  from public.workspaces where slug = 'personal-1'$sql$, 'Matt creates personal task');
select results_eq($sql$select priority, status, due_date, is_inbox, archived_at is null
  from public.tasks where id = '40000000-0000-4000-8000-000000000001'$sql$,
  $sql$values ('normal'::text, 'active'::text, date '2026-12-01', true, true)$sql$, 'defaults and date');
select ok((select created_at = updated_at from public.tasks where id = '40000000-0000-4000-8000-000000000001'), 'timestamps generated together');
select lives_ok($sql$insert into public.tasks (id, workspace_id, created_by, title)
  select '40000000-0000-4000-8000-000000000002', id, auth.uid(), 'Shared'
  from public.workspaces where slug = 'frances'$sql$, 'shared insertion');
select is((select count(*) from public.tasks), 2::bigint, 'personal and shared tasks visible');
select throws_ok($sql$insert into public.tasks (workspace_id, created_by, title)
  select id, auth.uid(), '   ' from public.workspaces where slug = 'frances'$sql$, '23514', null, 'blank title rejected');
select throws_ok($sql$insert into public.tasks (workspace_id, created_by, title)
  select id, auth.uid(), repeat('x', 256) from public.workspaces where slug = 'frances'$sql$, '23514', null, 'long title rejected');
select throws_ok($sql$insert into public.tasks (workspace_id, created_by, title)
  values ('50000000-0000-4000-8000-000000000001', auth.uid(), 'Bad FK')$sql$, '42501', null, 'unknown workspace denied by RLS');
select throws_ok($sql$insert into public.tasks (workspace_id, created_by, title)
  select id, '30000000-0000-4000-8000-000000000002', 'Forged creator'
  from public.workspaces where slug = 'frances'$sql$, '42501', null, 'creator spoof denied');
select throws_ok($sql$insert into public.tasks (workspace_id, created_by, title, status)
  select id, auth.uid(), 'Initially completed', 'completed'
  from public.workspaces where slug = 'frances'$sql$, '42501', null, 'initial completion cannot skip history');
select throws_ok($sql$insert into public.tasks (workspace_id, created_by, title, priority)
  select id, auth.uid(), 'Invalid priority', 'urgent'
  from public.workspaces where slug = 'frances'$sql$, '23514', null, 'priority constraint');
select throws_ok($sql$update public.tasks set status = 'pending'
  where id = '40000000-0000-4000-8000-000000000001'$sql$, '23514', null, 'status constraint');
select lives_ok($sql$insert into public.tasks (workspace_id, created_by, title)
  select id, auth.uid(), 'No due date' from public.workspaces where slug = 'frances'$sql$, 'nullable due date');
select ok((select due_date is null from public.tasks where title = 'No due date'), 'due date defaults null');
select throws_ok($sql$update public.tasks set created_by = '30000000-0000-4000-8000-000000000002'
  where id = '40000000-0000-4000-8000-000000000001'$sql$, '42501', null, 'creator immutable');
select throws_ok($sql$update public.tasks set created_at = '2000-01-01'
  where id = '40000000-0000-4000-8000-000000000001'$sql$, '42501', null, 'creation time immutable');
select lives_ok($sql$update public.tasks set updated_at = '2000-01-01', title = 'Edited'
  where id = '40000000-0000-4000-8000-000000000001'$sql$, 'edit allowed');
select ok((select updated_at > '2000-01-01'::timestamptz from public.tasks
  where id = '40000000-0000-4000-8000-000000000001'), 'updated_at enforced');
select throws_ok($sql$update public.tasks set id = gen_random_uuid()
  where id = '40000000-0000-4000-8000-000000000001'$sql$, '42501', null, 'task ID immutable');
select lives_ok($sql$update public.tasks set status = 'completed'
  where id = '40000000-0000-4000-8000-000000000001'$sql$, 'complete directly with trigger');
select is((select count(*) from public.task_events where task_id = '40000000-0000-4000-8000-000000000001'), 1::bigint, 'one completion event');
select results_eq($sql$select event_type, actor_user_id from public.task_events
  where task_id = '40000000-0000-4000-8000-000000000001'$sql$,
  $sql$values ('completed'::text, '30000000-0000-4000-8000-000000000001'::uuid)$sql$, 'actor from JWT');
select ok((select occurred_at is not null from public.task_events
  where task_id = '40000000-0000-4000-8000-000000000001'), 'event time generated by database');
select lives_ok($sql$update public.tasks set status = 'completed'
  where id = '40000000-0000-4000-8000-000000000001'$sql$, 'repeat completion');
select is((select count(*) from public.task_events where task_id = '40000000-0000-4000-8000-000000000001'), 1::bigint, 'no duplicate completion');
select lives_ok($sql$update public.tasks set status = 'active'
  where id = '40000000-0000-4000-8000-000000000001'$sql$, 'reopen');
select is((select count(*) from public.task_events where task_id = '40000000-0000-4000-8000-000000000001'), 2::bigint, 'one reopen event');
select lives_ok($sql$update public.tasks set status = 'active'
  where id = '40000000-0000-4000-8000-000000000001'$sql$, 'repeat reopen');
select is((select count(*) from public.task_events where task_id = '40000000-0000-4000-8000-000000000001'), 2::bigint, 'no duplicate reopen');
select throws_ok($sql$insert into public.task_events (task_id, event_type, actor_user_id)
  values ('40000000-0000-4000-8000-000000000001', 'completed', auth.uid())$sql$, '42501', null, 'event forgery denied');
select throws_ok($sql$insert into public.task_events (task_id, event_type, actor_user_id)
  values ('40000000-0000-4000-8000-000000000001', 'completed',
    '30000000-0000-4000-8000-000000000002')$sql$, '42501', null, 'actor spoof denied');
select throws_ok($sql$update public.task_events set actor_user_id = auth.uid()$sql$, '42501', null, 'event mutation denied');
select throws_ok($sql$delete from public.task_events$sql$, '42501', null, 'event deletion denied');
select throws_ok($sql$delete from public.tasks$sql$, '42501', null, 'task deletion denied');
select lives_ok($sql$update public.tasks set archived_at = now()
  where id = '40000000-0000-4000-8000-000000000001'$sql$, 'archive');
select is((select count(*) from public.task_events where task_id = '40000000-0000-4000-8000-000000000001'), 2::bigint, 'history survives archive');
select lives_ok($sql$update public.tasks set archived_at = null
  where id = '40000000-0000-4000-8000-000000000001'$sql$, 'restore');
select is((select count(*) from public.task_events where task_id = '40000000-0000-4000-8000-000000000001'), 2::bigint, 'history survives restore');

set local "request.jwt.claims" = '{"role":"authenticated","sub":"30000000-0000-4000-8000-000000000002","is_anonymous":false}';
select is((select count(*) from public.tasks where id = '40000000-0000-4000-8000-000000000001'), 0::bigint, 'Chana cannot read Matt private task');
select is((select count(*) from public.task_events where task_id = '40000000-0000-4000-8000-000000000001'), 0::bigint, 'Chana cannot read private history');
select is((select count(*) from public.tasks where id = '40000000-0000-4000-8000-000000000002'), 1::bigint, 'Chana reads shared task');
select lives_ok($sql$insert into public.tasks (workspace_id, created_by, title)
  select id, auth.uid(), 'Chana personal' from public.workspaces where slug = 'personal-2'$sql$, 'Chana personal creation');
select throws_ok($sql$insert into public.tasks (workspace_id, created_by, title)
  values (current_setting('test.matt_workspace')::uuid, auth.uid(), 'Intrusion')$sql$,
  '42501', null, 'private insertion denied');
select results_eq($sql$with changed as (update public.tasks set title = 'Intrusion'
  where id = '40000000-0000-4000-8000-000000000001' returning id)
  select count(*) from changed$sql$, $sql$values (0::bigint)$sql$, 'private update touches no rows');
select results_eq($sql$with changed as (update public.tasks set status = 'completed'
  where id = '40000000-0000-4000-8000-000000000001' returning id)
  select count(*) from changed$sql$, $sql$values (0::bigint)$sql$, 'unauthorized transition touches no rows');
select throws_ok($sql$update public.tasks set workspace_id = current_setting('test.matt_workspace')::uuid
  where id = '40000000-0000-4000-8000-000000000002'$sql$, '42501', null, 'shared task cannot move into private workspace');

reset role;
delete from public.workspace_members where workspace_id = current_setting('test.shared_workspace')::uuid
  and user_id = '30000000-0000-4000-8000-000000000002';
set local role authenticated;
select is((select count(*) from public.tasks where id = '40000000-0000-4000-8000-000000000002'), 0::bigint, 'revoked shared grant removes task read');
select is((select count(*) from public.task_events where task_id = '40000000-0000-4000-8000-000000000002'), 0::bigint, 'revoked grant removes history read');
select results_eq($sql$with changed as (update public.tasks set title = 'After revocation'
  where id = '40000000-0000-4000-8000-000000000002' returning id)
  select count(*) from changed$sql$, $sql$values (0::bigint)$sql$, 'revoked grant removes write access');
select throws_ok($sql$insert into public.tasks (workspace_id, created_by, title)
  values (current_setting('test.shared_workspace')::uuid, auth.uid(), 'After revocation')$sql$,
  '42501', null, 'revoked grant removes create access');

set local role anon;
set local "request.jwt.claims" = '{}';
select throws_ok($sql$select * from public.tasks$sql$, '42501', null, 'anonymous tasks denied');
select throws_ok($sql$select * from public.task_events$sql$, '42501', null, 'anonymous history denied');
select throws_ok($sql$insert into public.tasks (workspace_id, created_by, title)
  values (current_setting('test.shared_workspace')::uuid,
    '30000000-0000-4000-8000-000000000001', 'Anonymous')$sql$, '42501', null, 'anonymous insertion denied');

reset role;
select * from finish();
rollback;
