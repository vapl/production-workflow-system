-- PWS multi-tenant Orders schema for Supabase

create extension if not exists pgcrypto;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists tenant_id uuid references public.tenants(id) on delete restrict;

create index if not exists profiles_tenant_id_idx on public.profiles(tenant_id);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_number text not null unique,
  customer_name text not null,
  product_name text,
  quantity integer check (quantity > 0),
  hierarchy jsonb,
  due_date date not null,
  priority text not null check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  source text not null default 'manual',
  external_id text,
  source_payload jsonb,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_tenant_id_idx on public.orders(tenant_id);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_due_date_idx on public.orders(due_date);
create index if not exists orders_external_id_idx on public.orders(external_id);

create table if not exists public.order_attachments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  url text,
  added_by uuid references auth.users(id) on delete set null,
  added_by_name text,
  added_by_role text,
  created_at timestamptz not null default now(),
  size integer,
  mime_type text
);

create index if not exists order_attachments_order_id_idx on public.order_attachments(order_id);
create index if not exists order_attachments_tenant_id_idx on public.order_attachments(tenant_id);

create table if not exists public.order_comments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  message text not null,
  author uuid references auth.users(id) on delete set null,
  author_name text,
  author_role text,
  created_at timestamptz not null default now()
);

create index if not exists order_comments_order_id_idx on public.order_comments(order_id);
create index if not exists order_comments_tenant_id_idx on public.order_comments(tenant_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row execute procedure public.set_updated_at();

create or replace function public.set_order_child_tenant_id()
returns trigger as $$
begin
  if new.tenant_id is null then
    select tenant_id into new.tenant_id from public.orders where id = new.order_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_order_attachments_tenant_id on public.order_attachments;
create trigger set_order_attachments_tenant_id
before insert on public.order_attachments
for each row execute procedure public.set_order_child_tenant_id();

drop trigger if exists set_order_comments_tenant_id on public.order_comments;
create trigger set_order_comments_tenant_id
before insert on public.order_comments
for each row execute procedure public.set_order_child_tenant_id();

alter table public.orders enable row level security;
alter table public.order_attachments enable row level security;
alter table public.order_comments enable row level security;
alter table public.tenants enable row level security;

create policy "orders_select_by_tenant" on public.orders
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = orders.tenant_id
    )
  );

create policy "orders_insert_by_tenant" on public.orders
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = orders.tenant_id
    )
  );

create policy "orders_update_by_tenant" on public.orders
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = orders.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = orders.tenant_id
    )
  );

create policy "orders_delete_by_tenant" on public.orders
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = orders.tenant_id
    )
  );

create policy "order_attachments_select_by_tenant" on public.order_attachments
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_attachments.tenant_id
    )
  );

create policy "order_attachments_insert_by_tenant" on public.order_attachments
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_attachments.tenant_id
    )
  );

create policy "order_attachments_update_by_tenant" on public.order_attachments
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_attachments.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_attachments.tenant_id
    )
  );

create policy "order_attachments_delete_by_tenant" on public.order_attachments
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_attachments.tenant_id
    )
  );

create policy "order_comments_select_by_tenant" on public.order_comments
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_comments.tenant_id
    )
  );

create policy "order_comments_insert_by_tenant" on public.order_comments
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_comments.tenant_id
    )
  );

create policy "order_comments_update_by_tenant" on public.order_comments
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_comments.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_comments.tenant_id
    )
  );

create policy "order_comments_delete_by_tenant" on public.order_comments
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_comments.tenant_id
    )
  );

create policy "tenants_select_own" on public.tenants
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = tenants.id
    )
  );

-- Additional domain tables
create table if not exists public.hierarchy_levels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  key text not null,
  sort_order integer not null default 1,
  is_required boolean not null default false,
  is_active boolean not null default true,
  show_in_table boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hierarchy_levels_tenant_id_idx on public.hierarchy_levels(tenant_id);
create index if not exists hierarchy_levels_key_idx on public.hierarchy_levels(key);

create table if not exists public.hierarchy_nodes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  level_id uuid not null references public.hierarchy_levels(id) on delete cascade,
  label text not null,
  code text,
  parent_id uuid references public.hierarchy_nodes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hierarchy_nodes_tenant_id_idx on public.hierarchy_nodes(tenant_id);
create index if not exists hierarchy_nodes_level_id_idx on public.hierarchy_nodes(level_id);
create index if not exists hierarchy_nodes_parent_id_idx on public.hierarchy_nodes(parent_id);

create table if not exists public.workstations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workstations_tenant_id_idx on public.workstations(tenant_id);

create table if not exists public.operators (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  role text,
  station_id uuid references public.workstations(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operators_tenant_id_idx on public.operators(tenant_id);
create index if not exists operators_station_id_idx on public.operators(station_id);

create table if not exists public.stop_reasons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stop_reasons_tenant_id_idx on public.stop_reasons(tenant_id);

create table if not exists public.construction_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  default_stations text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists construction_items_tenant_id_idx on public.construction_items(tenant_id);

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  name text not null,
  workstation_name text not null,
  operator_name text,
  estimated_hours numeric not null,
  actual_hours numeric,
  completed_at date,
  status text not null check (status in ('planned', 'in_progress', 'blocked', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists batches_tenant_id_idx on public.batches(tenant_id);
create index if not exists batches_order_id_idx on public.batches(order_id);

drop trigger if exists set_hierarchy_levels_updated_at on public.hierarchy_levels;
create trigger set_hierarchy_levels_updated_at
before update on public.hierarchy_levels
for each row execute procedure public.set_updated_at();

drop trigger if exists set_hierarchy_nodes_updated_at on public.hierarchy_nodes;
create trigger set_hierarchy_nodes_updated_at
before update on public.hierarchy_nodes
for each row execute procedure public.set_updated_at();

drop trigger if exists set_workstations_updated_at on public.workstations;
create trigger set_workstations_updated_at
before update on public.workstations
for each row execute procedure public.set_updated_at();

drop trigger if exists set_operators_updated_at on public.operators;
create trigger set_operators_updated_at
before update on public.operators
for each row execute procedure public.set_updated_at();

drop trigger if exists set_stop_reasons_updated_at on public.stop_reasons;
create trigger set_stop_reasons_updated_at
before update on public.stop_reasons
for each row execute procedure public.set_updated_at();

drop trigger if exists set_construction_items_updated_at on public.construction_items;
create trigger set_construction_items_updated_at
before update on public.construction_items
for each row execute procedure public.set_updated_at();

drop trigger if exists set_batches_updated_at on public.batches;
create trigger set_batches_updated_at
before update on public.batches
for each row execute procedure public.set_updated_at();

alter table public.hierarchy_levels enable row level security;
alter table public.hierarchy_nodes enable row level security;
alter table public.workstations enable row level security;
alter table public.operators enable row level security;
alter table public.stop_reasons enable row level security;
alter table public.construction_items enable row level security;
alter table public.batches enable row level security;

create policy "hierarchy_levels_select_by_tenant" on public.hierarchy_levels
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = hierarchy_levels.tenant_id
    )
  );

create policy "hierarchy_levels_insert_by_tenant" on public.hierarchy_levels
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = hierarchy_levels.tenant_id
    )
  );

create policy "hierarchy_levels_update_by_tenant" on public.hierarchy_levels
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = hierarchy_levels.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = hierarchy_levels.tenant_id
    )
  );

create policy "hierarchy_levels_delete_by_tenant" on public.hierarchy_levels
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = hierarchy_levels.tenant_id
    )
  );

create policy "hierarchy_nodes_select_by_tenant" on public.hierarchy_nodes
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = hierarchy_nodes.tenant_id
    )
  );

create policy "hierarchy_nodes_insert_by_tenant" on public.hierarchy_nodes
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = hierarchy_nodes.tenant_id
    )
  );

create policy "hierarchy_nodes_update_by_tenant" on public.hierarchy_nodes
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = hierarchy_nodes.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = hierarchy_nodes.tenant_id
    )
  );

create policy "hierarchy_nodes_delete_by_tenant" on public.hierarchy_nodes
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = hierarchy_nodes.tenant_id
    )
  );

create policy "workstations_select_by_tenant" on public.workstations
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workstations.tenant_id
    )
  );

create policy "workstations_insert_by_tenant" on public.workstations
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workstations.tenant_id
    )
  );

create policy "workstations_update_by_tenant" on public.workstations
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workstations.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workstations.tenant_id
    )
  );

create policy "workstations_delete_by_tenant" on public.workstations
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workstations.tenant_id
    )
  );

create policy "operators_select_by_tenant" on public.operators
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = operators.tenant_id
    )
  );

create policy "operators_insert_by_tenant" on public.operators
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = operators.tenant_id
    )
  );

create policy "operators_update_by_tenant" on public.operators
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = operators.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = operators.tenant_id
    )
  );

create policy "operators_delete_by_tenant" on public.operators
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = operators.tenant_id
    )
  );

create policy "stop_reasons_select_by_tenant" on public.stop_reasons
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = stop_reasons.tenant_id
    )
  );

create policy "stop_reasons_insert_by_tenant" on public.stop_reasons
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = stop_reasons.tenant_id
    )
  );

create policy "stop_reasons_update_by_tenant" on public.stop_reasons
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = stop_reasons.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = stop_reasons.tenant_id
    )
  );

create policy "stop_reasons_delete_by_tenant" on public.stop_reasons
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = stop_reasons.tenant_id
    )
  );

create policy "construction_items_select_by_tenant" on public.construction_items
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = construction_items.tenant_id
    )
  );

create policy "construction_items_insert_by_tenant" on public.construction_items
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = construction_items.tenant_id
    )
  );

create policy "construction_items_update_by_tenant" on public.construction_items
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = construction_items.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = construction_items.tenant_id
    )
  );

create policy "construction_items_delete_by_tenant" on public.construction_items
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = construction_items.tenant_id
    )
  );

create policy "batches_select_by_tenant" on public.batches
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = batches.tenant_id
    )
  );

create policy "batches_insert_by_tenant" on public.batches
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = batches.tenant_id
    )
  );

create policy "batches_update_by_tenant" on public.batches
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = batches.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = batches.tenant_id
    )
  );

create policy "batches_delete_by_tenant" on public.batches
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = batches.tenant_id
    )
  );
