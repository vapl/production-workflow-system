-- Notifications for production events (blocked, etc.)

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_tenant_id_idx
  on public.notifications(tenant_id);
create index if not exists notifications_user_id_idx
  on public.notifications(user_id);
create index if not exists notifications_read_at_idx
  on public.notifications(read_at);

alter table public.notifications enable row level security;

create policy "notifications_select_by_tenant" on public.notifications
for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = notifications.tenant_id
      and (notifications.user_id is null or notifications.user_id = auth.uid())
  )
);

create policy "notifications_insert_by_tenant" on public.notifications
for insert
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = notifications.tenant_id
  )
);

create policy "notifications_update_by_tenant" on public.notifications
for update
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = notifications.tenant_id
      and (notifications.user_id is null or notifications.user_id = auth.uid())
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = notifications.tenant_id
      and (notifications.user_id is null or notifications.user_id = auth.uid())
  )
);
