create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  permission text not null,
  allowed_roles text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, permission)
);

create index if not exists role_permissions_tenant_id_idx
  on public.role_permissions(tenant_id);

create index if not exists role_permissions_permission_idx
  on public.role_permissions(permission);

drop trigger if exists set_role_permissions_updated_at on public.role_permissions;
create trigger set_role_permissions_updated_at
before update on public.role_permissions
for each row execute procedure public.set_updated_at();

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
      coalesce(p.is_admin, false) as is_admin
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
        me.is_admin
        or me.role in ('Owner', 'Admin')
        or me.role = any(er.roles)
      )
  );
$$;

grant execute on function public.user_has_permission(text, text[]) to authenticated;

alter table public.role_permissions enable row level security;

drop policy if exists "role_permissions_select_by_tenant" on public.role_permissions;
create policy "role_permissions_select_by_tenant" on public.role_permissions
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = role_permissions.tenant_id
    )
  );

drop policy if exists "role_permissions_insert_by_permission" on public.role_permissions;
create policy "role_permissions_insert_by_permission" on public.role_permissions
  for insert
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = role_permissions.tenant_id
    )
    and public.user_has_permission(
      'settings.manage',
      array['Owner', 'Admin']::text[]
    )
  );

drop policy if exists "role_permissions_update_by_permission" on public.role_permissions;
create policy "role_permissions_update_by_permission" on public.role_permissions
  for update
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = role_permissions.tenant_id
    )
    and public.user_has_permission(
      'settings.manage',
      array['Owner', 'Admin']::text[]
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = role_permissions.tenant_id
    )
    and public.user_has_permission(
      'settings.manage',
      array['Owner', 'Admin']::text[]
    )
  );

drop policy if exists "role_permissions_delete_by_permission" on public.role_permissions;
create policy "role_permissions_delete_by_permission" on public.role_permissions
  for delete
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = role_permissions.tenant_id
    )
    and public.user_has_permission(
      'settings.manage',
      array['Owner', 'Admin']::text[]
    )
  );

grant select, insert, update, delete on public.role_permissions to authenticated;

insert into public.role_permissions (tenant_id, permission, allowed_roles)
select
  t.id,
  defs.permission,
  defs.allowed_roles
from public.tenants t
cross join (
  values
    ('dashboard.view'::text, array['Owner', 'Admin']::text[]),
    ('settings.view'::text, array['Owner', 'Admin']::text[]),
    ('settings.manage'::text, array['Owner', 'Admin']::text[]),
    ('production.view'::text, array['Owner', 'Admin', 'Production manager', 'Production']::text[]),
    ('production.operator.view'::text, array['Owner', 'Admin', 'Production manager', 'Production worker', 'Production']::text[]),
    ('orders.manage'::text, array['Owner', 'Admin', 'Sales']::text[])
) as defs(permission, allowed_roles)
on conflict (tenant_id, permission) do nothing;

-- Orders: write access requires orders.manage permission
drop policy if exists "orders_insert_by_tenant" on public.orders;
create policy "orders_insert_by_tenant" on public.orders
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = orders.tenant_id
    )
    and public.user_has_permission(
      'orders.manage',
      array['Owner', 'Admin', 'Sales']::text[]
    )
  );

drop policy if exists "orders_update_by_tenant" on public.orders;
create policy "orders_update_by_tenant" on public.orders
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = orders.tenant_id
    )
    and public.user_has_permission(
      'orders.manage',
      array['Owner', 'Admin', 'Sales']::text[]
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = orders.tenant_id
    )
    and public.user_has_permission(
      'orders.manage',
      array['Owner', 'Admin', 'Sales']::text[]
    )
  );

drop policy if exists "orders_delete_by_tenant" on public.orders;
create policy "orders_delete_by_tenant" on public.orders
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = orders.tenant_id
    )
    and public.user_has_permission(
      'orders.manage',
      array['Owner', 'Admin', 'Sales']::text[]
    )
  );

-- Settings-managed tables: write access requires settings.manage permission
drop policy if exists "hierarchy_levels_insert_by_tenant" on public.hierarchy_levels;
create policy "hierarchy_levels_insert_by_tenant" on public.hierarchy_levels
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = hierarchy_levels.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "hierarchy_levels_update_by_tenant" on public.hierarchy_levels;
create policy "hierarchy_levels_update_by_tenant" on public.hierarchy_levels
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = hierarchy_levels.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = hierarchy_levels.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "hierarchy_levels_delete_by_tenant" on public.hierarchy_levels;
create policy "hierarchy_levels_delete_by_tenant" on public.hierarchy_levels
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = hierarchy_levels.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "hierarchy_nodes_insert_by_tenant" on public.hierarchy_nodes;
create policy "hierarchy_nodes_insert_by_tenant" on public.hierarchy_nodes
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = hierarchy_nodes.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "hierarchy_nodes_update_by_tenant" on public.hierarchy_nodes;
create policy "hierarchy_nodes_update_by_tenant" on public.hierarchy_nodes
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = hierarchy_nodes.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = hierarchy_nodes.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "hierarchy_nodes_delete_by_tenant" on public.hierarchy_nodes;
create policy "hierarchy_nodes_delete_by_tenant" on public.hierarchy_nodes
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = hierarchy_nodes.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "workstations_insert_by_tenant" on public.workstations;
create policy "workstations_insert_by_tenant" on public.workstations
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workstations.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "workstations_update_by_tenant" on public.workstations;
create policy "workstations_update_by_tenant" on public.workstations
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workstations.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workstations.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "workstations_delete_by_tenant" on public.workstations;
create policy "workstations_delete_by_tenant" on public.workstations
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workstations.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "station_dependencies_insert_by_tenant" on public.station_dependencies;
create policy "station_dependencies_insert_by_tenant" on public.station_dependencies
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = station_dependencies.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "station_dependencies_delete_by_tenant" on public.station_dependencies;
create policy "station_dependencies_delete_by_tenant" on public.station_dependencies
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = station_dependencies.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "tenant_settings_insert_by_tenant" on public.tenant_settings;
create policy "tenant_settings_insert_by_tenant" on public.tenant_settings
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = tenant_settings.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "tenant_settings_update_by_tenant" on public.tenant_settings;
create policy "tenant_settings_update_by_tenant" on public.tenant_settings
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = tenant_settings.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = tenant_settings.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "tenant_settings_delete_by_tenant" on public.tenant_settings;
create policy "tenant_settings_delete_by_tenant" on public.tenant_settings
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = tenant_settings.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "stop_reasons_insert_by_tenant" on public.stop_reasons;
create policy "stop_reasons_insert_by_tenant" on public.stop_reasons
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = stop_reasons.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "stop_reasons_update_by_tenant" on public.stop_reasons;
create policy "stop_reasons_update_by_tenant" on public.stop_reasons
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = stop_reasons.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = stop_reasons.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "stop_reasons_delete_by_tenant" on public.stop_reasons;
create policy "stop_reasons_delete_by_tenant" on public.stop_reasons
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = stop_reasons.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "order_input_fields_insert_by_tenant" on public.order_input_fields;
create policy "order_input_fields_insert_by_tenant" on public.order_input_fields
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_input_fields.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "order_input_fields_update_by_tenant" on public.order_input_fields;
create policy "order_input_fields_update_by_tenant" on public.order_input_fields
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_input_fields.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_input_fields.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "order_input_fields_delete_by_tenant" on public.order_input_fields;
create policy "order_input_fields_delete_by_tenant" on public.order_input_fields
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_input_fields.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

alter table public.external_job_fields enable row level security;

drop policy if exists "external_job_fields_select_by_tenant" on public.external_job_fields;
create policy "external_job_fields_select_by_tenant" on public.external_job_fields
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = external_job_fields.tenant_id
    )
  );

drop policy if exists "external_job_fields_insert_by_tenant" on public.external_job_fields;
create policy "external_job_fields_insert_by_tenant" on public.external_job_fields
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = external_job_fields.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "external_job_fields_update_by_tenant" on public.external_job_fields;
create policy "external_job_fields_update_by_tenant" on public.external_job_fields
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = external_job_fields.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = external_job_fields.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "external_job_fields_delete_by_tenant" on public.external_job_fields;
create policy "external_job_fields_delete_by_tenant" on public.external_job_fields
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = external_job_fields.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "workflow_rules_insert_by_tenant" on public.workflow_rules;
create policy "workflow_rules_insert_by_tenant" on public.workflow_rules
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workflow_rules.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );

drop policy if exists "workflow_rules_update_by_tenant" on public.workflow_rules;
create policy "workflow_rules_update_by_tenant" on public.workflow_rules
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workflow_rules.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workflow_rules.tenant_id
    )
    and public.user_has_permission('settings.manage', array['Owner', 'Admin']::text[])
  );
