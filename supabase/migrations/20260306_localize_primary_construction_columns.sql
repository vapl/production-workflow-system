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
label_map as (
  select *
  from (
    values
      ('position'::text, 'Pozīcija'::text, 'Position'::text, 'Позиция'::text),
      ('line_no'::text, 'Pozīcija'::text, 'Position'::text, 'Позиция'::text),
      ('item_type'::text, 'Produkta tips'::text, 'Item type'::text, 'Тип изделия'::text),
      ('construction'::text, 'Produkta tips'::text, 'Item type'::text, 'Тип изделия'::text),
      ('type'::text, 'Produkta tips'::text, 'Item type'::text, 'Тип изделия'::text),
      ('tips'::text, 'Produkta tips'::text, 'Item type'::text, 'Тип изделия'::text),
      ('item_name'::text, 'Produkta nosaukums'::text, 'Item name'::text, 'Название изделия'::text),
      ('name'::text, 'Produkta nosaukums'::text, 'Item name'::text, 'Название изделия'::text),
      ('nosaukums'::text, 'Produkta nosaukums'::text, 'Item name'::text, 'Название изделия'::text),
      ('dimensions'::text, 'Izmēri'::text, 'Dimensions'::text, 'Размеры'::text),
      ('izmeri'::text, 'Izmēri'::text, 'Dimensions'::text, 'Размеры'::text),
      ('size'::text, 'Izmēri'::text, 'Dimensions'::text, 'Размеры'::text),
      ('qty'::text, 'Daudzums'::text, 'Quantity'::text, 'Количество'::text),
      ('quantity'::text, 'Daudzums'::text, 'Quantity'::text, 'Количество'::text),
      ('skaits'::text, 'Daudzums'::text, 'Quantity'::text, 'Количество'::text),
      ('material'::text, 'Materiāls'::text, 'Material'::text, 'Материал'::text),
      ('materials'::text, 'Materiāls'::text, 'Material'::text, 'Материал'::text),
      ('color'::text, 'Apdare / krāsa'::text, 'Finish / color'::text, 'Отделка / цвет'::text),
      ('colour'::text, 'Apdare / krāsa'::text, 'Finish / color'::text, 'Отделка / цвет'::text),
      ('apdare'::text, 'Apdare / krāsa'::text, 'Finish / color'::text, 'Отделка / цвет'::text),
      ('finish'::text, 'Apdare / krāsa'::text, 'Finish / color'::text, 'Отделка / цвет'::text),
      ('sku'::text, 'Artikula kods (SKU)'::text, 'Item code (SKU)'::text, 'Код артикула (SKU)'::text),
      ('uom'::text, 'Mērvienība (UoM)'::text, 'Unit of measure (UoM)'::text, 'Ед. изм. (UoM)'::text),
      ('revision'::text, 'Revīzija'::text, 'Revision'::text, 'Ревизия'::text),
      ('lifecycle_status'::text, 'Statuss'::text, 'Status'::text, 'Статус'::text),
      ('valid_from'::text, 'Spēkā no'::text, 'Valid from'::text, 'Действует с'::text),
      ('valid_to'::text, 'Spēkā līdz'::text, 'Valid to'::text, 'Действует до'::text),
      ('supply_type'::text, 'Piegādes tips'::text, 'Supply type'::text, 'Тип обеспечения'::text),
      ('item_group'::text, 'Produktu grupa'::text, 'Item group'::text, 'Группа изделий'::text),
      ('route_code'::text, 'Maršruta kods'::text, 'Route code'::text, 'Код маршрута'::text),
      ('net_weight'::text, 'Neto svars (kg)'::text, 'Net weight (kg)'::text, 'Вес нетто (кг)'::text),
      ('volume'::text, 'Tilpums (m3)'::text, 'Volume (m3)'::text, 'Объем (м3)'::text),
      ('default_supplier'::text, 'Noklusētais piegādātājs'::text, 'Default supplier'::text, 'Поставщик по умолчанию'::text),
      ('quality_class'::text, 'Kvalitātes klase'::text, 'Quality class'::text, 'Класс качества'::text),
      ('certification_required'::text, 'Sertifikācija obligāta'::text, 'Certification required'::text, 'Сертификация обязательна'::text),
      ('production_notes'::text, 'Ražošanas piezīmes'::text, 'Production notes'::text, 'Производственные заметки'::text)
  ) as d(key, label_lv, label_en, label_ru)
),
primary_tables as (
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
rebuilt as (
  select
    pt.id,
    jsonb_agg(
      case
        when coalesce(lm_key.key, lm_sem.key) is null then elem.col
        else jsonb_set(
          elem.col,
          '{label}',
          to_jsonb(
            case tl.locale
              when 'en' then coalesce(lm_key.label_en, lm_sem.label_en)
              when 'ru' then coalesce(lm_key.label_ru, lm_sem.label_ru)
              else coalesce(lm_key.label_lv, lm_sem.label_lv)
            end
          ),
          true
        )
      end
      order by elem.ord
    ) as columns
  from primary_tables pt
  join tenant_locale tl
    on tl.tenant_id = pt.tenant_id
  cross join lateral jsonb_array_elements(coalesce(pt.options->'columns', '[]'::jsonb)) with ordinality as elem(col, ord)
  left join label_map lm_key
    on lm_key.key = lower(coalesce(elem.col->>'key', ''))
  left join label_map lm_sem
    on lm_sem.key = lower(coalesce(elem.col->>'semanticKey', ''))
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
