alter table public.profiles
  add column if not exists is_owner boolean not null default false;

update public.profiles
set is_owner = true,
    is_admin = true
where lower(coalesce(role, '')) = 'owner';

update public.profiles
set role = 'Admin'
where lower(coalesce(role, '')) = 'owner';

alter table public.profiles
  drop constraint if exists profiles_owner_requires_admin;

alter table public.profiles
  add constraint profiles_owner_requires_admin
  check (not is_owner or coalesce(is_admin, false));

create unique index if not exists profiles_one_owner_per_tenant_uidx
  on public.profiles(tenant_id)
  where is_owner = true and tenant_id is not null;

create or replace function public.is_current_user_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(is_admin, false) or coalesce(is_owner, false)
  from public.profiles
  where id = auth.uid();
$$;

create or replace function public.user_has_permission(
  required_permission text,
  fallback_roles text[] default '{}'::text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select
      p.tenant_id,
      p.role,
      coalesce(p.is_admin, false) as is_admin,
      coalesce(p.is_owner, false) as is_owner
    from public.profiles p
    where p.id = auth.uid()
  ),
  effective_roles as (
    select coalesce(
      (
        select rp.allowed_roles
        from public.role_permissions rp
        join me on me.tenant_id = rp.tenant_id
        where rp.permission = required_permission
        limit 1
      ),
      coalesce(fallback_roles, '{}'::text[])
    ) as roles
  )
  select exists (
    select 1
    from me, effective_roles er
    where me.tenant_id is not null
      and (
        me.is_owner
        or me.is_admin
        or me.role = 'Admin'
        or me.role = any(er.roles)
      )
  );
$$;

update public.role_permissions
set allowed_roles = array_remove(allowed_roles, 'Owner')
where 'Owner' = any(allowed_roles);
