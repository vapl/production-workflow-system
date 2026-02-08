alter table public.profiles enable row level security;

create or replace function public.current_tenant_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_current_user_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(is_admin, false) from public.profiles where id = auth.uid();
$$;

drop policy if exists "profiles_select_by_tenant" on public.profiles;
drop policy if exists "profiles_select_by_self" on public.profiles;
drop policy if exists "profiles_select_by_tenant_admin" on public.profiles;
drop policy if exists "profiles_insert_self" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "profiles_update_by_tenant_admin" on public.profiles;

create policy "profiles_select_by_self" on public.profiles
  for select
  using (id = auth.uid());

create policy "profiles_select_by_tenant_admin" on public.profiles
  for select
  using (
    public.is_current_user_admin()
    and profiles.tenant_id = public.current_tenant_id()
  );

create policy "profiles_insert_self" on public.profiles
  for insert
  with check (id = auth.uid());

create policy "profiles_update_self" on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_update_by_tenant_admin" on public.profiles
  for update
  using (
    public.is_current_user_admin()
    and profiles.tenant_id = public.current_tenant_id()
  )
  with check (
    public.is_current_user_admin()
    and profiles.tenant_id = public.current_tenant_id()
  );

grant select, insert, update on public.profiles to authenticated;
grant execute on function public.current_tenant_id() to authenticated;
grant execute on function public.is_current_user_admin() to authenticated;
