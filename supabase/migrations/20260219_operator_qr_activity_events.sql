-- Operator status activity + QR scan audit events

create table if not exists public.production_status_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  batch_run_id uuid references public.batch_runs(id) on delete set null,
  production_item_id uuid references public.production_items(id) on delete set null,
  from_status text,
  to_status text,
  reason text,
  reason_id uuid references public.stop_reasons(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists production_status_events_tenant_id_idx
  on public.production_status_events(tenant_id);
create index if not exists production_status_events_actor_user_id_idx
  on public.production_status_events(actor_user_id);
create index if not exists production_status_events_order_id_idx
  on public.production_status_events(order_id);
create index if not exists production_status_events_created_at_idx
  on public.production_status_events(created_at desc);

drop trigger if exists set_production_status_events_tenant_id
  on public.production_status_events;
create trigger set_production_status_events_tenant_id
before insert on public.production_status_events
for each row execute procedure public.set_order_child_tenant_id();

alter table public.production_status_events enable row level security;

drop policy if exists "production_status_events_select_by_tenant"
  on public.production_status_events;
create policy "production_status_events_select_by_tenant"
  on public.production_status_events
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = production_status_events.tenant_id
    )
  );

drop policy if exists "production_status_events_insert_by_tenant"
  on public.production_status_events;
create policy "production_status_events_insert_by_tenant"
  on public.production_status_events
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = production_status_events.tenant_id
    )
  );

drop policy if exists "production_status_events_delete_by_tenant"
  on public.production_status_events;
create policy "production_status_events_delete_by_tenant"
  on public.production_status_events
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = production_status_events.tenant_id
    )
  );

create table if not exists public.qr_scan_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  raw_value text,
  token text,
  result text not null default 'success'
    check (result in ('success', 'error')),
  message text,
  target_route text,
  created_at timestamptz not null default now()
);

create index if not exists qr_scan_events_tenant_id_idx
  on public.qr_scan_events(tenant_id);
create index if not exists qr_scan_events_user_id_idx
  on public.qr_scan_events(user_id);
create index if not exists qr_scan_events_created_at_idx
  on public.qr_scan_events(created_at desc);

drop trigger if exists set_qr_scan_events_tenant_id on public.qr_scan_events;
create trigger set_qr_scan_events_tenant_id
before insert on public.qr_scan_events
for each row execute procedure public.set_user_child_tenant_id();

alter table public.qr_scan_events enable row level security;

drop policy if exists "qr_scan_events_select_by_tenant" on public.qr_scan_events;
create policy "qr_scan_events_select_by_tenant"
  on public.qr_scan_events
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = qr_scan_events.tenant_id
    )
  );

drop policy if exists "qr_scan_events_insert_by_tenant" on public.qr_scan_events;
create policy "qr_scan_events_insert_by_tenant"
  on public.qr_scan_events
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = qr_scan_events.tenant_id
    )
  );
