alter table public.orders
  add column if not exists production_due_date date;

update public.orders
set production_due_date = due_date
where production_due_date is null;

create index if not exists orders_production_due_date_idx
  on public.orders(production_due_date);
