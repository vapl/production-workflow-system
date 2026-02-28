# Core Contract

This contract defines the execution-critical boundary of the system.

## Core Domain

- `orders`
- `batches`
- `batch_runs`
- `workstations`
- `production_status_events`

## Rules

1. `batch_runs` is the only execution state authority for production flow.
2. Status transitions must go through `public.transition_batch_run_status(...)`.
3. Direct writes to execution columns on `batch_runs` are forbidden.
4. `production_items` execution columns are read-only (`status`, `station_id`, `started_at`, `done_at`, `duration_minutes`) and are synchronized from `batch_runs`.
5. Extension layers (`external_jobs`, dynamic fields, hierarchy, QR, attachments, notifications) must not directly mutate execution state.

## Notes

- `production_items` remains the production payload/content model.
- `production_status_events` remains the audit/event timeline for transitions.
- `order_field_settings` is a UI configuration layer only (`is_active`, `is_required`, `show_in_table`, `sort_order`).
- Order execution/state logic must not depend on hierarchy or dynamic field structure.
