-- Add assignment labels to workflow rules
alter table public.workflow_rules
  add column if not exists assignment_labels jsonb not null default jsonb_build_object(
    'engineer', 'Engineer',
    'manager', 'Manager'
  );
