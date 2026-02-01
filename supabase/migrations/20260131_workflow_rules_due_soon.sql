-- Add due soon threshold to workflow rules
alter table public.workflow_rules
  add column if not exists due_soon_days integer not null default 5,
  add column if not exists due_indicator_enabled boolean not null default true,
  add column if not exists due_indicator_statuses text[] not null default array[
    'ready_for_engineering',
    'in_engineering',
    'engineering_blocked',
    'ready_for_production'
  ],
  add column if not exists status_labels jsonb not null default jsonb_build_object(
    'draft', 'Draft',
    'ready_for_engineering', 'Ready for eng.',
    'in_engineering', 'In eng.',
    'engineering_blocked', 'Eng. blocked',
    'ready_for_production', 'Ready for prod.'
  );
