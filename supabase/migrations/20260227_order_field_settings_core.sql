-- Fixed order core UI configuration layer (non-execution).
-- This table replaces the legacy configurable order column semantics.

create table if not exists public.order_field_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  field_key text not null,
  label text not null,
  is_active boolean not null default true,
  is_required boolean not null default false,
  show_in_table boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists order_field_settings_tenant_field_key_uidx
  on public.order_field_settings(tenant_id, field_key);
create index if not exists order_field_settings_tenant_id_idx
  on public.order_field_settings(tenant_id);
create index if not exists order_field_settings_sort_order_idx
  on public.order_field_settings(sort_order);
create index if not exists order_field_settings_show_in_table_idx
  on public.order_field_settings(show_in_table);

create or replace function public.seed_default_order_field_settings(
  p_tenant_id uuid,
  p_created_by uuid default null
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_tenant_id is null then
    return;
  end if;

  insert into public.order_field_settings (
    tenant_id,
    field_key,
    label,
    is_active,
    is_required,
    show_in_table,
    sort_order,
    created_by
  )
  values
    (p_tenant_id, 'manager', 'Manager', true, false, true, 10, p_created_by),
    (p_tenant_id, 'engineer', 'Engineer', true, false, true, 20, p_created_by),
    (p_tenant_id, 'delivery_address', 'Delivery address', true, false, false, 30, p_created_by),
    (p_tenant_id, 'customer_phone', 'Customer phone', true, false, false, 40, p_created_by)
  on conflict (tenant_id, field_key) do nothing;
end;
$$;

create or replace function public.seed_default_order_field_settings_for_tenant()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.seed_default_order_field_settings(new.id, null);
  return new;
end;
$$;

create or replace function public.set_order_field_settings_tenant_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tenant_id is null and new.created_by is not null then
    select p.tenant_id
      into new.tenant_id
    from public.profiles p
    where p.id = new.created_by
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists set_order_field_settings_updated_at on public.order_field_settings;
create trigger set_order_field_settings_updated_at
before update on public.order_field_settings
for each row execute procedure public.set_updated_at();

drop trigger if exists set_order_field_settings_tenant_id on public.order_field_settings;
create trigger set_order_field_settings_tenant_id
before insert on public.order_field_settings
for each row execute function public.set_order_field_settings_tenant_id();

drop trigger if exists seed_default_order_field_settings_on_tenant_insert on public.tenants;
create trigger seed_default_order_field_settings_on_tenant_insert
after insert on public.tenants
for each row execute function public.seed_default_order_field_settings_for_tenant();

-- Backfill defaults for existing tenants.
do $$
declare
  r record;
begin
  for r in select id from public.tenants loop
    perform public.seed_default_order_field_settings(r.id, null);
  end loop;
end $$;

alter table public.order_field_settings enable row level security;

drop policy if exists "order_field_settings_select_by_tenant" on public.order_field_settings;
create policy "order_field_settings_select_by_tenant" on public.order_field_settings
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_field_settings.tenant_id
    )
  );

drop policy if exists "order_field_settings_insert_by_tenant" on public.order_field_settings;
create policy "order_field_settings_insert_by_tenant" on public.order_field_settings
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_field_settings.tenant_id
    )
  );

drop policy if exists "order_field_settings_update_by_tenant" on public.order_field_settings;
create policy "order_field_settings_update_by_tenant" on public.order_field_settings
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_field_settings.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_field_settings.tenant_id
    )
  );

drop policy if exists "order_field_settings_delete_by_tenant" on public.order_field_settings;
create policy "order_field_settings_delete_by_tenant" on public.order_field_settings
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_field_settings.tenant_id
    )
  );
