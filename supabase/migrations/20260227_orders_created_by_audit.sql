-- Add creator audit to orders so order details can show who created the order.

alter table public.orders
add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists orders_created_by_idx
  on public.orders(created_by);
