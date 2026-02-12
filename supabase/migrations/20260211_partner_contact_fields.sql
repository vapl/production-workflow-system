alter table if exists public.partners
  add column if not exists email text,
  add column if not exists phone text;
