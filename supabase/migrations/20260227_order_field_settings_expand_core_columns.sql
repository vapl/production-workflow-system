-- Expand order_field_settings to include all core order table fields.
-- Keeps settings as UI configuration only (visibility/required/order).

create or replace function public.seed_default_order_field_settings(
  p_tenant_id uuid,
  p_created_by uuid default null
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_tenant_id is null then
    return;
  end if;

  insert into public.order_field_settings (
    tenant_id,
    field_key,
    label,
    is_active,
    is_required,
    show_in_table,
    sort_order,
    created_by
  )
  values
    (p_tenant_id, 'order_number', 'Order #', true, true, true, 10, p_created_by),
    (p_tenant_id, 'customer_name', 'Customer', true, true, true, 20, p_created_by),
    (p_tenant_id, 'quantity', 'Quantity', true, false, true, 30, p_created_by),
    (p_tenant_id, 'due_date', 'Due date', true, true, true, 40, p_created_by),
    (p_tenant_id, 'engineer', 'Engineer', true, false, true, 50, p_created_by),
    (p_tenant_id, 'manager', 'Manager', true, false, true, 60, p_created_by),
    (p_tenant_id, 'priority', 'Priority', true, false, true, 70, p_created_by),
    (p_tenant_id, 'status', 'Status', true, false, true, 80, p_created_by),
    (p_tenant_id, 'actions', 'Activity', true, false, true, 90, p_created_by),
    (p_tenant_id, 'delivery_address', 'Delivery address', true, false, false, 100, p_created_by),
    (p_tenant_id, 'customer_phone', 'Customer phone', true, false, false, 110, p_created_by)
  on conflict (tenant_id, field_key) do nothing;
end;
$$;

-- Backfill missing defaults for existing tenants.
do $$
declare
  r record;
begin
  for r in select id from public.tenants loop
    perform public.seed_default_order_field_settings(r.id, null);
  end loop;
end $$;
