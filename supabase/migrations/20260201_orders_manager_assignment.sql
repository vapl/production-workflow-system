-- Add manager assignment fields to orders
alter table public.orders
  add column if not exists assigned_manager_id uuid,
  add column if not exists assigned_manager_name text,
  add column if not exists assigned_manager_at timestamptz;
