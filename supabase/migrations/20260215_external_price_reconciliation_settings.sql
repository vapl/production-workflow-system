alter table public.external_job_fields
  add column if not exists field_role text not null default 'none'
  check (field_role in ('none', 'planned_price', 'invoice_price'));

create index if not exists external_job_fields_field_role_idx
  on public.external_job_fields(field_role);

alter table public.tenant_settings
  add column if not exists external_price_reconciliation_enabled boolean not null default false;

alter table public.tenant_settings
  add column if not exists external_table_columns jsonb not null default '[]'::jsonb;
