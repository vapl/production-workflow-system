-- PWS multi-tenant Orders schema for Supabase

create extension if not exists pgcrypto;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.tenants
  add column if not exists outbound_from_name text,
  add column if not exists outbound_from_email text,
  add column if not exists outbound_reply_to_email text,
  add column if not exists outbound_use_user_sender boolean not null default true,
  add column if not exists outbound_sender_verified boolean not null default false,
  add column if not exists external_request_email_subject_template text,
  add column if not exists external_request_email_html_template text,
  add column if not exists external_request_email_text_template text;

alter table public.profiles
  add column if not exists tenant_id uuid references public.tenants(id) on delete restrict;

alter table public.profiles
  add column if not exists phone text;

alter table public.profiles
  add column if not exists locale text not null default 'lv';

alter table public.profiles
  add column if not exists is_owner boolean not null default false;

create index if not exists profiles_tenant_id_idx on public.profiles(tenant_id);
create unique index if not exists profiles_one_owner_per_tenant_uidx
  on public.profiles(tenant_id)
  where is_owner = true and tenant_id is not null;

alter table public.profiles
  drop constraint if exists profiles_locale_check;

alter table public.profiles
  add constraint profiles_locale_check
  check (locale in ('lv', 'en', 'ru'));

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_number text not null unique,
  customer_name text not null,
  product_name text,
  quantity integer check (quantity > 0),
  order_field_values jsonb,
  order_field_labels jsonb,
  due_date date not null,
  priority text not null check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  source text not null default 'manual',
  external_id text,
  source_payload jsonb,
  synced_at timestamptz,
  production_duration_minutes integer,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_tenant_id_idx on public.orders(tenant_id);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_due_date_idx on public.orders(due_date);
create index if not exists orders_external_id_idx on public.orders(external_id);
create index if not exists orders_updated_by_idx on public.orders(updated_by);

create table if not exists public.order_attachments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  url text,
  added_by uuid references auth.users(id) on delete set null,
  added_by_name text,
  added_by_role text,
  created_at timestamptz not null default now(),
  size integer,
  mime_type text,
  category text
);

create index if not exists order_attachments_order_id_idx on public.order_attachments(order_id);
create index if not exists order_attachments_tenant_id_idx on public.order_attachments(tenant_id);
create index if not exists order_attachments_category_idx on public.order_attachments(category);

alter table public.external_jobs
  add column if not exists delivery_note_no text,
  add column if not exists received_at timestamptz,
  add column if not exists received_by uuid references auth.users(id) on delete set null;

alter table public.external_job_attachments
  add column if not exists category text;

create index if not exists external_job_attachments_category_idx
  on public.external_job_attachments(category);

create table if not exists public.order_comments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  message text not null,
  author uuid references auth.users(id) on delete set null,
  author_name text,
  author_role text,
  created_at timestamptz not null default now()
);

create index if not exists order_comments_order_id_idx on public.order_comments(order_id);
create index if not exists order_comments_tenant_id_idx on public.order_comments(tenant_id);

create table if not exists public.order_input_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  label text not null,
  group_key text not null default 'order_info',
  field_type text not null
    check (field_type in ('text', 'textarea', 'number', 'date', 'select', 'toggle', 'toggle_number', 'table')),
  unit text,
  options jsonb,
  is_required boolean not null default false,
  is_active boolean not null default true,
  show_in_production boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists order_input_fields_tenant_key_uidx
  on public.order_input_fields(tenant_id, key);
create index if not exists order_input_fields_tenant_id_idx
  on public.order_input_fields(tenant_id);
create index if not exists order_input_fields_group_key_idx
  on public.order_input_fields(group_key);
create index if not exists order_input_fields_sort_order_idx
  on public.order_input_fields(sort_order);
create index if not exists order_input_fields_show_in_production_idx
  on public.order_input_fields(show_in_production);

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

create table if not exists public.order_input_values (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  field_id uuid not null references public.order_input_fields(id) on delete cascade,
  value jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists order_input_values_order_field_uidx
  on public.order_input_values(order_id, field_id);
create index if not exists order_input_values_tenant_id_idx
  on public.order_input_values(tenant_id);
create index if not exists order_input_values_order_id_idx
  on public.order_input_values(order_id);

create table if not exists public.external_job_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  label text not null,
  field_type text not null
    check (field_type in ('text', 'textarea', 'number', 'date', 'select', 'toggle')),
  scope text not null default 'manual'
    check (scope in ('manual', 'portal_response')),
  field_role text not null default 'none'
    check (field_role in ('none', 'planned_price', 'invoice_price')),
  show_in_table boolean not null default true,
  ai_enabled boolean not null default false,
  ai_aliases text[] not null default '{}'::text[],
  unit text,
  options jsonb,
  is_required boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists external_job_fields_tenant_key_uidx
  on public.external_job_fields(tenant_id, key);
create index if not exists external_job_fields_tenant_id_idx
  on public.external_job_fields(tenant_id);
create index if not exists external_job_fields_sort_order_idx
  on public.external_job_fields(sort_order);
create index if not exists external_job_fields_scope_idx
  on public.external_job_fields(scope);
create index if not exists external_job_fields_field_role_idx
  on public.external_job_fields(field_role);
create index if not exists external_job_fields_ai_enabled_idx
  on public.external_job_fields(ai_enabled);

create table if not exists public.external_job_field_values (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  external_job_id uuid not null references public.external_jobs(id) on delete cascade,
  field_id uuid not null references public.external_job_fields(id) on delete cascade,
  value jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists external_job_field_values_job_field_uidx
  on public.external_job_field_values(external_job_id, field_id);
create index if not exists external_job_field_values_tenant_id_idx
  on public.external_job_field_values(tenant_id);
create index if not exists external_job_field_values_job_id_idx
  on public.external_job_field_values(external_job_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row execute procedure public.set_updated_at();

create or replace function public.set_order_child_tenant_id()
returns trigger as $$
begin
  if new.tenant_id is null then
    select tenant_id into new.tenant_id from public.orders where id = new.order_id;
  end if;
  return new;
end;
$$ language plpgsql;

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

drop trigger if exists set_order_attachments_tenant_id on public.order_attachments;
create trigger set_order_attachments_tenant_id
before insert on public.order_attachments
for each row execute procedure public.set_order_child_tenant_id();

drop trigger if exists set_order_comments_tenant_id on public.order_comments;
create trigger set_order_comments_tenant_id
before insert on public.order_comments
for each row execute procedure public.set_order_child_tenant_id();

drop trigger if exists set_order_input_fields_updated_at on public.order_input_fields;
create trigger set_order_input_fields_updated_at
before update on public.order_input_fields
for each row execute procedure public.set_updated_at();

drop trigger if exists set_order_field_settings_updated_at on public.order_field_settings;
create trigger set_order_field_settings_updated_at
before update on public.order_field_settings
for each row execute procedure public.set_updated_at();

drop trigger if exists set_order_input_values_updated_at on public.order_input_values;
create trigger set_order_input_values_updated_at
before update on public.order_input_values
for each row execute procedure public.set_updated_at();

drop trigger if exists set_order_field_settings_tenant_id on public.order_field_settings;
create trigger set_order_field_settings_tenant_id
before insert on public.order_field_settings
for each row execute function public.set_order_field_settings_tenant_id();

drop trigger if exists set_order_input_values_tenant_id on public.order_input_values;
create trigger set_order_input_values_tenant_id
before insert on public.order_input_values
for each row execute procedure public.set_order_child_tenant_id();

drop trigger if exists seed_default_order_field_settings_on_tenant_insert on public.tenants;
create trigger seed_default_order_field_settings_on_tenant_insert
after insert on public.tenants
for each row execute function public.seed_default_order_field_settings_for_tenant();

do $$
declare
  r record;
begin
  for r in select id from public.tenants loop
    perform public.seed_default_order_field_settings(r.id, null);
  end loop;
end $$;

alter table public.orders enable row level security;
alter table public.order_attachments enable row level security;
alter table public.order_comments enable row level security;
alter table public.order_input_fields enable row level security;
alter table public.order_field_settings enable row level security;
alter table public.order_input_values enable row level security;
alter table public.tenants enable row level security;
alter table public.profiles enable row level security;

create or replace function public.current_tenant_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_current_user_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(is_admin, false) or coalesce(is_owner, false)
  from public.profiles
  where id = auth.uid();
$$;

drop policy if exists "profiles_select_by_tenant" on public.profiles;
drop policy if exists "profiles_select_by_self" on public.profiles;
drop policy if exists "profiles_select_by_tenant_admin" on public.profiles;
drop policy if exists "profiles_insert_self" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "profiles_update_by_tenant_admin" on public.profiles;

create policy "profiles_select_by_self" on public.profiles
  for select
  using (id = auth.uid());

create policy "profiles_select_by_tenant_admin" on public.profiles
  for select
  using (
    public.is_current_user_admin()
    and profiles.tenant_id = public.current_tenant_id()
  );

create policy "profiles_insert_self" on public.profiles
  for insert
  with check (id = auth.uid());

create policy "profiles_update_self" on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_update_by_tenant_admin" on public.profiles
  for update
  using (
    public.is_current_user_admin()
    and profiles.tenant_id = public.current_tenant_id()
  )
  with check (
    public.is_current_user_admin()
    and profiles.tenant_id = public.current_tenant_id()
  );

grant select, insert, update on public.profiles to authenticated;
grant execute on function public.current_tenant_id() to authenticated;
grant execute on function public.is_current_user_admin() to authenticated;

create policy "orders_select_by_tenant" on public.orders
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = orders.tenant_id
    )
  );

create policy "orders_insert_by_tenant" on public.orders
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = orders.tenant_id
    )
  );

create policy "orders_update_by_tenant" on public.orders
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = orders.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = orders.tenant_id
    )
  );

create policy "orders_delete_by_tenant" on public.orders
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = orders.tenant_id
    )
  );

create policy "order_attachments_select_by_tenant" on public.order_attachments
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_attachments.tenant_id
    )
  );

create policy "order_attachments_insert_by_tenant" on public.order_attachments
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_attachments.tenant_id
    )
  );

create policy "order_attachments_update_by_tenant" on public.order_attachments
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_attachments.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_attachments.tenant_id
    )
  );

create policy "order_attachments_delete_by_tenant" on public.order_attachments
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_attachments.tenant_id
    )
  );

create policy "order_comments_select_by_tenant" on public.order_comments
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_comments.tenant_id
    )
  );

create policy "order_comments_insert_by_tenant" on public.order_comments
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_comments.tenant_id
    )
  );

create policy "order_comments_update_by_tenant" on public.order_comments
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_comments.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_comments.tenant_id
    )
  );

create policy "order_comments_delete_by_tenant" on public.order_comments
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_comments.tenant_id
    )
  );

create policy "order_input_fields_select_by_tenant" on public.order_input_fields
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_input_fields.tenant_id
    )
  );

create policy "order_input_fields_insert_by_tenant" on public.order_input_fields
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_input_fields.tenant_id
    )
  );

create policy "order_input_fields_update_by_tenant" on public.order_input_fields
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_input_fields.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_input_fields.tenant_id
    )
  );

create policy "order_input_fields_delete_by_tenant" on public.order_input_fields
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_input_fields.tenant_id
    )
  );

create policy "order_field_settings_select_by_tenant" on public.order_field_settings
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_field_settings.tenant_id
    )
  );

create policy "order_field_settings_insert_by_tenant" on public.order_field_settings
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_field_settings.tenant_id
    )
  );

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

create policy "order_field_settings_delete_by_tenant" on public.order_field_settings
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_field_settings.tenant_id
    )
  );

create policy "order_input_values_select_by_tenant" on public.order_input_values
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_input_values.tenant_id
    )
  );

create policy "order_input_values_insert_by_tenant" on public.order_input_values
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_input_values.tenant_id
    )
  );

create policy "order_input_values_update_by_tenant" on public.order_input_values
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_input_values.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_input_values.tenant_id
    )
  );

create policy "order_input_values_delete_by_tenant" on public.order_input_values
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_input_values.tenant_id
    )
  );

create policy "tenants_select_own" on public.tenants
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = tenants.id
    )
  );

-- Additional domain tables
create table if not exists public.workstations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  tracking_mode text not null default 'construction_level'
    check (tracking_mode in ('construction_level', 'order_level', 'receipt_only')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  workday_start time not null default '08:00',
  workday_end time not null default '17:00',
  workdays integer[] not null default array[1, 2, 3, 4, 5],
  work_shifts jsonb not null default '[{"start":"08:00","end":"17:00"}]'::jsonb,
  external_price_reconciliation_enabled boolean not null default false,
  external_table_columns jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workstations_tenant_id_idx on public.workstations(tenant_id);
create index if not exists workstations_sort_order_idx on public.workstations(sort_order);

create table if not exists public.station_dependencies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  station_id uuid not null references public.workstations(id) on delete cascade,
  depends_on_station_id uuid not null references public.workstations(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists station_dependencies_unique
  on public.station_dependencies(tenant_id, station_id, depends_on_station_id);
create index if not exists station_dependencies_tenant_id_idx
  on public.station_dependencies(tenant_id);
create index if not exists station_dependencies_station_id_idx
  on public.station_dependencies(station_id);
create index if not exists station_dependencies_depends_on_idx
  on public.station_dependencies(depends_on_station_id);

create table if not exists public.operators (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  role text,
  station_id uuid references public.workstations(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operators_tenant_id_idx on public.operators(tenant_id);
create index if not exists operators_station_id_idx on public.operators(station_id);

create table if not exists public.stop_reasons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stop_reasons_tenant_id_idx on public.stop_reasons(tenant_id);

create table if not exists public.construction_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  default_stations text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists construction_items_tenant_id_idx on public.construction_items(tenant_id);

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  name text not null,
  workstation_name text not null,
  operator_name text,
  estimated_hours numeric not null,
  actual_hours numeric,
  completed_at date,
  status text not null check (status in ('planned', 'in_progress', 'blocked', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists batches_tenant_id_idx on public.batches(tenant_id);
create index if not exists batches_order_id_idx on public.batches(order_id);

create or replace function public.set_user_child_tenant_id()
returns trigger as $$
begin
  if new.tenant_id is null then
    select tenant_id into new.tenant_id from public.profiles where id = new.user_id;
  end if;
  return new;
end;
$$ language plpgsql;

create table if not exists public.operator_station_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  station_id uuid not null references public.workstations(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists operator_station_assignments_unique
  on public.operator_station_assignments(user_id, station_id);
create index if not exists operator_station_assignments_tenant_id_idx
  on public.operator_station_assignments(tenant_id);
create index if not exists operator_station_assignments_user_id_idx
  on public.operator_station_assignments(user_id);
create index if not exists operator_station_assignments_station_id_idx
  on public.operator_station_assignments(station_id);

create table if not exists public.order_production_maps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  source_attachment_id uuid references public.order_attachments(id) on delete set null,
  mapping jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists order_production_maps_order_id_uidx
  on public.order_production_maps(order_id);
create index if not exists order_production_maps_tenant_id_idx
  on public.order_production_maps(tenant_id);

create table if not exists public.production_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  batch_code text not null,
  item_name text not null,
  qty numeric not null default 1,
  material text,
  dimensions text,
  priority text check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'queued'
    check (status in ('queued', 'pending', 'in_progress', 'paused', 'blocked', 'done')),
  station_id uuid references public.workstations(id) on delete set null,
  source_attachment_id uuid references public.order_attachments(id) on delete set null,
  meta jsonb,
  started_at timestamptz,
  done_at timestamptz,
  duration_minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists production_items_tenant_id_idx
  on public.production_items(tenant_id);
create index if not exists production_items_order_id_idx
  on public.production_items(order_id);
create index if not exists production_items_batch_code_idx
  on public.production_items(batch_code);
create index if not exists production_items_status_idx
  on public.production_items(status);
create index if not exists production_items_station_id_idx
  on public.production_items(station_id);

create table if not exists public.batch_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  batch_code text not null,
  station_id uuid references public.workstations(id) on delete set null,
  route_key text not null default 'default',
  step_index integer not null default 0,
  status text not null default 'queued'
    check (status in ('queued', 'pending', 'in_progress', 'paused', 'blocked', 'done')),
  blocked_reason text,
  blocked_reason_id uuid references public.stop_reasons(id) on delete set null,
  blocked_at timestamptz,
  blocked_by uuid references auth.users(id) on delete set null,
  planned_date date,
  started_at timestamptz,
  done_at timestamptz,
  duration_minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists batch_runs_tenant_id_idx
  on public.batch_runs(tenant_id);
create index if not exists batch_runs_order_id_idx
  on public.batch_runs(order_id);
create index if not exists batch_runs_batch_code_idx
  on public.batch_runs(batch_code);
create index if not exists batch_runs_station_id_idx
  on public.batch_runs(station_id);
create index if not exists batch_runs_status_idx
  on public.batch_runs(status);
create index if not exists batch_runs_route_key_idx
  on public.batch_runs(route_key);
create index if not exists batch_runs_step_index_idx
  on public.batch_runs(step_index);

create table if not exists public.production_status_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  batch_run_id uuid references public.batch_runs(id) on delete set null,
  production_item_id uuid references public.production_items(id) on delete set null,
  from_status text,
  to_status text,
  reason text,
  reason_id uuid references public.stop_reasons(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists production_status_events_tenant_id_idx
  on public.production_status_events(tenant_id);
create index if not exists production_status_events_actor_user_id_idx
  on public.production_status_events(actor_user_id);
create index if not exists production_status_events_order_id_idx
  on public.production_status_events(order_id);
create index if not exists production_status_events_created_at_idx
  on public.production_status_events(created_at desc);

create table if not exists public.qr_scan_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  raw_value text,
  token text,
  result text not null default 'success'
    check (result in ('success', 'error')),
  message text,
  target_route text,
  created_at timestamptz not null default now()
);

create index if not exists qr_scan_events_tenant_id_idx
  on public.qr_scan_events(tenant_id);
create index if not exists qr_scan_events_user_id_idx
  on public.qr_scan_events(user_id);
create index if not exists qr_scan_events_created_at_idx
  on public.qr_scan_events(created_at desc);

create or replace view public.production_execution_drift as
with run_item_pairs as (
  select
    br.tenant_id,
    br.id as batch_run_id,
    br.order_id,
    br.batch_code,
    br.station_id,
    br.status as batch_run_status,
    br.updated_at as batch_run_updated_at,
    pi.id as production_item_id,
    pi.status as production_item_status,
    pi.updated_at as production_item_updated_at
  from public.batch_runs br
  left join public.production_items pi
    on pi.tenant_id = br.tenant_id
   and pi.order_id = br.order_id
   and pi.batch_code = br.batch_code
   and (
     (pi.station_id is null and br.station_id is null)
     or pi.station_id = br.station_id
   )
)
select
  'run_item_status_mismatch'::text as drift_type,
  rip.tenant_id,
  rip.batch_run_id,
  rip.production_item_id,
  rip.order_id,
  rip.batch_code,
  rip.station_id,
  rip.batch_run_status,
  rip.production_item_status,
  rip.batch_run_updated_at,
  rip.production_item_updated_at
from run_item_pairs rip
where rip.production_item_id is not null
  and rip.batch_run_status is distinct from rip.production_item_status

union all

select
  'run_without_items'::text as drift_type,
  br.tenant_id,
  br.id as batch_run_id,
  null::uuid as production_item_id,
  br.order_id,
  br.batch_code,
  br.station_id,
  br.status as batch_run_status,
  null::text as production_item_status,
  br.updated_at as batch_run_updated_at,
  null::timestamptz as production_item_updated_at
from public.batch_runs br
where not exists (
  select 1
  from public.production_items pi
  where pi.tenant_id = br.tenant_id
    and pi.order_id = br.order_id
    and pi.batch_code = br.batch_code
    and (
      (pi.station_id is null and br.station_id is null)
      or pi.station_id = br.station_id
    )
)

union all

select
  'item_without_run'::text as drift_type,
  pi.tenant_id,
  null::uuid as batch_run_id,
  pi.id as production_item_id,
  pi.order_id,
  pi.batch_code,
  pi.station_id,
  null::text as batch_run_status,
  pi.status as production_item_status,
  null::timestamptz as batch_run_updated_at,
  pi.updated_at as production_item_updated_at
from public.production_items pi
where not exists (
  select 1
  from public.batch_runs br
  where br.tenant_id = pi.tenant_id
    and br.order_id = pi.order_id
    and br.batch_code = pi.batch_code
    and (
      (pi.station_id is null and br.station_id is null)
      or pi.station_id = br.station_id
    )
);

drop trigger if exists set_workstations_updated_at on public.workstations;
create trigger set_workstations_updated_at
before update on public.workstations
for each row execute procedure public.set_updated_at();

drop trigger if exists set_tenant_settings_updated_at on public.tenant_settings;
create trigger set_tenant_settings_updated_at
before update on public.tenant_settings
for each row execute procedure public.set_updated_at();

drop trigger if exists set_operators_updated_at on public.operators;
create trigger set_operators_updated_at
before update on public.operators
for each row execute procedure public.set_updated_at();

drop trigger if exists set_stop_reasons_updated_at on public.stop_reasons;
create trigger set_stop_reasons_updated_at
before update on public.stop_reasons
for each row execute procedure public.set_updated_at();

drop trigger if exists set_construction_items_updated_at on public.construction_items;
create trigger set_construction_items_updated_at
before update on public.construction_items
for each row execute procedure public.set_updated_at();

drop trigger if exists set_batches_updated_at on public.batches;
create trigger set_batches_updated_at
before update on public.batches
for each row execute procedure public.set_updated_at();

drop trigger if exists set_operator_station_assignments_updated_at
  on public.operator_station_assignments;
create trigger set_operator_station_assignments_updated_at
before update on public.operator_station_assignments
for each row execute procedure public.set_updated_at();

drop trigger if exists set_operator_station_assignments_tenant_id
  on public.operator_station_assignments;
create trigger set_operator_station_assignments_tenant_id
before insert on public.operator_station_assignments
for each row execute procedure public.set_user_child_tenant_id();

drop trigger if exists set_order_production_maps_updated_at on public.order_production_maps;
create trigger set_order_production_maps_updated_at
before update on public.order_production_maps
for each row execute procedure public.set_updated_at();

drop trigger if exists set_production_items_updated_at on public.production_items;
create trigger set_production_items_updated_at
before update on public.production_items
for each row execute procedure public.set_updated_at();

drop trigger if exists set_batch_runs_updated_at on public.batch_runs;
create trigger set_batch_runs_updated_at
before update on public.batch_runs
for each row execute procedure public.set_updated_at();

drop trigger if exists set_order_production_maps_tenant_id on public.order_production_maps;
create trigger set_order_production_maps_tenant_id
before insert on public.order_production_maps
for each row execute procedure public.set_order_child_tenant_id();

drop trigger if exists set_production_items_tenant_id on public.production_items;
create trigger set_production_items_tenant_id
before insert on public.production_items
for each row execute procedure public.set_order_child_tenant_id();

drop trigger if exists set_batch_runs_tenant_id on public.batch_runs;
create trigger set_batch_runs_tenant_id
before insert on public.batch_runs
for each row execute procedure public.set_order_child_tenant_id();

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

alter table public.workstations enable row level security;
alter table public.station_dependencies enable row level security;
alter table public.tenant_settings enable row level security;
alter table public.operators enable row level security;
alter table public.stop_reasons enable row level security;
alter table public.construction_items enable row level security;
alter table public.batches enable row level security;
alter table public.operator_station_assignments enable row level security;
alter table public.order_production_maps enable row level security;
alter table public.production_items enable row level security;
alter table public.batch_runs enable row level security;
alter table public.production_status_events enable row level security;
alter table public.qr_scan_events enable row level security;

create policy "workstations_select_by_tenant" on public.workstations
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workstations.tenant_id
    )
  );

create policy "workstations_insert_by_tenant" on public.workstations
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workstations.tenant_id
    )
  );

create policy "workstations_update_by_tenant" on public.workstations
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workstations.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workstations.tenant_id
    )
  );

create policy "workstations_delete_by_tenant" on public.workstations
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workstations.tenant_id
    )
  );

create policy "station_dependencies_select_by_tenant" on public.station_dependencies
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = station_dependencies.tenant_id
    )
  );

create policy "station_dependencies_insert_by_tenant" on public.station_dependencies
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = station_dependencies.tenant_id
    )
  );

create policy "station_dependencies_delete_by_tenant" on public.station_dependencies
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = station_dependencies.tenant_id
    )
  );

create policy "tenant_settings_select_by_tenant" on public.tenant_settings
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = tenant_settings.tenant_id
    )
  );

create policy "tenant_settings_insert_by_tenant" on public.tenant_settings
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = tenant_settings.tenant_id
    )
  );

create policy "tenant_settings_update_by_tenant" on public.tenant_settings
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = tenant_settings.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = tenant_settings.tenant_id
    )
  );

create policy "tenant_settings_delete_by_tenant" on public.tenant_settings
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = tenant_settings.tenant_id
    )
  );

create policy "operators_select_by_tenant" on public.operators
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = operators.tenant_id
    )
  );

create policy "operators_insert_by_tenant" on public.operators
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = operators.tenant_id
    )
  );

create policy "operators_update_by_tenant" on public.operators
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = operators.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = operators.tenant_id
    )
  );

create policy "operators_delete_by_tenant" on public.operators
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = operators.tenant_id
    )
  );

create policy "stop_reasons_select_by_tenant" on public.stop_reasons
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = stop_reasons.tenant_id
    )
  );

create policy "stop_reasons_insert_by_tenant" on public.stop_reasons
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = stop_reasons.tenant_id
    )
  );

create policy "stop_reasons_update_by_tenant" on public.stop_reasons
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = stop_reasons.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = stop_reasons.tenant_id
    )
  );

create policy "stop_reasons_delete_by_tenant" on public.stop_reasons
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = stop_reasons.tenant_id
    )
  );

create policy "construction_items_select_by_tenant" on public.construction_items
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = construction_items.tenant_id
    )
  );

create policy "construction_items_insert_by_tenant" on public.construction_items
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = construction_items.tenant_id
    )
  );

create policy "construction_items_update_by_tenant" on public.construction_items
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = construction_items.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = construction_items.tenant_id
    )
  );

create policy "construction_items_delete_by_tenant" on public.construction_items
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = construction_items.tenant_id
    )
  );

create policy "batches_select_by_tenant" on public.batches
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = batches.tenant_id
    )
  );

create policy "batches_insert_by_tenant" on public.batches
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = batches.tenant_id
    )
  );

create policy "batches_update_by_tenant" on public.batches
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = batches.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = batches.tenant_id
    )
  );

create policy "batches_delete_by_tenant" on public.batches
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = batches.tenant_id
    )
  );

create policy "operator_station_assignments_select_by_tenant"
  on public.operator_station_assignments
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = operator_station_assignments.tenant_id
    )
  );

create policy "operator_station_assignments_insert_by_tenant"
  on public.operator_station_assignments
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = operator_station_assignments.tenant_id
    )
  );

create policy "operator_station_assignments_update_by_tenant"
  on public.operator_station_assignments
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = operator_station_assignments.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = operator_station_assignments.tenant_id
    )
  );

create policy "operator_station_assignments_delete_by_tenant"
  on public.operator_station_assignments
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = operator_station_assignments.tenant_id
    )
  );

create policy "order_production_maps_select_by_tenant" on public.order_production_maps
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_production_maps.tenant_id
    )
  );

create policy "order_production_maps_insert_by_tenant" on public.order_production_maps
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_production_maps.tenant_id
    )
  );

create policy "order_production_maps_update_by_tenant" on public.order_production_maps
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_production_maps.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_production_maps.tenant_id
    )
  );

create policy "order_production_maps_delete_by_tenant" on public.order_production_maps
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_production_maps.tenant_id
    )
  );

create policy "production_items_select_by_tenant" on public.production_items
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = production_items.tenant_id
    )
  );

create policy "production_items_insert_by_tenant" on public.production_items
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = production_items.tenant_id
    )
  );

create policy "production_items_update_by_tenant" on public.production_items
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = production_items.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = production_items.tenant_id
    )
  );

create policy "production_items_delete_by_tenant" on public.production_items
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = production_items.tenant_id
    )
  );

create policy "batch_runs_select_by_tenant" on public.batch_runs
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = batch_runs.tenant_id
    )
  );

create policy "batch_runs_insert_by_tenant" on public.batch_runs
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = batch_runs.tenant_id
    )
  );

create policy "batch_runs_update_by_tenant" on public.batch_runs
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = batch_runs.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = batch_runs.tenant_id
    )
  );

create policy "batch_runs_delete_by_tenant" on public.batch_runs
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = batch_runs.tenant_id
    )
  );

create policy "production_status_events_select_by_tenant"
  on public.production_status_events
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = production_status_events.tenant_id
    )
  );

create policy "production_status_events_insert_by_tenant"
  on public.production_status_events
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = production_status_events.tenant_id
    )
  );

create policy "production_status_events_delete_by_tenant"
  on public.production_status_events
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = production_status_events.tenant_id
    )
  );

create policy "qr_scan_events_select_by_tenant"
  on public.qr_scan_events
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = qr_scan_events.tenant_id
    )
  );

create policy "qr_scan_events_insert_by_tenant"
  on public.qr_scan_events
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = qr_scan_events.tenant_id
    )
  );


