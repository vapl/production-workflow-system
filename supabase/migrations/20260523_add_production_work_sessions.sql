create table if not exists public.production_work_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  batch_run_id uuid not null references public.batch_runs(id) on delete cascade,
  production_item_id uuid references public.production_items(id) on delete set null,
  station_id uuid references public.workstations(id) on delete set null,
  operator_user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  stopped_at timestamptz,
  ended_status text
    check (ended_status in ('paused', 'blocked', 'done')),
  stop_reason text,
  stop_reason_id uuid references public.stop_reasons(id) on delete set null,
  duration_minutes integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((is_active = true and stopped_at is null) or is_active = false)
);

create index if not exists production_work_sessions_tenant_id_idx
  on public.production_work_sessions(tenant_id);
create index if not exists production_work_sessions_order_id_idx
  on public.production_work_sessions(order_id);
create index if not exists production_work_sessions_batch_run_id_idx
  on public.production_work_sessions(batch_run_id);
create index if not exists production_work_sessions_production_item_id_idx
  on public.production_work_sessions(production_item_id);
create index if not exists production_work_sessions_station_id_idx
  on public.production_work_sessions(station_id);
create index if not exists production_work_sessions_operator_user_id_idx
  on public.production_work_sessions(operator_user_id);
create index if not exists production_work_sessions_started_at_idx
  on public.production_work_sessions(started_at desc);
create index if not exists production_work_sessions_active_idx
  on public.production_work_sessions(operator_user_id, is_active);

create unique index if not exists production_work_sessions_active_item_uidx
  on public.production_work_sessions(operator_user_id, batch_run_id, production_item_id)
  where is_active = true and production_item_id is not null;

create unique index if not exists production_work_sessions_active_run_uidx
  on public.production_work_sessions(operator_user_id, batch_run_id)
  where is_active = true and production_item_id is null;

drop trigger if exists production_work_sessions_set_updated_at on public.production_work_sessions;
create trigger production_work_sessions_set_updated_at
before update on public.production_work_sessions
for each row execute procedure public.set_updated_at();

alter table public.production_work_sessions enable row level security;

create policy "production_work_sessions_select_by_tenant"
  on public.production_work_sessions
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = production_work_sessions.tenant_id
    )
  );

create policy "production_work_sessions_insert_by_tenant"
  on public.production_work_sessions
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = production_work_sessions.tenant_id
    )
  );

create policy "production_work_sessions_update_by_tenant"
  on public.production_work_sessions
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = production_work_sessions.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = production_work_sessions.tenant_id
    )
  );

create policy "production_work_sessions_delete_by_tenant"
  on public.production_work_sessions
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = production_work_sessions.tenant_id
    )
  );
