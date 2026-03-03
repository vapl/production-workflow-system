create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  source_kind text not null default 'order_input_table'
    check (source_kind in ('order_input_table', 'manual', 'import', 'cad')),
  source_field_id uuid references public.order_input_fields(id) on delete set null,
  source_row_id text not null,
  sort_order integer not null default 0,
  position text,
  item_name text not null,
  item_type text,
  qty numeric not null default 1,
  material text,
  dimensions text,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists order_items_source_row_uidx
  on public.order_items(order_id, source_kind, source_field_id, source_row_id);
create index if not exists order_items_tenant_id_idx
  on public.order_items(tenant_id);
create index if not exists order_items_order_id_idx
  on public.order_items(order_id);
create index if not exists order_items_source_field_id_idx
  on public.order_items(source_field_id);
create index if not exists order_items_item_name_idx
  on public.order_items(item_name);

drop trigger if exists set_order_items_updated_at on public.order_items;
create trigger set_order_items_updated_at
before update on public.order_items
for each row execute procedure public.set_updated_at();

drop trigger if exists set_order_items_tenant_id on public.order_items;
create trigger set_order_items_tenant_id
before insert on public.order_items
for each row execute procedure public.set_order_child_tenant_id();

alter table public.order_items enable row level security;

create policy "order_items_select_by_tenant" on public.order_items
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_items.tenant_id
    )
  );

create policy "order_items_insert_by_tenant" on public.order_items
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_items.tenant_id
    )
  );

create policy "order_items_update_by_tenant" on public.order_items
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_items.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_items.tenant_id
    )
  );

create policy "order_items_delete_by_tenant" on public.order_items
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_items.tenant_id
    )
  );
