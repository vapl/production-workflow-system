with key_map as (
  select *
  from (
    values
      ('line_no'::text, 'position'::text, 'position'::text),
      ('construction'::text, 'item_type'::text, 'item_type'::text),
      ('type'::text, 'item_type'::text, 'item_type'::text),
      ('tips'::text, 'item_type'::text, 'item_type'::text),
      ('system'::text, 'item_type'::text, 'item_type'::text),
      ('name'::text, 'item_name'::text, 'item_name'::text),
      ('nosaukums'::text, 'item_name'::text, 'item_name'::text),
      ('izmeri'::text, 'dimensions'::text, 'dimensions'::text),
      ('size'::text, 'dimensions'::text, 'dimensions'::text),
      ('quantity'::text, 'qty'::text, 'qty'::text),
      ('skaits'::text, 'qty'::text, 'qty'::text),
      ('materials'::text, 'material'::text, 'material'::text),
      ('colour'::text, 'color'::text, 'color'::text),
      ('apdare'::text, 'color'::text, 'color'::text),
      ('finish'::text, 'color'::text, 'color'::text)
  ) as d(source_key, canonical_key, semantic_key)
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
normalized_columns as (
  select
    pt.id,
    elem.ord,
    lower(coalesce(elem.col->>'key', '')) as original_key,
    coalesce(km.canonical_key, elem.col->>'key') as canonical_key,
    case
      when km.semantic_key is not null then
        jsonb_set(
          jsonb_set(elem.col, '{key}', to_jsonb(km.canonical_key), true),
          '{semanticKey}',
          to_jsonb(km.semantic_key),
          true
        )
      else elem.col
    end as normalized_col
  from primary_tables pt
  cross join lateral jsonb_array_elements(coalesce(pt.options->'columns', '[]'::jsonb)) with ordinality as elem(col, ord)
  left join key_map km
    on km.source_key = lower(coalesce(elem.col->>'key', ''))
),
deduped_columns as (
  select
    id,
    ord,
    canonical_key,
    normalized_col,
    row_number() over (
      partition by id, canonical_key
      order by ord
    ) as duplicate_rank
  from normalized_columns
),
rebuilt as (
  select
    id,
    jsonb_agg(normalized_col order by ord) as columns
  from deduped_columns
  where duplicate_rank = 1
  group by id
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
