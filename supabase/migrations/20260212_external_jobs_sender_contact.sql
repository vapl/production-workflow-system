alter table public.external_jobs
  add column if not exists partner_request_sender_name text,
  add column if not exists partner_request_sender_email text,
  add column if not exists partner_request_sender_phone text;

