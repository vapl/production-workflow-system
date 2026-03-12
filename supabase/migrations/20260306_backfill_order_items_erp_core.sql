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

update public.order_items oi
set
  sku = coalesce(oi.sku, nullif(trim(oi.attributes->>'sku'), '')),
  uom = coalesce(oi.uom, nullif(trim(oi.attributes->>'uom'), '')),
  revision = coalesce(oi.revision, nullif(trim(oi.attributes->>'revision'), '')),
  lifecycle_status = coalesce(oi.lifecycle_status, nullif(trim(oi.attributes->>'lifecycle_status'), '')),
  valid_from = coalesce(oi.valid_from, nullif(trim(oi.attributes->>'valid_from'), '')),
  valid_to = coalesce(oi.valid_to, nullif(trim(oi.attributes->>'valid_to'), '')),
  supply_type = coalesce(oi.supply_type, nullif(trim(oi.attributes->>'supply_type'), '')),
  item_group = coalesce(oi.item_group, nullif(trim(oi.attributes->>'item_group'), '')),
  route_code = coalesce(oi.route_code, nullif(trim(oi.attributes->>'route_code'), '')),
  net_weight = coalesce(
    oi.net_weight,
    case
      when nullif(trim(oi.attributes->>'net_weight'), '') is null then null
      else replace(trim(oi.attributes->>'net_weight'), ',', '.')::numeric
    end
  ),
  volume = coalesce(
    oi.volume,
    case
      when nullif(trim(oi.attributes->>'volume'), '') is null then null
      else replace(trim(oi.attributes->>'volume'), ',', '.')::numeric
    end
  ),
  default_supplier = coalesce(oi.default_supplier, nullif(trim(oi.attributes->>'default_supplier'), '')),
  quality_class = coalesce(oi.quality_class, nullif(trim(oi.attributes->>'quality_class'), '')),
  certification_required = coalesce(
    oi.certification_required,
    case
      when lower(trim(coalesce(oi.attributes->>'certification_required', ''))) in ('1', 'true', 'yes', 'ja', 'y') then true
      when lower(trim(coalesce(oi.attributes->>'certification_required', ''))) in ('0', 'false', 'no', 'ne', 'n') then false
      else null
    end
  ),
  production_notes = coalesce(oi.production_notes, nullif(trim(oi.attributes->>'production_notes'), '')),
  attributes = coalesce(oi.attributes, '{}'::jsonb)
    - 'sku'
    - 'uom'
    - 'revision'
    - 'lifecycle_status'
    - 'valid_from'
    - 'valid_to'
    - 'supply_type'
    - 'item_group'
    - 'route_code'
    - 'net_weight'
    - 'volume'
    - 'default_supplier'
    - 'quality_class'
    - 'certification_required'
    - 'production_notes'
where oi.attributes ?| array[
  'sku',
  'uom',
  'revision',
  'lifecycle_status',
  'valid_from',
  'valid_to',
  'supply_type',
  'item_group',
  'route_code',
  'net_weight',
  'volume',
  'default_supplier',
  'quality_class',
  'certification_required',
  'production_notes'
];
