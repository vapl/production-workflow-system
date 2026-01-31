-- External job rules
create table if not exists public.external_job_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  status text not null,
  min_attachments integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists external_job_rules_tenant_id_idx
  on public.external_job_rules(tenant_id);

alter table public.external_job_rules enable row level security;

-- External job rules policies
drop policy if exists external_job_rules_select_by_tenant on public.external_job_rules;
drop policy if exists external_job_rules_insert_by_tenant on public.external_job_rules;
drop policy if exists external_job_rules_update_by_tenant on public.external_job_rules;

create policy external_job_rules_select_by_tenant
on public.external_job_rules
for select
using (
  tenant_id = (select tenant_id from public.profiles where id = auth.uid())
);

create policy external_job_rules_insert_by_tenant
on public.external_job_rules
for insert
with check (
  tenant_id = (select tenant_id from public.profiles where id = auth.uid())
);

create policy external_job_rules_update_by_tenant
on public.external_job_rules
for update
using (
  tenant_id = (select tenant_id from public.profiles where id = auth.uid())
);
