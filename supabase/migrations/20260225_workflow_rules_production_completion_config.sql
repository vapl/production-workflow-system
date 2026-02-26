alter table public.workflow_rules
  add column if not exists production_completion_config jsonb
  not null
  default '{"mode":"all_items_done","completionStationIds":[]}'::jsonb;

update public.workflow_rules
set production_completion_config = '{"mode":"all_items_done","completionStationIds":[]}'::jsonb
where production_completion_config is null;
