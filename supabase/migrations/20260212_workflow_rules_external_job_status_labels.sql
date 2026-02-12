alter table public.workflow_rules
  add column if not exists external_job_status_labels jsonb
    not null
    default jsonb_build_object(
      'requested', 'Requested',
      'ordered', 'Ordered',
      'in_progress', 'In progress',
      'delivered', 'In Stock',
      'approved', 'Approved',
      'cancelled', 'Cancelled'
    );
