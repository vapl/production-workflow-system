alter table public.production_qr_codes
  add column if not exists source_row_id text;

create unique index if not exists production_qr_codes_source_row_uidx
  on public.production_qr_codes(tenant_id, order_id, source_row_id)
  where source_row_id is not null;

create index if not exists production_qr_codes_source_row_idx
  on public.production_qr_codes(source_row_id);
