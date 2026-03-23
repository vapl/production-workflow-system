alter table public.operators
  add column if not exists hourly_rate numeric,
  add column if not exists overtime_rate numeric;
