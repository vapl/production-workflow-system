alter table public.tenant_settings
  alter column notification_roles
  set default '["Production manager","Admin","Owner"]'::jsonb;

update public.tenant_settings
set notification_roles = '["Production manager","Admin","Owner"]'::jsonb
where notification_roles is null
   or notification_roles = '["Production","Admin"]'::jsonb;

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
        or coalesce(p.is_owner, false)
        or (
          coalesce(p.is_admin, false)
          and exists (
            select 1
            from jsonb_array_elements_text(notifications.audience_roles) as r
            where r = 'Admin'
          )
        )
        or exists (
          select 1
          from jsonb_array_elements_text(notifications.audience_roles) as r
          where r = p.role
        )
      )
  )
);
