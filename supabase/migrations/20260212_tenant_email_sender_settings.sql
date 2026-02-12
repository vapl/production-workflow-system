alter table public.tenants
  add column if not exists outbound_from_name text,
  add column if not exists outbound_from_email text,
  add column if not exists outbound_reply_to_email text,
  add column if not exists outbound_use_user_sender boolean not null default true,
  add column if not exists outbound_sender_verified boolean not null default false;

