alter table public.external_job_fields
  add column if not exists ai_match_only boolean not null default false;
