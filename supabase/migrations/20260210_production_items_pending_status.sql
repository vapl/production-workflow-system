-- Add pending status for production items

alter table public.production_items
  drop constraint if exists production_items_status_check;

alter table public.production_items
  add constraint production_items_status_check
  check (status in ('queued', 'pending', 'in_progress', 'blocked', 'done'));
