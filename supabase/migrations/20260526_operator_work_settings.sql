alter table public.operators
  add column if not exists weekly_target_minutes integer,
  add column if not exists monthly_target_minutes integer,
  add column if not exists overtime_threshold_minutes integer;

create table if not exists public.operator_absences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operator_id uuid not null references public.operators(id) on delete cascade,
  absence_type text not null default 'vacation',
  start_date date not null,
  end_date date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operator_absences_date_order_check check (end_date >= start_date)
);

create index if not exists operator_absences_tenant_id_idx
  on public.operator_absences(tenant_id);
create index if not exists operator_absences_operator_id_idx
  on public.operator_absences(operator_id);
create index if not exists operator_absences_date_idx
  on public.operator_absences(start_date, end_date);

drop trigger if exists set_operator_absences_updated_at
  on public.operator_absences;
create trigger set_operator_absences_updated_at
before update on public.operator_absences
for each row execute function public.set_updated_at();

alter table public.operator_absences enable row level security;

drop policy if exists "operator_absences_select_by_tenant"
  on public.operator_absences;
create policy "operator_absences_select_by_tenant"
  on public.operator_absences
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = operator_absences.tenant_id
    )
  );

drop policy if exists "operator_absences_insert_by_tenant"
  on public.operator_absences;
create policy "operator_absences_insert_by_tenant"
  on public.operator_absences
  for insert
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = operator_absences.tenant_id
    )
  );

drop policy if exists "operator_absences_update_by_tenant"
  on public.operator_absences;
create policy "operator_absences_update_by_tenant"
  on public.operator_absences
  for update
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = operator_absences.tenant_id
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = operator_absences.tenant_id
    )
  );

drop policy if exists "operator_absences_delete_by_tenant"
  on public.operator_absences;
create policy "operator_absences_delete_by_tenant"
  on public.operator_absences
  for delete
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = operator_absences.tenant_id
    )
  );
