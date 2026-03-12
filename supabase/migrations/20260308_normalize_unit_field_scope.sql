update public.order_input_fields
set options = jsonb_set(
  coalesce(options, '{}'::jsonb),
  '{scope}',
  to_jsonb('construction_attribute'::text),
  true
)
where group_key = 'production_scope'
  and field_type <> 'table'
  and coalesce(options->>'scope', '') = '';
