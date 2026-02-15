alter table public.external_job_fields
  add column if not exists show_in_table boolean not null default true,
  add column if not exists ai_enabled boolean not null default false,
  add column if not exists ai_aliases text[] not null default '{}'::text[];

create index if not exists external_job_fields_ai_enabled_idx
  on public.external_job_fields(ai_enabled);

