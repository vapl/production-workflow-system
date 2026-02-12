create table if not exists public.external_job_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  label text not null,
  field_type text not null
    check (field_type in ('text', 'textarea', 'number', 'date', 'select', 'toggle')),
  unit text,
  options jsonb,
  is_required boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists external_job_fields_tenant_key_uidx
  on public.external_job_fields(tenant_id, key);
create index if not exists external_job_fields_tenant_id_idx
  on public.external_job_fields(tenant_id);
create index if not exists external_job_fields_sort_order_idx
  on public.external_job_fields(sort_order);

create trigger set_external_job_fields_updated_at
  before update on public.external_job_fields
  for each row execute function public.set_updated_at();

create table if not exists public.external_job_field_values (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  external_job_id uuid not null references public.external_jobs(id) on delete cascade,
  field_id uuid not null references public.external_job_fields(id) on delete cascade,
  value jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists external_job_field_values_job_field_uidx
  on public.external_job_field_values(external_job_id, field_id);
create index if not exists external_job_field_values_tenant_id_idx
  on public.external_job_field_values(tenant_id);
create index if not exists external_job_field_values_job_id_idx
  on public.external_job_field_values(external_job_id);

create trigger set_external_job_field_values_updated_at
  before update on public.external_job_field_values
  for each row execute function public.set_updated_at();
