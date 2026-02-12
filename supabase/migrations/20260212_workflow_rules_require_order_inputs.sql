alter table public.workflow_rules
  add column if not exists require_order_inputs_engineering boolean not null default true,
  add column if not exists require_order_inputs_production boolean not null default true;

update public.workflow_rules
set
  require_order_inputs_engineering = coalesce(require_order_inputs_engineering, true),
  require_order_inputs_production = coalesce(require_order_inputs_production, true);
