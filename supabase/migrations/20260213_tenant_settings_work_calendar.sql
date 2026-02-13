alter table public.tenant_settings
  add column if not exists workdays integer[] not null default array[1, 2, 3, 4, 5],
  add column if not exists work_shifts jsonb not null default '[{"start":"08:00","end":"17:00"}]'::jsonb;

update public.tenant_settings
set workdays = array[1, 2, 3, 4, 5]
where workdays is null or cardinality(workdays) = 0;

update public.tenant_settings
set work_shifts = jsonb_build_array(
  jsonb_build_object(
    'start',
    to_char(workday_start, 'HH24:MI'),
    'end',
    to_char(workday_end, 'HH24:MI')
  )
)
where work_shifts is null
  or jsonb_typeof(work_shifts) <> 'array'
  or jsonb_array_length(work_shifts) = 0;
