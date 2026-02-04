alter table public.external_jobs
  add column if not exists delivery_note_no text,
  add column if not exists received_at timestamptz,
  add column if not exists received_by uuid references auth.users(id) on delete set null;

alter table public.external_job_attachments
  add column if not exists category text;

create index if not exists external_job_attachments_category_idx
  on public.external_job_attachments(category);
