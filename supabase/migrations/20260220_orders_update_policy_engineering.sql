-- Allow Engineering role to update orders (take/start engineering flow)

drop policy if exists "orders_update_by_tenant" on public.orders;

create policy "orders_update_by_tenant" on public.orders
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = orders.tenant_id
        and (
          public.user_has_permission(
            'orders.manage',
            array['Owner', 'Admin', 'Sales']::text[]
          )
          or p.role = 'Engineering'
        )
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = orders.tenant_id
        and (
          public.user_has_permission(
            'orders.manage',
            array['Owner', 'Admin', 'Sales']::text[]
          )
          or p.role = 'Engineering'
        )
    )
  );
