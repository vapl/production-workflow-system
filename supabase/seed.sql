-- Seed data for PWS (1 tenant + reference data + orders + batches).
-- Replace <user-uuid> before running to attach your profile to the tenant.

with tenant_row as (
  insert into public.tenants (name)
  values ('Demo Factory')
  returning id
),
profile_update as (
  update public.profiles
  set tenant_id = (select id from tenant_row)
  where id = '<user-uuid>'
  returning tenant_id
),
levels as (
  insert into public.hierarchy_levels (
    tenant_id,
    name,
    key,
    sort_order,
    is_required,
    is_active,
    show_in_table
  )
  values
    ((select id from tenant_row), 'Contract', 'contract', 1, false, true, true),
    ((select id from tenant_row), 'Category', 'category', 2, false, true, true),
    ((select id from tenant_row), 'Product', 'product', 3, true, true, true)
  returning id, key
),
contract_node as (
  insert into public.hierarchy_nodes (
    tenant_id,
    level_id,
    label,
    code,
    parent_id
  )
  values (
    (select id from tenant_row),
    (select id from levels where key = 'contract'),
    'VV-1234-26',
    'VV-1234-26',
    null
  )
  returning id
),
category_nodes as (
  insert into public.hierarchy_nodes (
    tenant_id,
    level_id,
    label,
    parent_id
  )
  values
    (
      (select id from tenant_row),
      (select id from levels where key = 'category'),
      'Kitchen furniture',
      (select id from contract_node)
    ),
    (
      (select id from tenant_row),
      (select id from levels where key = 'category'),
      'Skapis',
      (select id from contract_node)
    )
  returning id, label
),
product_nodes as (
  insert into public.hierarchy_nodes (
    tenant_id,
    level_id,
    label,
    parent_id
  )
  values
    (
      (select id from tenant_row),
      (select id from levels where key = 'product'),
      'Sliding doors',
      (select id from category_nodes where label = 'Kitchen furniture')
    ),
    (
      (select id from tenant_row),
      (select id from levels where key = 'product'),
      'Kitchen furniture',
      (select id from category_nodes where label = 'Skapis')
    )
  returning id
),
workstations as (
  insert into public.workstations (tenant_id, name, description, is_active)
  values
    ((select id from tenant_row), 'Cutting', 'Sawing and prep', true),
    ((select id from tenant_row), 'Welding', 'Frame welding', true),
    ((select id from tenant_row), 'Assembly', 'Final assembly', true),
    ((select id from tenant_row), 'Finishing', 'Surface finishing', true)
  returning id, name
),
operators as (
  insert into public.operators (tenant_id, name, role, station_id, is_active)
  values
    (
      (select id from tenant_row),
      'Janis',
      'Operator',
      (select id from workstations where name = 'Cutting'),
      true
    ),
    (
      (select id from tenant_row),
      'Andris',
      'Operator',
      (select id from workstations where name = 'Welding'),
      true
    ),
    (
      (select id from tenant_row),
      'Liga',
      'Assembler',
      (select id from workstations where name = 'Assembly'),
      true
    ),
    (
      (select id from tenant_row),
      'Marta',
      'Finisher',
      (select id from workstations where name = 'Finishing'),
      true
    )
  returning id
),
stop_reasons as (
  insert into public.stop_reasons (tenant_id, label, is_active)
  values
    ((select id from tenant_row), 'Missing material', true),
    ((select id from tenant_row), 'Machine maintenance', true),
    ((select id from tenant_row), 'Waiting for approval', true)
  returning id
),
construction_items as (
  insert into public.construction_items (tenant_id, name, is_active)
  values
    ((select id from tenant_row), 'PE 40 Durvis', true),
    ((select id from tenant_row), 'PE 40 Vitrina', true),
    ((select id from tenant_row), 'PE 50 Logs', true),
    ((select id from tenant_row), 'PE 50 Durvis', true),
    ((select id from tenant_row), 'PE 50 Divviru Durvis', true),
    ((select id from tenant_row), 'PE 50 Vitrina', true),
    ((select id from tenant_row), 'PE 50 Sliding', true),
    ((select id from tenant_row), 'PE 68 Durvis', true),
    ((select id from tenant_row), 'PE 68 Divviru Durvis', true),
    ((select id from tenant_row), 'PE 68 Vitrina', true),
    ((select id from tenant_row), 'PE 68 Logs', true),
    ((select id from tenant_row), 'PE 68 Divviru Logs', true),
    ((select id from tenant_row), 'PE 68 Sliding', true),
    ((select id from tenant_row), 'PE 68 HI Durvis', true),
    ((select id from tenant_row), 'PE 68 HI Vitrina', true),
    ((select id from tenant_row), 'PE 68 HI Logs', true),
    ((select id from tenant_row), 'PE 68 HI Divviru Logs', true),
    ((select id from tenant_row), 'PE 78 N Durvis', true),
    ((select id from tenant_row), 'PE 78 N Divviru Durvis', true),
    ((select id from tenant_row), 'PE 78 N Vitrinas', true),
    ((select id from tenant_row), 'PE 78 N Logs', true),
    ((select id from tenant_row), 'PE 78 N Divviru Logs', true),
    ((select id from tenant_row), 'PE 78 NHI Durvis', true),
    ((select id from tenant_row), 'PE 78 NHI Divviru Durvis', true),
    ((select id from tenant_row), 'PE 78 NHI Vitrinas', true),
    ((select id from tenant_row), 'PE 78 NHI Logs', true),
    ((select id from tenant_row), 'PE 78 NHI Divviru Logs', true),
    ((select id from tenant_row), 'PE 78 NHI Sliding', true),
    ((select id from tenant_row), 'EVO 600 Slide', true),
    ((select id from tenant_row), 'SL 1200 1 vertne', true),
    ((select id from tenant_row), 'SL 1200 2 vertnes', true),
    ((select id from tenant_row), 'SL 1600 HI 1 vertne', true),
    ((select id from tenant_row), 'SL1600 HI 2 vertnes', true),
    ((select id from tenant_row), 'SL 1600 HI 3 vertnes', true),
    ((select id from tenant_row), 'SL 1600 HI 4 vertnes', true),
    ((select id from tenant_row), 'SL 1800 HI 1 vertne', true),
    ((select id from tenant_row), 'SL 1800 HI 2 vertnes', true),
    ((select id from tenant_row), 'SL 1800 HI 3 vertnes', true),
    ((select id from tenant_row), 'PE 78 EI (EI30) Durvis', true),
    ((select id from tenant_row), 'PE 78 EI (EI30) Divviru Durvis', true),
    ((select id from tenant_row), 'PE 78 EI (EI30) Vitrinas', true),
    ((select id from tenant_row), 'PE 78 EI (EI30) Logs', true),
    ((select id from tenant_row), 'PE 78 EI (EI60) Durvis', true),
    ((select id from tenant_row), 'PE 78 EI (EI60) Divviru Durvis', true),
    ((select id from tenant_row), 'PE 78 EI (EI60) Vitrinas', true),
    ((select id from tenant_row), 'PE 78 EI (EI60) Logs', true),
    ((select id from tenant_row), 'PE 120 EI Vitinas', true),
    ((select id from tenant_row), 'PF 152 HI', true),
    ((select id from tenant_row), 'Durvju aizvereji', true),
    ((select id from tenant_row), 'FOLD', true),
    ((select id from tenant_row), 'OF 90 IW', true),
    ((select id from tenant_row), 'Trapeces', true),
    ((select id from tenant_row), 'Nestandarts', true)
  returning id
),
orders as (
  insert into public.orders (
    tenant_id,
    order_number,
    customer_name,
    product_name,
    quantity,
    due_date,
    priority,
    status,
    hierarchy
  )
  values
    (
      (select id from tenant_row),
      'ORD-0001',
      'FPgruppen',
      'PE 78 EI (EI60) Durvis',
      1,
      '2026-02-05'::date,
      'normal',
      'pending',
      jsonb_build_object(
        (select id from levels where key = 'contract'),
        (select id from contract_node)
      )
    ),
    (
      (select id from tenant_row),
      'ORD-0002',
      'Hallgruppen',
      'PE 50 Logs',
      4,
      '2026-02-10'::date,
      'high',
      'in_progress',
      '{}'::jsonb
    ),
    (
      (select id from tenant_row),
      'ORD-0003',
      'ACME Industries',
      'Custom Bracket Assembly',
      100,
      '2026-02-18'::date,
      'urgent',
      'in_progress',
      '{}'::jsonb
    )
  returning id, order_number
)
insert into public.batches (
  tenant_id,
  order_id,
  name,
  workstation_name,
  operator_name,
  estimated_hours,
  actual_hours,
  status
)
values
  (
    (select id from tenant_row),
    (select id from orders where order_number = 'ORD-0001'),
    'Cutting - Frame Parts',
    'Cutting',
    'Janis',
    6,
    7.5,
    'in_progress'
  ),
  (
    (select id from tenant_row),
    (select id from orders where order_number = 'ORD-0001'),
    'Welding - Main Frame',
    'Welding',
    'Andris',
    8,
    8,
    'completed'
  ),
  (
    (select id from tenant_row),
    (select id from orders where order_number = 'ORD-0002'),
    'Assembly',
    'Assembly',
    'Liga',
    5,
    6,
    'blocked'
  );
