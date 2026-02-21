-- Restrict queue management operations (delete / planned_date move) to elevated roles.

create or replace function public.assert_queue_management_permission()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  me_role text;
  me_is_admin boolean;
  me_is_owner boolean;
begin
  -- Service role/background jobs may bypass auth-bound checks.
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  select
    p.role,
    coalesce(p.is_admin, false),
    coalesce(p.is_owner, false)
  into me_role, me_is_admin, me_is_owner
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if coalesce(me_is_admin, false)
     or coalesce(me_is_owner, false)
     or coalesce(me_role, '') = 'Admin'
     or coalesce(me_role, '') = 'Production manager' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  raise exception 'Missing permission: production.queue.manage'
    using errcode = '42501';
end;
$$;

drop trigger if exists queue_management_guard_batch_runs_delete on public.batch_runs;
create trigger queue_management_guard_batch_runs_delete
before delete on public.batch_runs
for each row
execute function public.assert_queue_management_permission();

drop trigger if exists queue_management_guard_batch_runs_move_date on public.batch_runs;
create trigger queue_management_guard_batch_runs_move_date
before update of planned_date on public.batch_runs
for each row
when (old.planned_date is distinct from new.planned_date)
execute function public.assert_queue_management_permission();

