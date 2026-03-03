create unique index if not exists order_items_order_source_row_unique_idx
  on public.order_items(order_id, source_kind, source_row_id);

create table if not exists public.order_item_import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  order_id uuid not null references public.orders(id) on delete cascade,
  source_file_name text not null,
  source_sheet_name text,
  mapping_profile jsonb not null default '{}'::jsonb,
  status text not null default 'preview' check (status in ('preview', 'applied', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists order_item_import_batches_order_idx
  on public.order_item_import_batches(order_id, created_at desc);

create table if not exists public.order_item_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.order_item_import_batches(id) on delete cascade,
  source_row_ref text,
  raw_payload jsonb not null default '{}'::jsonb,
  mapped_payload jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  order_item_id uuid references public.order_items(id) on delete set null,
  status text not null default 'preview' check (status in ('preview', 'applied', 'rejected')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists order_item_import_rows_batch_idx
  on public.order_item_import_rows(batch_id, created_at asc);
