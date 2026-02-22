-- Performance/security hardening for auth and RLS hot paths.

-- 1) Lock down trigger/helper functions search_path.
alter function public.set_updated_at() set search_path = public;
alter function public.set_order_child_tenant_id() set search_path = public;
alter function public.set_user_child_tenant_id() set search_path = public;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'handle_new_user'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    execute 'alter function public.handle_new_user() set search_path = public';
  end if;
end;
$$;

-- 2) Enable missing RLS for external job field values.
alter table public.external_job_field_values enable row level security;

drop policy if exists "external_job_field_values_select_by_tenant" on public.external_job_field_values;
create policy "external_job_field_values_select_by_tenant"
  on public.external_job_field_values
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.tenant_id = external_job_field_values.tenant_id
    )
  );

drop policy if exists "external_job_field_values_insert_by_tenant" on public.external_job_field_values;
create policy "external_job_field_values_insert_by_tenant"
  on public.external_job_field_values
  for insert
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.tenant_id = external_job_field_values.tenant_id
    )
  );

drop policy if exists "external_job_field_values_update_by_tenant" on public.external_job_field_values;
create policy "external_job_field_values_update_by_tenant"
  on public.external_job_field_values
  for update
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.tenant_id = external_job_field_values.tenant_id
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.tenant_id = external_job_field_values.tenant_id
    )
  );

drop policy if exists "external_job_field_values_delete_by_tenant" on public.external_job_field_values;
create policy "external_job_field_values_delete_by_tenant"
  on public.external_job_field_values
  for delete
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.tenant_id = external_job_field_values.tenant_id
    )
  );

-- 3) Reduce expensive per-row auth function re-evaluation on hot startup tables.

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_by_admin" on public.profiles;

drop policy if exists "profiles_select_by_self" on public.profiles;
create policy "profiles_select_by_self"
  on public.profiles
  for select
  using (id = (select auth.uid()));

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
  on public.profiles
  for insert
  with check (id = (select auth.uid()));

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles
  for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "profiles_select_by_tenant_admin" on public.profiles;
create policy "profiles_select_by_tenant_admin"
  on public.profiles
  for select
  using (
    (select public.is_current_user_admin())
    and profiles.tenant_id = (select public.current_tenant_id())
  );

drop policy if exists "profiles_update_by_tenant_admin" on public.profiles;
create policy "profiles_update_by_tenant_admin"
  on public.profiles
  for update
  using (
    (select public.is_current_user_admin())
    and profiles.tenant_id = (select public.current_tenant_id())
  )
  with check (
    (select public.is_current_user_admin())
    and profiles.tenant_id = (select public.current_tenant_id())
  );

drop policy if exists "tenants_select_own" on public.tenants;
create policy "tenants_select_own"
  on public.tenants
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.tenant_id = tenants.id
    )
  );

drop policy if exists "role_permissions_select_by_tenant" on public.role_permissions;
create policy "role_permissions_select_by_tenant"
  on public.role_permissions
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.tenant_id = role_permissions.tenant_id
    )
  );

drop policy if exists "role_permissions_insert_by_permission" on public.role_permissions;
create policy "role_permissions_insert_by_permission"
  on public.role_permissions
  for insert
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.tenant_id = role_permissions.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "role_permissions_update_by_permission" on public.role_permissions;
create policy "role_permissions_update_by_permission"
  on public.role_permissions
  for update
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.tenant_id = role_permissions.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.tenant_id = role_permissions.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "role_permissions_delete_by_permission" on public.role_permissions;
create policy "role_permissions_delete_by_permission"
  on public.role_permissions
  for delete
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.tenant_id = role_permissions.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

-- 4) Remove duplicate index/constraint reported by linter.
alter table public.workflow_rules
  drop constraint if exists workflow_rules_tenant_id_key;
