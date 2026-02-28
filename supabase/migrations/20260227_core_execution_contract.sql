-- Core execution contract: only batch_runs can drive execution status.

create or replace function public.transition_batch_run_status(
  p_batch_run_id uuid,
  p_to_status text,
  p_reason text default null,
  p_reason_id uuid default null,
  p_production_item_id uuid default null,
  p_actor_user_id uuid default auth.uid()
)
returns table (
  id uuid,
  order_id uuid,
  batch_code text,
  station_id uuid,
  route_key text,
  step_index integer,
  status text,
  blocked_reason text,
  blocked_reason_id uuid,
  blocked_at timestamptz,
  blocked_by uuid,
  planned_date date,
  started_at timestamptz,
  done_at timestamptz,
  duration_minutes integer,
  updated_at timestamptz
)
language plpgsql
set search_path = public
as $$
declare
  v_run public.batch_runs%rowtype;
  v_now timestamptz := now();
  v_started_at timestamptz;
  v_done_at timestamptz;
  v_duration integer;
  v_transition_allowed boolean := false;
begin
  select *
    into v_run
  from public.batch_runs br
  where br.id = p_batch_run_id
  for update;

  if not found then
    raise exception 'Batch run % not found', p_batch_run_id
      using errcode = 'P0002';
  end if;

  if p_to_status not in ('queued', 'pending', 'in_progress', 'paused', 'blocked', 'done') then
    raise exception 'Unsupported batch run status: %', p_to_status
      using errcode = '22023';
  end if;

  if v_run.status = p_to_status then
    return query
      select
        br.id,
        br.order_id,
        br.batch_code,
        br.station_id,
        br.route_key,
        br.step_index,
        br.status,
        br.blocked_reason,
        br.blocked_reason_id,
        br.blocked_at,
        br.blocked_by,
        br.planned_date,
        br.started_at,
        br.done_at,
        br.duration_minutes,
        br.updated_at
      from public.batch_runs br
      where br.id = v_run.id;
    return;
  end if;

  case v_run.status
    when 'queued' then
      v_transition_allowed := p_to_status in ('pending', 'in_progress', 'blocked');
    when 'pending' then
      v_transition_allowed := p_to_status in ('queued', 'in_progress', 'blocked');
    when 'in_progress' then
      v_transition_allowed := p_to_status in ('paused', 'blocked', 'done');
    when 'paused' then
      v_transition_allowed := p_to_status in ('in_progress', 'blocked');
    when 'blocked' then
      v_transition_allowed := p_to_status in ('queued', 'pending', 'in_progress');
    when 'done' then
      v_transition_allowed := false;
  end case;

  if not v_transition_allowed then
    raise exception 'Invalid batch run transition: % -> %', v_run.status, p_to_status
      using errcode = '22023';
  end if;

  v_started_at := v_run.started_at;
  v_done_at := v_run.done_at;
  v_duration := v_run.duration_minutes;

  if p_to_status = 'in_progress' then
    v_started_at := coalesce(v_run.started_at, v_now);
    v_done_at := null;
  elsif p_to_status = 'done' then
    v_started_at := coalesce(v_run.started_at, v_now);
    v_done_at := coalesce(v_run.done_at, v_now);
    v_duration := greatest(
      1,
      round(extract(epoch from (v_done_at - v_started_at)) / 60.0)::integer
    );
  elsif p_to_status in ('queued', 'pending') then
    v_started_at := null;
    v_done_at := null;
    v_duration := null;
  elsif p_to_status in ('paused', 'blocked') then
    v_done_at := null;
  end if;

  perform set_config('app.allow_status_transition', 'on', true);
  perform set_config('app.allow_production_item_execution_write', 'on', true);

  update public.batch_runs br
     set status = p_to_status,
         blocked_reason = case when p_to_status = 'blocked' then p_reason else null end,
         blocked_reason_id = case when p_to_status = 'blocked' then p_reason_id else null end,
         blocked_at = case when p_to_status = 'blocked' then v_now else null end,
         blocked_by = case when p_to_status = 'blocked' then coalesce(p_actor_user_id, auth.uid()) else null end,
         started_at = v_started_at,
         done_at = v_done_at,
         duration_minutes = v_duration
   where br.id = v_run.id;

  update public.production_items pi
     set status = p_to_status,
         started_at = case
           when p_to_status = 'in_progress' then coalesce(pi.started_at, v_started_at, v_now)
           when p_to_status in ('queued', 'pending') then null
           else pi.started_at
         end,
         done_at = case
           when p_to_status = 'done' then coalesce(pi.done_at, v_done_at, v_now)
           when p_to_status in ('queued', 'pending', 'in_progress', 'paused', 'blocked') then null
           else pi.done_at
         end
   where pi.tenant_id = v_run.tenant_id
     and pi.order_id = v_run.order_id
     and pi.batch_code = v_run.batch_code
     and (
       (pi.station_id is null and v_run.station_id is null)
       or pi.station_id = v_run.station_id
     );

  if v_run.tenant_id is not null then
    insert into public.production_status_events (
      tenant_id,
      order_id,
      batch_run_id,
      production_item_id,
      from_status,
      to_status,
      reason,
      reason_id,
      actor_user_id
    )
    values (
      v_run.tenant_id,
      v_run.order_id,
      v_run.id,
      p_production_item_id,
      v_run.status,
      p_to_status,
      p_reason,
      p_reason_id,
      coalesce(p_actor_user_id, auth.uid())
    );
  end if;

  return query
    select
      br.id,
      br.order_id,
      br.batch_code,
      br.station_id,
      br.route_key,
      br.step_index,
      br.status,
      br.blocked_reason,
      br.blocked_reason_id,
      br.blocked_at,
      br.blocked_by,
      br.planned_date,
      br.started_at,
      br.done_at,
      br.duration_minutes,
      br.updated_at
    from public.batch_runs br
    where br.id = v_run.id;
end;
$$;

create or replace function public.guard_batch_run_execution_writes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.allow_status_transition', true), 'off') = 'on' then
    return new;
  end if;

  if row(
      new.status,
      new.blocked_reason,
      new.blocked_reason_id,
      new.blocked_at,
      new.blocked_by,
      new.started_at,
      new.done_at,
      new.duration_minutes
    ) is distinct from row(
      old.status,
      old.blocked_reason,
      old.blocked_reason_id,
      old.blocked_at,
      old.blocked_by,
      old.started_at,
      old.done_at,
      old.duration_minutes
    ) then
    raise exception 'Direct batch run execution updates are forbidden. Use public.transition_batch_run_status(...)'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists batch_runs_execution_write_guard on public.batch_runs;
create trigger batch_runs_execution_write_guard
before update of
  status,
  blocked_reason,
  blocked_reason_id,
  blocked_at,
  blocked_by,
  started_at,
  done_at,
  duration_minutes
on public.batch_runs
for each row
execute function public.guard_batch_run_execution_writes();

create or replace function public.guard_production_item_execution_writes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.allow_production_item_execution_write', true), 'off') = 'on' then
    return new;
  end if;

  if row(
      new.status,
      new.station_id,
      new.started_at,
      new.done_at,
      new.duration_minutes
    ) is distinct from row(
      old.status,
      old.station_id,
      old.started_at,
      old.done_at,
      old.duration_minutes
    ) then
    raise exception 'Production item execution fields are read-only. Transition batch_runs instead.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists production_items_execution_write_guard on public.production_items;
create trigger production_items_execution_write_guard
before update of
  status,
  station_id,
  started_at,
  done_at,
  duration_minutes
on public.production_items
for each row
execute function public.guard_production_item_execution_writes();
