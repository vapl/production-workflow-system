-- Rename legacy hierarchy reference tables to order field reference tables.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'hierarchy_levels'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'order_fields'
  ) then
    alter table public.hierarchy_levels rename to order_fields;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'hierarchy_nodes'
  ) and not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'order_field_options'
  ) then
    alter table public.hierarchy_nodes rename to order_field_options;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'order_field_options'
      and column_name = 'level_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'order_field_options'
      and column_name = 'order_field_id'
  ) then
    alter table public.order_field_options rename column level_id to order_field_id;
  end if;
end $$;

alter index if exists public.hierarchy_levels_tenant_id_idx
  rename to order_fields_tenant_id_idx;
alter index if exists public.hierarchy_levels_key_idx
  rename to order_fields_key_idx;
alter index if exists public.hierarchy_nodes_tenant_id_idx
  rename to order_field_options_tenant_id_idx;
alter index if exists public.hierarchy_nodes_level_id_idx
  rename to order_field_options_order_field_id_idx;
alter index if exists public.hierarchy_nodes_parent_id_idx
  rename to order_field_options_parent_id_idx;

drop trigger if exists set_hierarchy_levels_updated_at on public.order_fields;
create trigger set_order_fields_updated_at
before update on public.order_fields
for each row execute procedure public.set_updated_at();

drop trigger if exists set_hierarchy_nodes_updated_at on public.order_field_options;
create trigger set_order_field_options_updated_at
before update on public.order_field_options
for each row execute procedure public.set_updated_at();

alter table public.order_fields enable row level security;
alter table public.order_field_options enable row level security;

drop policy if exists "hierarchy_levels_select_by_tenant" on public.order_fields;
drop policy if exists "hierarchy_levels_insert_by_tenant" on public.order_fields;
drop policy if exists "hierarchy_levels_update_by_tenant" on public.order_fields;
drop policy if exists "hierarchy_levels_delete_by_tenant" on public.order_fields;

create policy "order_fields_select_by_tenant" on public.order_fields
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_fields.tenant_id
    )
  );

create policy "order_fields_insert_by_tenant" on public.order_fields
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_fields.tenant_id
    )
  );

create policy "order_fields_update_by_tenant" on public.order_fields
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_fields.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_fields.tenant_id
    )
  );

create policy "order_fields_delete_by_tenant" on public.order_fields
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_fields.tenant_id
    )
  );

drop policy if exists "hierarchy_nodes_select_by_tenant" on public.order_field_options;
drop policy if exists "hierarchy_nodes_insert_by_tenant" on public.order_field_options;
drop policy if exists "hierarchy_nodes_update_by_tenant" on public.order_field_options;
drop policy if exists "hierarchy_nodes_delete_by_tenant" on public.order_field_options;

create policy "order_field_options_select_by_tenant" on public.order_field_options
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_field_options.tenant_id
    )
  );

create policy "order_field_options_insert_by_tenant" on public.order_field_options
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_field_options.tenant_id
    )
  );

create policy "order_field_options_update_by_tenant" on public.order_field_options
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_field_options.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_field_options.tenant_id
    )
  );

create policy "order_field_options_delete_by_tenant" on public.order_field_options
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_field_options.tenant_id
    )
  );
