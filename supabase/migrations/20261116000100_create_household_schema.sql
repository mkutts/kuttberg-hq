begin;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug <> ''),
  name text not null check (btrim(name) <> '')
);

create table public.household_members (
  household_id uuid not null references public.households (id),
  user_id uuid not null references auth.users (id),
  primary key (household_id, user_id)
);

create index household_members_user_id_idx on public.household_members (user_id);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id),
  slug text not null check (slug <> ''),
  name text not null check (btrim(name) <> ''),
  workspace_type text not null check (workspace_type in ('location', 'pet', 'hoa', 'personal')),
  privacy text not null check (privacy in ('shared', 'private')),
  owner_user_id uuid,
  unique (household_id, slug),
  unique (id, household_id, privacy),
  constraint workspaces_privacy_requires_owner check ((privacy = 'private') = (owner_user_id is not null)),
  constraint workspaces_private_types check (workspace_type not in ('hoa', 'personal') or privacy = 'private'),
  foreign key (household_id, owner_user_id) references public.household_members (household_id, user_id)
);

create index workspaces_owner_idx on public.workspaces (owner_user_id, household_id)
  where owner_user_id is not null;
create unique index workspaces_one_personal_per_owner_idx on public.workspaces (household_id, owner_user_id)
  where workspace_type = 'personal';

create table public.workspace_members (
  workspace_id uuid not null,
  household_id uuid not null,
  user_id uuid not null,
  privacy text not null default 'shared' check (privacy = 'shared'),
  primary key (workspace_id, user_id),
  -- Carry the scope and classification into the foreign key so even admin writes cannot grant membership to a private workspace.
  foreign key (workspace_id, household_id, privacy) references public.workspaces (id, household_id, privacy) on delete cascade,
  foreign key (household_id, user_id) references public.household_members (household_id, user_id) on delete cascade
);

create index workspace_members_user_id_idx on public.workspace_members (user_id, household_id);

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

revoke all on table public.profiles, public.households, public.household_members,
  public.workspaces, public.workspace_members from public, anon, authenticated, service_role;
grant select on table public.profiles, public.households, public.household_members,
  public.workspaces, public.workspace_members to authenticated;

create policy profiles_read_self on public.profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    and (select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
  );

create policy household_members_read_self on public.household_members for select to authenticated
  using (
    user_id = (select auth.uid())
    and (select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
  );

create policy workspace_members_read_self on public.workspace_members for select to authenticated
  using (
    user_id = (select auth.uid())
    and (select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
  );

create policy households_read_member on public.households for select to authenticated
  using (exists (
    select 1 from public.household_members as member
    where member.household_id = households.id and member.user_id = (select auth.uid())
  ));

create policy workspaces_read_owner_or_member on public.workspaces for select to authenticated
  using (
    (select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
    and (
      (privacy = 'private' and owner_user_id = (select auth.uid()))
      or (privacy = 'shared' and exists (
        select 1 from public.workspace_members as member
        where member.workspace_id = workspaces.id and member.user_id = (select auth.uid())
      ))
    )
  );

commit;
