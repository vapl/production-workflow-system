-- Align production statuses for operator pause flow and pending batch runs.

alter table public.production_items
  drop constraint if exists production_items_status_check;

alter table public.production_items
  add constraint production_items_status_check
  check (status in ('queued', 'pending', 'in_progress', 'paused', 'blocked', 'done'));

alter table public.batch_runs
  drop constraint if exists batch_runs_status_check;

alter table public.batch_runs
  add constraint batch_runs_status_check
  check (status in ('queued', 'pending', 'in_progress', 'paused', 'blocked', 'done'));
