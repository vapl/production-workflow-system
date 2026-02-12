alter table public.workflow_rules
  add column if not exists order_status_config jsonb,
  add column if not exists external_job_status_config jsonb;

update public.workflow_rules
set order_status_config = jsonb_build_object(
  'draft', jsonb_build_object(
    'label', coalesce(status_labels ->> 'draft', 'Draft'),
    'color', 'slate',
    'isActive', true
  ),
  'ready_for_engineering', jsonb_build_object(
    'label', coalesce(status_labels ->> 'ready_for_engineering', 'Ready for eng.'),
    'color', 'blue',
    'isActive', true
  ),
  'in_engineering', jsonb_build_object(
    'label', coalesce(status_labels ->> 'in_engineering', 'In eng.'),
    'color', 'blue',
    'isActive', true
  ),
  'engineering_blocked', jsonb_build_object(
    'label', coalesce(status_labels ->> 'engineering_blocked', 'Eng. blocked'),
    'color', 'amber',
    'isActive', true
  ),
  'ready_for_production', jsonb_build_object(
    'label', coalesce(status_labels ->> 'ready_for_production', 'Ready for prod.'),
    'color', 'emerald',
    'isActive', true
  ),
  'in_production', jsonb_build_object(
    'label', coalesce(status_labels ->> 'in_production', 'In prod.'),
    'color', 'blue',
    'isActive', true
  ),
  'done', jsonb_build_object(
    'label', coalesce(status_labels ->> 'done', 'Done'),
    'color', 'emerald',
    'isActive', true
  )
)
where order_status_config is null;

update public.workflow_rules
set external_job_status_config = jsonb_build_object(
  'requested', jsonb_build_object(
    'label', coalesce(external_job_status_labels ->> 'requested', 'Requested'),
    'color', 'slate',
    'isActive', true
  ),
  'ordered', jsonb_build_object(
    'label', coalesce(external_job_status_labels ->> 'ordered', 'Ordered'),
    'color', 'blue',
    'isActive', true
  ),
  'in_progress', jsonb_build_object(
    'label', coalesce(external_job_status_labels ->> 'in_progress', 'In progress'),
    'color', 'blue',
    'isActive', true
  ),
  'delivered', jsonb_build_object(
    'label', coalesce(external_job_status_labels ->> 'delivered', 'In Stock'),
    'color', 'emerald',
    'isActive', true
  ),
  'approved', jsonb_build_object(
    'label', coalesce(external_job_status_labels ->> 'approved', 'Approved'),
    'color', 'emerald',
    'isActive', true
  ),
  'cancelled', jsonb_build_object(
    'label', coalesce(external_job_status_labels ->> 'cancelled', 'Cancelled'),
    'color', 'rose',
    'isActive', true
  )
)
where external_job_status_config is null;

alter table public.workflow_rules
  alter column order_status_config set not null,
  alter column order_status_config set default jsonb_build_object(
    'draft', jsonb_build_object('label', 'Draft', 'color', 'slate', 'isActive', true),
    'ready_for_engineering', jsonb_build_object('label', 'Ready for eng.', 'color', 'blue', 'isActive', true),
    'in_engineering', jsonb_build_object('label', 'In eng.', 'color', 'blue', 'isActive', true),
    'engineering_blocked', jsonb_build_object('label', 'Eng. blocked', 'color', 'amber', 'isActive', true),
    'ready_for_production', jsonb_build_object('label', 'Ready for prod.', 'color', 'emerald', 'isActive', true),
    'in_production', jsonb_build_object('label', 'In prod.', 'color', 'blue', 'isActive', true),
    'done', jsonb_build_object('label', 'Done', 'color', 'emerald', 'isActive', true)
  ),
  alter column external_job_status_config set not null,
  alter column external_job_status_config set default jsonb_build_object(
    'requested', jsonb_build_object('label', 'Requested', 'color', 'slate', 'isActive', true),
    'ordered', jsonb_build_object('label', 'Ordered', 'color', 'blue', 'isActive', true),
    'in_progress', jsonb_build_object('label', 'In progress', 'color', 'blue', 'isActive', true),
    'delivered', jsonb_build_object('label', 'In Stock', 'color', 'emerald', 'isActive', true),
    'approved', jsonb_build_object('label', 'Approved', 'color', 'emerald', 'isActive', true),
    'cancelled', jsonb_build_object('label', 'Cancelled', 'color', 'rose', 'isActive', true)
  );
