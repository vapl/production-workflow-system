create table if not exists public.order_item_bom_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  line_no integer not null default 0,
  component_code text,
  component_name text not null,
  component_type text not null default 'other'
    check (component_type in (
      'profile',
      'glass',
      'panel',
      'hardware',
      'gasket',
      'accessory',
      'sheet',
      'edge_band',
      'fitting',
      'other'
    )),
  qty numeric not null default 1,
  unit text not null default 'pcs',
  length numeric,
  width numeric,
  height numeric,
  attributes jsonb not null default '{}'::jsonb,
  source_kind text not null default 'manual'
    check (source_kind in ('manual', 'import', 'cad')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_item_bom_lines_tenant_id_idx
  on public.order_item_bom_lines(tenant_id);
create index if not exists order_item_bom_lines_order_item_id_idx
  on public.order_item_bom_lines(order_item_id);
create index if not exists order_item_bom_lines_component_code_idx
  on public.order_item_bom_lines(component_code);
create index if not exists order_item_bom_lines_component_type_idx
  on public.order_item_bom_lines(component_type);

drop trigger if exists set_order_item_bom_lines_updated_at on public.order_item_bom_lines;
create trigger set_order_item_bom_lines_updated_at
before update on public.order_item_bom_lines
for each row execute procedure public.set_updated_at();

create or replace function public.set_order_item_bom_line_tenant_id()
returns trigger
language plpgsql
as $$
begin
  if new.tenant_id is null then
    select oi.tenant_id
      into new.tenant_id
    from public.order_items oi
    where oi.id = new.order_item_id;
  end if;
  return new;
end;
$$;

drop trigger if exists set_order_item_bom_lines_tenant_id on public.order_item_bom_lines;
create trigger set_order_item_bom_lines_tenant_id
before insert on public.order_item_bom_lines
for each row execute procedure public.set_order_item_bom_line_tenant_id();

alter table public.order_item_bom_lines enable row level security;

create policy "order_item_bom_lines_select_by_tenant" on public.order_item_bom_lines
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_item_bom_lines.tenant_id
    )
  );

create policy "order_item_bom_lines_insert_by_tenant" on public.order_item_bom_lines
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_item_bom_lines.tenant_id
    )
  );

create policy "order_item_bom_lines_update_by_tenant" on public.order_item_bom_lines
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_item_bom_lines.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_item_bom_lines.tenant_id
    )
  );

create policy "order_item_bom_lines_delete_by_tenant" on public.order_item_bom_lines
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_item_bom_lines.tenant_id
    )
  );
