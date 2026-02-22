-- Tenant-level email templates for external partner portal requests.

alter table public.tenants
  add column if not exists external_request_email_subject_template text,
  add column if not exists external_request_email_html_template text,
  add column if not exists external_request_email_text_template text;

