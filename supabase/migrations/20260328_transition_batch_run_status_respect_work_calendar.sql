create or replace function public.compute_tenant_working_minutes(
  p_tenant_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_workdays integer[] := array[1, 2, 3, 4, 5];
  v_work_shifts jsonb := '[{"start":"08:00","end":"17:00"}]'::jsonb;
  v_day timestamptz;
  v_end_day timestamptz;
  v_shift jsonb;
  v_shift_start time;
  v_shift_end time;
  v_range_start timestamptz;
  v_range_end timestamptz;
  v_overlap_start timestamptz;
  v_overlap_end timestamptz;
  v_total integer := 0;
begin
  if p_start is null or p_end is null or p_end <= p_start then
    return 0;
  end if;

  select
    coalesce(ts.workdays, array[1, 2, 3, 4, 5]),
    coalesce(
      ts.work_shifts,
      '[{"start":"08:00","end":"17:00"}]'::jsonb
    )
  into v_workdays, v_work_shifts
  from public.tenant_settings ts
  where ts.tenant_id = p_tenant_id
  limit 1;

  v_day := date_trunc('day', p_start) - interval '1 day';
  v_end_day := date_trunc('day', p_end);

  while v_day <= v_end_day loop
    if extract(dow from v_day)::integer = any(v_workdays) then
      for v_shift in
        select value
        from jsonb_array_elements(v_work_shifts)
      loop
        v_shift_start := coalesce((v_shift->>'start')::time, '08:00'::time);
        v_shift_end := coalesce((v_shift->>'end')::time, '17:00'::time);

        if v_shift_start = v_shift_end then
          continue;
        end if;

        v_range_start := v_day + v_shift_start;
        v_range_end := v_day + v_shift_end;

        if v_shift_end <= v_shift_start then
          v_range_end := v_range_end + interval '1 day';
        end if;

        v_overlap_start := greatest(v_range_start, p_start);
        v_overlap_end := least(v_range_end, p_end);

        if v_overlap_end > v_overlap_start then
          v_total := v_total + floor(
            extract(epoch from (v_overlap_end - v_overlap_start)) / 60.0
          )::integer;
        end if;
      end loop;
    end if;

    v_day := v_day + interval '1 day';
  end loop;

  return greatest(v_total, 0);
end;
$$;

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
  v_duration := coalesce(v_run.duration_minutes, 0);

  if p_to_status = 'in_progress' then
    if v_run.status in ('paused', 'blocked') then
      v_started_at := v_now;
    else
      v_started_at := coalesce(v_run.started_at, v_now);
    end if;
    v_done_at := null;
  elsif p_to_status = 'done' then
    v_started_at := coalesce(v_run.started_at, v_now);
    v_done_at := coalesce(v_run.done_at, v_now);
    v_duration := coalesce(v_run.duration_minutes, 0) + greatest(
      1,
      public.compute_tenant_working_minutes(
        v_run.tenant_id,
        v_started_at,
        v_done_at
      )
    );
  elsif p_to_status in ('queued', 'pending') then
    v_started_at := null;
    v_done_at := null;
    v_duration := null;
  elsif p_to_status in ('paused', 'blocked') then
    if v_run.started_at is not null then
      v_duration := coalesce(v_run.duration_minutes, 0) + greatest(
        1,
        public.compute_tenant_working_minutes(
          v_run.tenant_id,
          v_run.started_at,
          v_now
        )
      );
    end if;
    v_started_at := null;
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
           when p_to_status = 'in_progress' then coalesce(v_started_at, v_now)
           when p_to_status in ('queued', 'pending') then null
           when p_to_status in ('paused', 'blocked') then null
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
