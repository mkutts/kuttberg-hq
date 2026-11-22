begin;

create extension if not exists pgtap with schema extensions;
set local search_path = pg_catalog, public, extensions;
select plan(72);

-- Fixture setup and integrity checks run as the local database administrator.
insert into auth.users (id, email, is_anonymous) values
  ('10000000-0000-4000-8000-000000000001', 'member-one@example.invalid', false),
  ('10000000-0000-4000-8000-000000000002', 'member-two@example.invalid', false),
  ('10000000-0000-4000-8000-000000000003', 'unrelated@example.invalid', false),
  ('10000000-0000-4000-8000-000000000004', null, true);

select lives_ok($sql$select kuttberg_private.provision_household(
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')$sql$,
  'administrator can provision two existing identities');
select is(kuttberg_private.provision_household(
  '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'),
  (select id from public.households where slug = 'kuttberg-hq'), 'retry returns the same household with users in reverse order');
select is((select count(*) from public.profiles), 2::bigint, 'two profiles after retry');
select is((select count(*) from public.households), 1::bigint, 'one household after retry');
select is((select count(*) from public.household_members), 2::bigint, 'two household memberships after retry');
select is((select count(*) from public.workspaces), 7::bigint, 'seven workspaces after retry');
select is((select count(*) from public.workspace_members), 6::bigint, 'six shared workspace grants after retry');

select throws_ok($sql$select kuttberg_private.provision_household(
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004')$sql$,
  '22023', null, 'provisioning rejects an anonymous Auth identity');
select throws_ok($sql$select kuttberg_private.provision_household(
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003')$sql$,
  'P0001', null, 'provisioning rejects a different household member');
select throws_ok($sql$select kuttberg_private.provision_household(
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003')$sql$,
  '22023', null, 'provisioning rejects an owner outside the named household pair');

-- The conflicting retry reaches a later workspace after attempting to recreate an earlier one.
delete from public.workspaces where slug = 'jersey-city';
select throws_ok($sql$select kuttberg_private.provision_household(
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002')$sql$,
  'P0001', null, 'provisioning rejects a conflicting owner on retry');
select is_empty($sql$select id from public.workspaces where slug = 'jersey-city'$sql$,
  'the failed provisioning call rolls back an earlier insert');
select lives_ok($sql$select kuttberg_private.provision_household(
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')$sql$,
  'a matching retry restores the missing workspace and grants');

insert into public.households (id, slug, name)
  values ('20000000-0000-4000-8000-000000000001', 'other', 'Other test household');
insert into public.household_members (household_id, user_id)
  values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003');
insert into public.profiles (user_id) values ('10000000-0000-4000-8000-000000000003');

select ok(not has_schema_privilege('anon', 'kuttberg_private', 'USAGE')
  and not has_schema_privilege('authenticated', 'kuttberg_private', 'USAGE')
  and not has_schema_privilege('service_role', 'kuttberg_private', 'USAGE'),
  'API roles have no access to the private schema');
select ok(not has_function_privilege('anon', 'kuttberg_private.provision_household(uuid,uuid,uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'kuttberg_private.provision_household(uuid,uuid,uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'kuttberg_private.provision_household(uuid,uuid,uuid,uuid)', 'EXECUTE'),
  'API roles have no execution grant on the administrator routine');
select ok(not (select prosecdef from pg_proc where oid = 'kuttberg_private.provision_household(uuid,uuid,uuid,uuid)'::regprocedure),
  'administrator routine executes with caller privileges');

select throws_ok(command, expected_state, null, description)
from (values
  ($sql$ insert into public.profiles (user_id) values ('10000000-0000-4000-8000-000000000099') $sql$,
    '23503', 'profile identity must exist in Auth'),
  ($sql$ insert into public.household_members select * from public.household_members limit 1 $sql$,
    '23505', 'duplicate household membership rejected'),
  ($sql$ insert into public.workspace_members select * from public.workspace_members limit 1 $sql$,
    '23505', 'duplicate workspace membership rejected'),
  ($sql$ insert into public.workspace_members (workspace_id, household_id, user_id)
    select id, household_id, owner_user_id from public.workspaces where slug = 'nashville' $sql$,
    '23503', 'private workspace cannot have member grants even in admin SQL'),
  ($sql$ insert into public.workspace_members (workspace_id, household_id, user_id, privacy)
    select id, household_id, owner_user_id, 'private' from public.workspaces where slug = 'nashville' $sql$,
    '23514', 'workspace grant classification cannot be changed to private'),
  ($sql$ insert into public.workspace_members (workspace_id, household_id, user_id)
    select id, household_id, '10000000-0000-4000-8000-000000000003' from public.workspaces where slug = 'frances' $sql$,
    '23503', 'workspace member must belong to the workspace household'),
  ($sql$ insert into public.workspace_members (workspace_id, household_id, user_id)
    select id, '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003'
    from public.workspaces where slug = 'frances' $sql$,
    '23503', 'workspace grant cannot claim a different household'),
  ($sql$ update public.workspaces set owner_user_id = '10000000-0000-4000-8000-000000000003' where slug = 'nashville' $sql$,
    '23503', 'private workspace owner must belong to the same household'),
  ($sql$ update public.workspaces set privacy = 'unknown' where slug = 'nashville' $sql$,
    '23514', 'unknown privacy classification rejected'),
  ($sql$ update public.workspaces set workspace_type = 'unknown' where slug = 'nashville' $sql$,
    '23514', 'unknown workspace type rejected'),
  ($sql$ update public.workspaces set owner_user_id = null where slug = 'nashville' $sql$,
    '23514', 'private workspace must have an owner'),
  ($sql$ update public.workspaces set owner_user_id = '10000000-0000-4000-8000-000000000001' where slug = 'frances' $sql$,
    '23514', 'shared workspace must have no private owner'),
  ($sql$ update public.workspaces set privacy = 'shared', owner_user_id = null where slug = 'hoa' $sql$,
    '23514', 'HOA classification requires privacy'),
  ($sql$ insert into public.workspaces (household_id, slug, name, workspace_type, privacy, owner_user_id)
    select household_id, 'another-personal', 'Personal', 'personal', 'private', owner_user_id
    from public.workspaces where slug = 'personal-1' $sql$,
    '23505', 'one personal workspace per owner in a household')
) as negative(command, expected_state, description);

set local role anon;
set local "request.jwt.claim.sub" = '';
set local "request.jwt.claims" = '{}';

select throws_ok(format('select * from public.%I', table_name), '42501', null,
  'anonymous SELECT denied for ' || table_name)
from unnest(array['profiles', 'households', 'household_members', 'workspaces', 'workspace_members']) as tables(table_name);
select throws_ok($sql$insert into public.households (slug, name) values ('unauthorized', 'Unauthorized')$sql$,
  '42501', null, 'anonymous write denied');

set local role authenticated;
set local "request.jwt.claims" = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000001","is_anonymous":false}';

select ok(current_user = 'authenticated' and bool_and(row_security_active(table_name)),
  'RLS is active under the authenticated request role on all five tables')
from unnest(array['public.profiles', 'public.households', 'public.household_members',
  'public.workspaces', 'public.workspace_members']::regclass[]) as tables(table_name);
select results_eq('select user_id from public.profiles',
  $sql$values ('10000000-0000-4000-8000-000000000001'::uuid)$sql$, 'first member sees only own profile');
select results_eq('select slug from public.households', $sql$values ('kuttberg-hq'::text)$sql$,
  'first member sees only their household');
select results_eq('select user_id from public.household_members',
  $sql$values ('10000000-0000-4000-8000-000000000001'::uuid)$sql$, 'first member sees only own household membership');
select results_eq('select slug from public.workspaces order by slug',
  $sql$values ('frances'::text), ('jersey-city'), ('marthas-vineyard'), ('nashville'), ('personal-1')$sql$,
  'first member sees the three shared workspaces, Nashville, and their own personal workspace');
select is((select count(*) from public.workspace_members), 3::bigint, 'first member sees only their three workspace grants');

select throws_ok(command, '42501', null, description)
from (values
  ($sql$ insert into public.household_members (household_id, user_id)
    select id, '10000000-0000-4000-8000-000000000003' from public.households $sql$, 'cannot add a household member'),
  ($sql$ update public.household_members set user_id = '10000000-0000-4000-8000-000000000003' $sql$, 'cannot transfer a household membership'),
  ($sql$ delete from public.household_members $sql$, 'cannot delete a household membership'),
  ($sql$ insert into public.workspace_members (workspace_id, household_id, user_id)
    select id, household_id, '10000000-0000-4000-8000-000000000002' from public.workspaces where slug = 'nashville' $sql$, 'cannot share a private workspace'),
  ($sql$ update public.workspace_members set user_id = '10000000-0000-4000-8000-000000000003' $sql$, 'cannot transfer a workspace grant'),
  ($sql$ delete from public.workspace_members $sql$, 'cannot delete a workspace grant'),
  ($sql$ update public.workspaces set owner_user_id = '10000000-0000-4000-8000-000000000002' where slug = 'nashville' $sql$, 'owner cannot transfer private workspace ownership'),
  ($sql$ update public.workspaces set privacy = 'shared', owner_user_id = null where slug = 'nashville' $sql$, 'owner cannot make a private workspace shared'),
  ($sql$ update public.workspaces set household_id = '20000000-0000-4000-8000-000000000001' where slug = 'nashville' $sql$, 'cannot move a workspace to another household'),
  ($sql$ insert into public.workspaces (household_id, slug, name, workspace_type, privacy)
    select id, 'other-workspace', 'Other', 'location', 'shared' from public.households $sql$, 'cannot create a workspace'),
  ($sql$ delete from public.workspaces where slug = 'nashville' $sql$, 'owner cannot delete their workspace'),
  ($sql$ update public.profiles set user_id = '10000000-0000-4000-8000-000000000002' $sql$, 'cannot change profile identity'),
  ($sql$ update public.households set name = 'Unauthorized edit' $sql$, 'cannot edit the household'),
  ($sql$ select kuttberg_private.provision_household(
    '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002') $sql$,
    'authenticated role cannot invoke the administrator routine')
) as negative(command, description);

set local "request.jwt.claims" = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000002","is_anonymous":false,"user_metadata":{"sub":"10000000-0000-4000-8000-000000000001","user_id":"10000000-0000-4000-8000-000000000001"}}';
select results_eq('select slug from public.workspaces order by slug',
  $sql$values ('frances'::text), ('hoa'), ('jersey-city'), ('marthas-vineyard'), ('personal-2')$sql$,
  'second member sees the three shared workspaces, HOA, and their own personal workspace');
select results_eq('select user_id from public.profiles',
  $sql$values ('10000000-0000-4000-8000-000000000002'::uuid)$sql$, 'user-editable identity metadata cannot select the first member profile');
select is_empty($sql$select id from public.workspaces where owner_user_id = '10000000-0000-4000-8000-000000000001'$sql$,
  'explicitly filtering on another user ID cannot reveal their private workspaces');

set local "request.jwt.claims" = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000003","is_anonymous":false}';
select results_eq('select slug from public.households', $sql$values ('other'::text)$sql$, 'an unrelated identity cannot see the target household');
select is_empty('select * from public.workspaces', 'an unrelated identity sees no shared or private workspaces');
select is_empty('select * from public.workspace_members', 'an unrelated identity sees no workspace access grants');

-- Model a trusted anonymous sign-in claim for an otherwise fully enrolled subject.
set local "request.jwt.claims" = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000001","is_anonymous":true}';
select is_empty(format('select * from public.%I', table_name), 'anonymous sign-in sees no rows in ' || table_name)
from unnest(array['profiles', 'households', 'household_members', 'workspaces', 'workspace_members']) as tables(table_name);

reset role;
delete from public.workspace_members where user_id = '10000000-0000-4000-8000-000000000002'
  and workspace_id = (select id from public.workspaces where slug = 'frances');
set local role authenticated;
set local "request.jwt.claims" = '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000002","is_anonymous":false}';
select is_empty($sql$select id from public.workspaces where slug = 'frances'$sql$,
  'household membership alone cannot reveal a shared workspace with no explicit grant');
select throws_ok($sql$ insert into public.workspace_members (workspace_id, household_id, user_id)
  values ((select id from public.workspaces where slug = 'frances'),
    (select id from public.households where slug = 'kuttberg-hq'), auth.uid()) $sql$,
  '42501', null, 'a household member cannot restore their own missing shared workspace grant');
select results_eq('select slug from public.workspaces order by slug',
  $sql$values ('hoa'::text), ('jersey-city'), ('marthas-vineyard'), ('personal-2')$sql$,
  'removing one grant leaves other authorized access intact');

reset role;
select is((select count(*) from public.workspaces), 7::bigint, 'rejected operations leave the seven workspaces intact');
select is((select count(*) from public.workspace_members), 5::bigint, 'only the administrator removed a workspace grant');
select * from finish();
rollback;
