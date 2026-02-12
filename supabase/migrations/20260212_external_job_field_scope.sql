alter table public.external_job_fields
  add column if not exists scope text not null default 'manual'
    check (scope in ('manual', 'portal_response'));

create index if not exists external_job_fields_scope_idx
  on public.external_job_fields(scope);

alter table public.external_jobs
  add column if not exists partner_request_comment text;

