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
     or coalesce(me_role, '') = 'Production manager'
     or coalesce(me_role, '') = 'Production planner' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  raise exception 'Missing permission: production.queue.manage'
    using errcode = '42501';
end;
$$;
