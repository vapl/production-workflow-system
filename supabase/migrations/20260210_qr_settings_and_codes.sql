-- QR settings + production QR codes

alter table public.tenant_settings
  add column if not exists qr_enabled_sizes jsonb not null
    default '["A4","A5","A6","LABEL_70x35","LABEL_105x148"]'::jsonb,
  add column if not exists qr_default_size text not null default 'A4',
  add column if not exists qr_content_fields jsonb not null
    default '["order_number","customer_name","batch_code","item_name","qty","material"]'::jsonb;

create table if not exists public.production_qr_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  field_id uuid not null references public.order_input_fields(id) on delete cascade,
  row_index integer not null default 0,
  token uuid not null default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists production_qr_codes_unique
  on public.production_qr_codes(tenant_id, order_id, field_id, row_index);
create unique index if not exists production_qr_codes_token_unique
  on public.production_qr_codes(tenant_id, token);

drop trigger if exists set_production_qr_codes_tenant_id on public.production_qr_codes;
create trigger set_production_qr_codes_tenant_id
before insert on public.production_qr_codes
for each row execute procedure public.set_order_child_tenant_id();

alter table public.production_qr_codes enable row level security;

create policy "production_qr_codes_select_by_tenant" on public.production_qr_codes
for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = production_qr_codes.tenant_id
  )
);

create policy "production_qr_codes_insert_by_tenant" on public.production_qr_codes
for insert
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = production_qr_codes.tenant_id
  )
);

create policy "production_qr_codes_update_by_tenant" on public.production_qr_codes
for update
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = production_qr_codes.tenant_id
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = production_qr_codes.tenant_id
  )
);

create policy "production_qr_codes_delete_by_tenant" on public.production_qr_codes
for delete
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = production_qr_codes.tenant_id
  )
);
