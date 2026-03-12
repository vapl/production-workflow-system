with label_map as (
  select *
  from (
    values
      ('position'::text, 'Line No.'::text),
      ('line_no'::text, 'Line No.'::text),
      ('item_type'::text, 'Item type'::text),
      ('construction'::text, 'Item type'::text),
      ('type'::text, 'Item type'::text),
      ('tips'::text, 'Item type'::text),
      ('system'::text, 'Item type'::text),
      ('item_name'::text, 'Item name'::text),
      ('name'::text, 'Item name'::text),
      ('nosaukums'::text, 'Item name'::text),
      ('dimensions'::text, 'Dimensions'::text),
      ('izmeri'::text, 'Dimensions'::text),
      ('size'::text, 'Dimensions'::text),
      ('qty'::text, 'Quantity'::text),
      ('quantity'::text, 'Quantity'::text),
      ('skaits'::text, 'Quantity'::text),
      ('material'::text, 'Material'::text),
      ('materials'::text, 'Material'::text),
      ('color'::text, 'Finish / color'::text),
      ('colour'::text, 'Finish / color'::text),
      ('apdare'::text, 'Finish / color'::text),
      ('finish'::text, 'Finish / color'::text),
      ('sku'::text, 'Item code (SKU)'::text),
      ('uom'::text, 'Unit of measure (UoM)'::text),
      ('revision'::text, 'Revision'::text),
      ('lifecycle_status'::text, 'Status'::text),
      ('valid_from'::text, 'Valid from'::text),
      ('valid_to'::text, 'Valid to'::text),
      ('supply_type'::text, 'Supply type'::text),
      ('item_group'::text, 'Item group'::text),
      ('route_code'::text, 'Route code'::text),
      ('net_weight'::text, 'Net weight (kg)'::text),
      ('volume'::text, 'Volume (m3)'::text),
      ('default_supplier'::text, 'Default supplier'::text),
      ('quality_class'::text, 'Quality class'::text),
      ('certification_required'::text, 'Certification required'::text),
      ('production_notes'::text, 'Production notes'::text)
  ) as d(key, label_en)
),
primary_tables as (
  select
    oif.id,
    coalesce(oif.options, '{}'::jsonb) as options
  from public.order_input_fields oif
  where oif.field_type = 'table'
    and (
      coalesce((oif.options->>'isPrimaryConstructionTable')::boolean, false) = true
      or oif.key = 'constructions'
    )
),
rebuilt as (
  select
    pt.id,
    jsonb_agg(
      case
        when lm_key.key is null then elem.col
        else jsonb_set(
          elem.col,
          '{label}',
          to_jsonb(lm_key.label_en),
          true
        )
      end
      order by elem.ord
    ) as columns
  from primary_tables pt
  cross join lateral jsonb_array_elements(coalesce(pt.options->'columns', '[]'::jsonb)) with ordinality as elem(col, ord)
  left join label_map lm_key
    on lm_key.key = lower(coalesce(elem.col->>'key', ''))
  group by pt.id
)
update public.order_input_fields oif
set options = jsonb_set(
  coalesce(oif.options, '{}'::jsonb),
  '{columns}',
  coalesce(r.columns, '[]'::jsonb),
  true
)
from rebuilt r
where oif.id = r.id;
