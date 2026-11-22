begin;

create schema kuttberg_private;
revoke all on schema kuttberg_private from public, anon, authenticated, service_role;

create function kuttberg_private.provision_household(
  first_user_id uuid,
  second_user_id uuid,
  nashville_owner_id uuid,
  hoa_owner_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  target_household_id uuid;
  expected record;
begin
  if first_user_id is null or second_user_id is null or first_user_id = second_user_id
    or nashville_owner_id is null or nashville_owner_id not in (first_user_id, second_user_id)
    or hoa_owner_id is null or hoa_owner_id not in (first_user_id, second_user_id) then
    raise exception 'Provide two distinct user IDs and choose each private workspace owner from those users'
      using errcode = '22023';
  end if;

  if (select count(*) from auth.users
      where id in (first_user_id, second_user_id) and not is_anonymous) <> 2 then
    raise exception 'Both user IDs must already exist as permanent Auth users' using errcode = '22023';
  end if;

  insert into public.households (slug, name)
    values ('kuttberg-hq', 'Kuttberg Household')
    on conflict (slug) do nothing;

  -- Serialize retries for this household before comparing or inserting any child rows.
  select id into strict target_household_id
    from public.households where slug = 'kuttberg-hq' for update;

  if exists (
    select 1 from public.household_members
    where household_id = target_household_id and user_id not in (first_user_id, second_user_id)
  ) then
    raise exception 'The configured household already has a different member';
  end if;

  insert into public.profiles (user_id)
    values (first_user_id), (second_user_id)
    on conflict (user_id) do nothing;

  insert into public.household_members (household_id, user_id)
    values (target_household_id, first_user_id), (target_household_id, second_user_id)
    on conflict (household_id, user_id) do nothing;

  for expected in
    select * from (values
      ('jersey-city', 'Jersey City', 'location', 'shared', null::uuid),
      ('marthas-vineyard', 'Martha''s Vineyard', 'location', 'shared', null::uuid),
      ('frances', 'Frances', 'pet', 'shared', null::uuid),
      ('nashville', 'Nashville', 'location', 'private', nashville_owner_id),
      ('hoa', 'HOA', 'hoa', 'private', hoa_owner_id),
      ('personal-1', 'Personal', 'personal', 'private', least(first_user_id, second_user_id)),
      ('personal-2', 'Personal', 'personal', 'private', greatest(first_user_id, second_user_id))
    ) as workspace(slug, name, workspace_type, privacy, owner_user_id)
  loop
    insert into public.workspaces (household_id, slug, name, workspace_type, privacy, owner_user_id)
      values (target_household_id, expected.slug, expected.name, expected.workspace_type, expected.privacy, expected.owner_user_id)
      on conflict (household_id, slug) do nothing;

    if not exists (
      select 1 from public.workspaces as workspace
      where workspace.household_id = target_household_id and workspace.slug = expected.slug
        and workspace.workspace_type = expected.workspace_type and workspace.privacy = expected.privacy
        and workspace.owner_user_id is not distinct from expected.owner_user_id
      for update
    ) then
      raise exception 'Existing workspace % has a different type, privacy, or owner', expected.slug;
    end if;
  end loop;

  insert into public.workspace_members (workspace_id, household_id, user_id)
    select workspace.id, workspace.household_id, member.user_id
    from public.workspaces as workspace
    join public.household_members as member on member.household_id = workspace.household_id
    where workspace.household_id = target_household_id
      and workspace.slug in ('jersey-city', 'marthas-vineyard', 'frances')
    on conflict (workspace_id, user_id) do nothing;

  return target_household_id;
end;
$function$;

revoke all on function kuttberg_private.provision_household(uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

commit;
