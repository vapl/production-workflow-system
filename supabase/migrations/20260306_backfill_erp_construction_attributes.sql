with tenant_locale as (
  select
    t.id as tenant_id,
    coalesce(
      (
        select p.locale
        from public.profiles p
        where p.tenant_id = t.id
          and coalesce(p.is_owner, false) = true
        order by p.created_at asc
        limit 1
      ),
      (
        select p.locale
        from public.profiles p
        where p.tenant_id = t.id
        order by p.created_at asc
        limit 1
      ),
      'lv'
    ) as locale
  from public.tenants t
),
erp_column_defs as (
  select *
  from (
    values
      ('sku'::text, 'Artikula kods (SKU)'::text, 'Item code (SKU)'::text, 'Код артикула (SKU)'::text, 'text'::text, null::text, null::text[], true, 200),
      ('uom'::text, 'Mērvienība (UoM)'::text, 'Unit of measure (UoM)'::text, 'Ед. изм. (UoM)'::text, 'select'::text, null::text, array['pcs', 'set', 'm', 'm2', 'm3', 'kg', 'l', 'box', 'pack']::text[], true, 201),
      ('revision'::text, 'Revīzija'::text, 'Revision'::text, 'Ревизия'::text, 'text'::text, null::text, null::text[], true, 202),
      ('lifecycle_status'::text, 'Statuss'::text, 'Status'::text, 'Статус'::text, 'select'::text, null::text, array['Draft', 'Released', 'Obsolete']::text[], true, 203),
      ('valid_from'::text, 'Spēkā no'::text, 'Valid from'::text, 'Действует с'::text, 'text'::text, null::text, null::text[], true, 204),
      ('valid_to'::text, 'Spēkā līdz'::text, 'Valid to'::text, 'Действует до'::text, 'text'::text, null::text, null::text[], true, 205),
      ('supply_type'::text, 'Piegādes tips'::text, 'Supply type'::text, 'Тип обеспечения'::text, 'select'::text, null::text, array['Make-to-order', 'Make-to-stock', 'Buy']::text[], true, 206),
      ('item_group'::text, 'Produktu grupa'::text, 'Item group'::text, 'Группа изделий'::text, 'text'::text, null::text, null::text[], true, 207),
      ('route_code'::text, 'Maršruta kods'::text, 'Route code'::text, 'Код маршрута'::text, 'text'::text, null::text, null::text[], true, 208),
      ('net_weight'::text, 'Neto svars (kg)'::text, 'Net weight (kg)'::text, 'Вес нетто (кг)'::text, 'number'::text, 'kg'::text, null::text[], true, 209),
      ('volume'::text, 'Tilpums (m3)'::text, 'Volume (m3)'::text, 'Объем (м3)'::text, 'number'::text, 'm3'::text, null::text[], true, 210),
      ('default_supplier'::text, 'Noklusētais piegādātājs'::text, 'Default supplier'::text, 'Поставщик по умолчанию'::text, 'text'::text, null::text, null::text[], true, 211),
      ('quality_class'::text, 'Kvalitātes klase'::text, 'Quality class'::text, 'Класс качества'::text, 'text'::text, null::text, null::text[], true, 212),
      ('certification_required'::text, 'Sertifikācija obligāta'::text, 'Certification required'::text, 'Сертификация обязательна'::text, 'select'::text, null::text, array['No', 'Yes']::text[], true, 213),
      ('production_notes'::text, 'Ražošanas piezīmes'::text, 'Production notes'::text, 'Производственные заметки'::text, 'text'::text, null::text, null::text[], false, 214)
  ) as d(
    key,
    label_lv,
    label_en,
    label_ru,
    field_type,
    unit,
    select_options,
    use_in_bom_table,
    sort_order
  )
),
localized_columns as (
  select
    tl.tenant_id,
    d.key,
    d.sort_order,
    jsonb_strip_nulls(
      jsonb_build_object(
        'key', d.key,
        'label', d.label_en,
        'fieldType', d.field_type,
        'unit', d.unit,
        'options',
          case
            when d.select_options is null then null
            else to_jsonb(d.select_options)
          end,
        'isRequired', false,
        'isActive', true,
        'showInTable', true,
        'showInProduction', true,
        'useInBomTable', d.use_in_bom_table
      )
    ) as column_payload
  from tenant_locale tl
  cross join erp_column_defs d
),
primary_table_fields as (
  select
    oif.id,
    oif.tenant_id,
    coalesce(oif.options, '{}'::jsonb) as options
  from public.order_input_fields oif
  where oif.field_type = 'table'
    and (
      coalesce((oif.options->>'isPrimaryConstructionTable')::boolean, false) = true
      or oif.key = 'constructions'
    )
),
missing_columns as (
  select
    ptf.id as field_id,
    jsonb_agg(lc.column_payload order by lc.sort_order) as payload
  from primary_table_fields ptf
  join localized_columns lc
    on lc.tenant_id = ptf.tenant_id
  where not exists (
    select 1
    from jsonb_array_elements(coalesce(ptf.options->'columns', '[]'::jsonb)) as existing
    where existing->>'key' = lc.key
  )
  group by ptf.id
)
update public.order_input_fields oif
set options = jsonb_set(
  coalesce(oif.options, '{}'::jsonb),
  '{columns}',
  coalesce(oif.options->'columns', '[]'::jsonb) || coalesce(mc.payload, '[]'::jsonb),
  true
)
from missing_columns mc
where oif.id = mc.field_id;

with erp_keys as (
  select key
  from (
    values
      ('sku'::text),
      ('uom'::text),
      ('revision'::text),
      ('lifecycle_status'::text),
      ('valid_from'::text),
      ('valid_to'::text),
      ('supply_type'::text),
      ('item_group'::text),
      ('route_code'::text),
      ('net_weight'::text),
      ('volume'::text),
      ('default_supplier'::text),
      ('quality_class'::text),
      ('certification_required'::text),
      ('production_notes'::text)
  ) as d(key)
)
delete from public.order_input_fields oif
where coalesce(oif.options->>'scope', '') = 'construction_attribute'
  and exists (
    select 1
    from erp_keys k
    where k.key = oif.key
  );
