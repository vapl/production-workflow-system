-- Notifications audience roles

alter table public.notifications
  add column if not exists audience_roles jsonb;

alter table public.tenant_settings
  add column if not exists notification_roles jsonb not null
    default '["Production","Admin"]'::jsonb;

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

drop policy if exists "notifications_select_by_tenant" on public.notifications;
create policy "notifications_select_by_tenant" on public.notifications
for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = notifications.tenant_id
      and (notifications.user_id is null or notifications.user_id = auth.uid())
      and (
        notifications.audience_roles is null
        or exists (
          select 1
          from jsonb_array_elements_text(notifications.audience_roles) as r
          where r = public.current_user_role()
        )
      )
  )
);

drop policy if exists "notifications_delete_by_tenant" on public.notifications;
create policy "notifications_delete_by_tenant" on public.notifications
for delete
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = notifications.tenant_id
      and (notifications.user_id is null or notifications.user_id = auth.uid())
  )
);
