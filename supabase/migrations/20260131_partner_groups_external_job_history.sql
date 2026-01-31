-- Partner groups
create table if not exists public.partner_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.partners
  add column if not exists group_id uuid references public.partner_groups(id) on delete set null;

create index if not exists partner_groups_tenant_id_idx on public.partner_groups(tenant_id);
create index if not exists partners_group_id_idx on public.partners(group_id);

-- External job status history
create table if not exists public.external_job_status_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  external_job_id uuid not null references public.external_jobs(id) on delete cascade,
  status text not null,
  changed_by_name text,
  changed_by_role text,
  changed_at timestamptz not null default now()
);

create index if not exists external_job_status_history_job_id_idx
  on public.external_job_status_history(external_job_id);
create index if not exists external_job_status_history_tenant_id_idx
  on public.external_job_status_history(tenant_id);

-- RLS enable
alter table public.partner_groups enable row level security;
alter table public.external_job_status_history enable row level security;

-- Partner groups policies
drop policy if exists partner_groups_select_by_tenant on public.partner_groups;
drop policy if exists partner_groups_insert_by_tenant on public.partner_groups;
drop policy if exists partner_groups_update_by_tenant on public.partner_groups;
drop policy if exists partner_groups_delete_by_tenant on public.partner_groups;

create policy partner_groups_select_by_tenant
on public.partner_groups
for select
using (
  tenant_id = (select tenant_id from public.profiles where id = auth.uid())
);

create policy partner_groups_insert_by_tenant
on public.partner_groups
for insert
with check (
  tenant_id = (select tenant_id from public.profiles where id = auth.uid())
);

create policy partner_groups_update_by_tenant
on public.partner_groups
for update
using (
  tenant_id = (select tenant_id from public.profiles where id = auth.uid())
);

create policy partner_groups_delete_by_tenant
on public.partner_groups
for delete
using (
  tenant_id = (select tenant_id from public.profiles where id = auth.uid())
);

-- External job status history policies
drop policy if exists external_job_status_history_select_by_tenant on public.external_job_status_history;
drop policy if exists external_job_status_history_insert_by_tenant on public.external_job_status_history;

create policy external_job_status_history_select_by_tenant
on public.external_job_status_history
for select
using (
  tenant_id = (select tenant_id from public.profiles where id = auth.uid())
);

create policy external_job_status_history_insert_by_tenant
on public.external_job_status_history
for insert
with check (
  tenant_id = (select tenant_id from public.profiles where id = auth.uid())
);