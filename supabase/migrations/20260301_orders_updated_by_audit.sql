-- Persist creator/updater names on orders so audit labels do not depend on
-- client-side profile lookups that may be restricted by RLS.

alter table public.orders
add column if not exists created_by_name text,
add column if not exists updated_by uuid references auth.users(id) on delete set null,
add column if not exists updated_by_name text;

create index if not exists orders_updated_by_idx
  on public.orders(updated_by);

update public.orders o
set created_by_name = p.full_name
from public.profiles p
where o.created_by = p.id
  and o.created_by_name is null;

update public.orders
set updated_by = coalesce(updated_by, created_by),
    updated_by_name = coalesce(updated_by_name, created_by_name)
where updated_by is null
   or updated_by_name is null;
