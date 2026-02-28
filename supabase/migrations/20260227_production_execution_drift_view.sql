-- Drift diagnostics for execution state consistency between batch_runs and production_items.

create or replace view public.production_execution_drift as
with run_item_pairs as (
  select
    br.tenant_id,
    br.id as batch_run_id,
    br.order_id,
    br.batch_code,
    br.station_id,
    br.status as batch_run_status,
    br.updated_at as batch_run_updated_at,
    pi.id as production_item_id,
    pi.status as production_item_status,
    pi.updated_at as production_item_updated_at
  from public.batch_runs br
  left join public.production_items pi
    on pi.tenant_id = br.tenant_id
   and pi.order_id = br.order_id
   and pi.batch_code = br.batch_code
   and (
     (pi.station_id is null and br.station_id is null)
     or pi.station_id = br.station_id
   )
)
select
  'run_item_status_mismatch'::text as drift_type,
  rip.tenant_id,
  rip.batch_run_id,
  rip.production_item_id,
  rip.order_id,
  rip.batch_code,
  rip.station_id,
  rip.batch_run_status,
  rip.production_item_status,
  rip.batch_run_updated_at,
  rip.production_item_updated_at
from run_item_pairs rip
where rip.production_item_id is not null
  and rip.batch_run_status is distinct from rip.production_item_status

union all

select
  'run_without_items'::text as drift_type,
  br.tenant_id,
  br.id as batch_run_id,
  null::uuid as production_item_id,
  br.order_id,
  br.batch_code,
  br.station_id,
  br.status as batch_run_status,
  null::text as production_item_status,
  br.updated_at as batch_run_updated_at,
  null::timestamptz as production_item_updated_at
from public.batch_runs br
where not exists (
  select 1
  from public.production_items pi
  where pi.tenant_id = br.tenant_id
    and pi.order_id = br.order_id
    and pi.batch_code = br.batch_code
    and (
      (pi.station_id is null and br.station_id is null)
      or pi.station_id = br.station_id
    )
)

union all

select
  'item_without_run'::text as drift_type,
  pi.tenant_id,
  null::uuid as batch_run_id,
  pi.id as production_item_id,
  pi.order_id,
  pi.batch_code,
  pi.station_id,
  null::text as batch_run_status,
  pi.status as production_item_status,
  null::timestamptz as batch_run_updated_at,
  pi.updated_at as production_item_updated_at
from public.production_items pi
where not exists (
  select 1
  from public.batch_runs br
  where br.tenant_id = pi.tenant_id
    and br.order_id = pi.order_id
    and br.batch_code = pi.batch_code
    and (
      (pi.station_id is null and br.station_id is null)
      or pi.station_id = br.station_id
    )
);
