alter table if exists public.order_items
  drop column if exists source_field_id;

drop index if exists public.order_items_source_field_id_idx;

create unique index if not exists order_items_source_row_uidx
  on public.order_items(order_id, source_kind, source_row_id);
