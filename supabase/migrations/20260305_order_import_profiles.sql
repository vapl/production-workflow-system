create table if not exists public.order_import_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_name text not null,
  target text not null check (target in ('items', 'bom')),
  document_type text,
  file_extensions text[] not null default array[]::text[],
  header_aliases jsonb not null default '{}'::jsonb,
  block_rules jsonb not null default '{}'::jsonb,
  default_mapping jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_import_profiles_tenant_idx
  on public.order_import_profiles(tenant_id);
create index if not exists order_import_profiles_target_idx
  on public.order_import_profiles(target);
create unique index if not exists order_import_profiles_default_per_target_uidx
  on public.order_import_profiles(tenant_id, target)
  where is_default is true;

create table if not exists public.order_import_profile_versions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.order_import_profiles(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  version_no integer not null,
  change_note text,
  header_aliases jsonb not null default '{}'::jsonb,
  block_rules jsonb not null default '{}'::jsonb,
  default_mapping jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists order_import_profile_versions_unique_version
  on public.order_import_profile_versions(profile_id, version_no);
create index if not exists order_import_profile_versions_tenant_idx
  on public.order_import_profile_versions(tenant_id);

create trigger set_order_import_profiles_updated_at
before update on public.order_import_profiles
for each row execute procedure public.set_updated_at();

alter table public.order_import_profiles enable row level security;
alter table public.order_import_profile_versions enable row level security;

drop policy if exists "order_import_profiles_select_by_tenant" on public.order_import_profiles;
create policy "order_import_profiles_select_by_tenant" on public.order_import_profiles
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_import_profiles.tenant_id
    )
  );

drop policy if exists "order_import_profiles_insert_by_tenant" on public.order_import_profiles;
create policy "order_import_profiles_insert_by_tenant" on public.order_import_profiles
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_import_profiles.tenant_id
    )
  );

drop policy if exists "order_import_profiles_update_by_tenant" on public.order_import_profiles;
create policy "order_import_profiles_update_by_tenant" on public.order_import_profiles
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_import_profiles.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_import_profiles.tenant_id
    )
  );

drop policy if exists "order_import_profiles_delete_by_tenant" on public.order_import_profiles;
create policy "order_import_profiles_delete_by_tenant" on public.order_import_profiles
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_import_profiles.tenant_id
    )
  );

drop policy if exists "order_import_profile_versions_select_by_tenant" on public.order_import_profile_versions;
create policy "order_import_profile_versions_select_by_tenant" on public.order_import_profile_versions
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_import_profile_versions.tenant_id
    )
  );

drop policy if exists "order_import_profile_versions_insert_by_tenant" on public.order_import_profile_versions;
create policy "order_import_profile_versions_insert_by_tenant" on public.order_import_profile_versions
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_import_profile_versions.tenant_id
    )
  );

drop policy if exists "order_import_profile_versions_update_by_tenant" on public.order_import_profile_versions;
create policy "order_import_profile_versions_update_by_tenant" on public.order_import_profile_versions
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_import_profile_versions.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_import_profile_versions.tenant_id
    )
  );

drop policy if exists "order_import_profile_versions_delete_by_tenant" on public.order_import_profile_versions;
create policy "order_import_profile_versions_delete_by_tenant" on public.order_import_profile_versions
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_import_profile_versions.tenant_id
    )
  );
