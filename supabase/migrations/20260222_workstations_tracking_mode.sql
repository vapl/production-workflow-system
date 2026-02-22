-- Per-station operator tracking mode.
-- construction_level: track each construction row independently.
-- order_level: track whole batch/order in station with one Start/Done/Blocked action.
-- receipt_only: warehouse-style receipt confirmation only.

alter table public.workstations
  add column if not exists tracking_mode text;

update public.workstations
set tracking_mode = coalesce(
  tracking_mode,
  case
    when lower(coalesce(name, '')) similar to '%(nolikta%|warehouse|stock)%'
      then 'receipt_only'
    when lower(coalesce(name, '')) similar to '%(salik%|assembly)%'
      then 'construction_level'
    else 'order_level'
  end
)
where tracking_mode is null;

alter table public.workstations
  alter column tracking_mode set default 'construction_level';

alter table public.workstations
  alter column tracking_mode set not null;

alter table public.workstations
  drop constraint if exists workstations_tracking_mode_check;

alter table public.workstations
  add constraint workstations_tracking_mode_check
  check (tracking_mode in ('construction_level', 'order_level', 'receipt_only'));
