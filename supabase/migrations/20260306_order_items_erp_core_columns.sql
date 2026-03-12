alter table public.order_items
  add column if not exists sku text,
  add column if not exists uom text,
  add column if not exists revision text,
  add column if not exists lifecycle_status text,
  add column if not exists valid_from text,
  add column if not exists valid_to text,
  add column if not exists supply_type text,
  add column if not exists item_group text,
  add column if not exists route_code text,
  add column if not exists net_weight numeric,
  add column if not exists volume numeric,
  add column if not exists default_supplier text,
  add column if not exists quality_class text,
  add column if not exists certification_required boolean,
  add column if not exists production_notes text;

alter table public.order_items
  drop constraint if exists order_items_lifecycle_status_chk;

alter table public.order_items
  add constraint order_items_lifecycle_status_chk
  check (
    lifecycle_status is null
    or lifecycle_status in ('Draft', 'Released', 'Obsolete')
  );

alter table public.order_items
  drop constraint if exists order_items_net_weight_nonnegative_chk;

alter table public.order_items
  add constraint order_items_net_weight_nonnegative_chk
  check (net_weight is null or net_weight >= 0);

alter table public.order_items
  drop constraint if exists order_items_volume_nonnegative_chk;

alter table public.order_items
  add constraint order_items_volume_nonnegative_chk
  check (volume is null or volume >= 0);

create index if not exists order_items_sku_idx
  on public.order_items (sku);

create index if not exists order_items_lifecycle_status_idx
  on public.order_items (lifecycle_status);
