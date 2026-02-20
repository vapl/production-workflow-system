-- Prevent non-admin operators from starting production items before planned_date.

create or replace function public.enforce_production_item_start_window()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  run_planned_date date;
  profile_role text;
  profile_is_admin boolean;
  profile_is_owner boolean;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  -- Only guard first transition into in_progress.
  if coalesce(new.status, '') <> 'in_progress'
     or coalesce(old.status, '') = 'in_progress'
     or old.started_at is not null then
    return new;
  end if;

  -- Service role / backend jobs can bypass this check.
  if auth.uid() is null then
    return new;
  end if;

  select br.planned_date
    into run_planned_date
  from public.batch_runs br
  where br.tenant_id = new.tenant_id
    and br.order_id = new.order_id
    and br.batch_code = new.batch_code
    and (
      (br.station_id is null and new.station_id is null)
      or br.station_id = new.station_id
    )
  order by br.created_at desc
  limit 1;

  if run_planned_date is null or run_planned_date <= current_date then
    return new;
  end if;

  select
    p.role,
    coalesce(p.is_admin, false),
    coalesce(p.is_owner, false)
    into profile_role, profile_is_admin, profile_is_owner
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if coalesce(profile_is_admin, false)
     or coalesce(profile_is_owner, false)
     or coalesce(profile_role, '') = 'Admin' then
    return new;
  end if;

  raise exception
    'Cannot start production before planned date %',
    to_char(run_planned_date, 'YYYY-MM-DD')
    using errcode = '42501';
end;
$$;

drop trigger if exists production_items_start_window_guard on public.production_items;
create trigger production_items_start_window_guard
before update of status, started_at on public.production_items
for each row
execute function public.enforce_production_item_start_window();
