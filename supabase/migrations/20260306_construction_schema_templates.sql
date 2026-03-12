create table if not exists public.construction_schema_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  template_key text not null default 'default',
  template_type text not null
    check (template_type in ('primary_columns', 'bom_columns', 'erp_attributes')),
  payload jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, template_key, template_type)
);

create index if not exists construction_schema_templates_tenant_idx
  on public.construction_schema_templates(tenant_id);

create index if not exists construction_schema_templates_type_idx
  on public.construction_schema_templates(template_type);

drop trigger if exists set_construction_schema_templates_updated_at on public.construction_schema_templates;
create trigger set_construction_schema_templates_updated_at
before update on public.construction_schema_templates
for each row execute procedure public.set_updated_at();

alter table public.construction_schema_templates enable row level security;

drop policy if exists "construction_schema_templates_select_by_tenant" on public.construction_schema_templates;
create policy "construction_schema_templates_select_by_tenant" on public.construction_schema_templates
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = construction_schema_templates.tenant_id
    )
  );

drop policy if exists "construction_schema_templates_insert_by_permission" on public.construction_schema_templates;
create policy "construction_schema_templates_insert_by_permission" on public.construction_schema_templates
  for insert
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = construction_schema_templates.tenant_id
    )
    and public.user_has_permission(
      'settings.manage',
      array['Owner', 'Admin']::text[]
    )
  );

drop policy if exists "construction_schema_templates_update_by_permission" on public.construction_schema_templates;
create policy "construction_schema_templates_update_by_permission" on public.construction_schema_templates
  for update
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = construction_schema_templates.tenant_id
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
        and p.tenant_id = construction_schema_templates.tenant_id
    )
    and public.user_has_permission(
      'settings.manage',
      array['Owner', 'Admin']::text[]
    )
  );

drop policy if exists "construction_schema_templates_delete_by_permission" on public.construction_schema_templates;
create policy "construction_schema_templates_delete_by_permission" on public.construction_schema_templates
  for delete
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = construction_schema_templates.tenant_id
    )
    and public.user_has_permission(
      'settings.manage',
      array['Owner', 'Admin']::text[]
    )
  );

grant select, insert, update, delete on public.construction_schema_templates to authenticated;

