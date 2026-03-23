# Production Module Architecture

This document defines a practical target architecture for the `Ražošana` module based on the current PWS domain and schema.

It is intentionally aligned with what already exists in the codebase and database, so the redesign can be delivered incrementally instead of replacing the production model from scratch.

## 1. Current Ground Truth

The current production model already has a usable execution core:

- `orders`
  - `order_number`
  - `customer_name`
  - `product_name`
  - `quantity`
  - `due_date`
  - `priority`
  - `order_field_values`
  - `order_field_labels`
- `order_items`
  - `order_id`
  - `position`
  - `item_name`
  - `item_type`
  - `qty`
  - `material`
  - `dimensions`
  - `attributes`
- `order_item_documents`
  - links item-level production/source/reference attachments
- `order_item_bom_lines`
  - `order_item_id`
  - `component_code`
  - `component_name`
  - `component_type`
  - `qty`
  - `unit`
  - `length`
  - `width`
  - `height`
  - `attributes`
  - `source_kind`
- `workstations`
  - `name`
  - `description`
  - `tracking_mode`
  - `is_active`
  - `sort_order`
- `station_dependencies`
  - dependency chain between stations
- `operators`
  - `name`
  - `role`
  - `station_id`
  - `is_active`
- `operator_station_assignments`
  - many-to-many operator/station assignments
- `production_items`
  - `order_id`
  - `batch_code`
  - `item_name`
  - `qty`
  - `material`
  - `dimensions`
  - `priority`
  - `status`
  - `station_id`
  - `meta`
  - `started_at`
  - `done_at`
  - `duration_minutes`
- `batch_runs`
  - `order_id`
  - `batch_code`
  - `station_id`
  - `route_key`
  - `step_index`
  - `status`
  - `blocked_reason`
  - `blocked_reason_id`
  - `planned_date`
  - `started_at`
  - `done_at`
  - `duration_minutes`
- `production_status_events`
  - execution audit trail

Important execution rule:

- `batch_runs` is the execution authority.
- `production_items` is the payload/content model for production rows.
- Execution state must flow through `transition_batch_run_status(...)`.

## 2. Current UI Ground Truth

The current `/production` page already mixes three concepts:

- `Gatavs ražošanai`
- `Staciju rindas`
- `Pasūtījumi / QR / kalendāra tipa pārskats`

The current `/production/operator` page already covers:

- station queue by selected date
- operator execution actions
- station tracking modes:
  - `construction_level`
  - `order_level`
  - `receipt_only`

This means the redesign should not rebuild the execution engine. It should reorganize the planner and manager UX around the existing core.

## 3. Target Module Structure

Top-level production navigation should become:

1. `Gatavs ražošanai`
2. `Darba uzdevumi`
3. `Staciju rindas`
4. `Operatori`
5. `Pārskati`

Recommended routes:

```text
/production/ready
/production/jobs
/production/jobs/:jobId
/production/queues
/production/operators
/production/operators/:operatorId
/production/reports
```

`/production` itself should redirect to `/production/ready` or open it as the default view.

## 4. Canonical View Objects

To avoid mixing levels, each page should operate on a clear primary object.

### 4.1 Ready List Object

Primary object: `Ready Production Job`

Derived from:

- `orders`
- `order_items`
- `order_item_bom_lines`
- `order_item_documents`
- `order_production_maps`
- `production_items`

Natural grouping key:

- `order_id`
- optionally split by `batch_code`

Why:

- this is the dispatcher view
- this is where the user decides whether a job is complete enough to release into queues

### 4.2 Job Detail Object

Primary object: `Production Job`

Recommended identity:

- `order_id`
- secondary grouping by `batch_code`

Backed by:

- `orders`
- `order_items`
- `order_item_bom_lines`
- `order_item_documents`
- `production_items`
- `batch_runs`
- `production_status_events`

Why:

- this is the best place to show KPI, BOM, files, unit-level rows, routing, station assignments, and release controls

### 4.3 Station Queue Object

Primary object: `Queue Operation`

Backed by:

- `batch_runs`
- joined `orders`
- related `production_items`
- `workstations`
- `station_dependencies`

Identity:

- `batch_run.id`

Why:

- queue planning is not a whole-order view
- queue planning is an operation/station/date view

### 4.4 Operator Object

Primary object: `Operator Performance Record`

Backed by:

- `operators`
- `operator_station_assignments`
- `batch_runs`
- `production_items`
- `production_status_events`

Why:

- operator analysis is a people/throughput/cost view, not a planning view

## 5. Page Architecture

## 5.1 Page: Gatavs ražošanai

Purpose:

- show which jobs can be released
- show what is blocked
- let planner open one job and prepare it properly

Layout:

- KPI row
- filters/search
- full-width list of cards
- bulk actions bar

Top KPI cards:

- `Ready`
- `Blocked`
- `Late`
- `Due this week`
- `Missing BOM`
- `Missing routing`
- `Missing production files`
- `Released today`

Filters:

- search by `order_number`, `customer_name`, `item_name`, `batch_code`
- priority
- due date range
- readiness status
- station relevance
- has BOM / no BOM
- has files / no files

Card fields should prefer existing data first:

- `orders.order_number`
- `orders.customer_name`
- `orders.due_date`
- `orders.priority`
- `order_items.item_name`
- `order_items.qty`
- `order_items.material`
- `production_items.batch_code`
- `orders.product_name`
- `order_items.attributes`
- production notes from existing construction/order fields when present

Card actions:

- `Open`
- `Release selected`
- `Print QR`
- `Add task`

Readiness badges should be derived as follows:

- `BOM ready`
  - true if item has `order_item_bom_lines`
- `Files ready`
  - true if item has `order_item_documents` with role `production` or usable source docs
- `Units ready`
  - true if `production_items` exist for the order/group
- `Queue released`
  - true if `batch_runs` exist
- `Missing routing`
  - true if no usable `order_production_maps.mapping` or no station sequence can be built

Notes:

- do not keep this as a small left sidebar
- this should become the main production landing page

## 5.2 Page: Darba uzdevumu saraksts

Purpose:

- provide a searchable registry of all released and unreleased production jobs
- work as a management list, not as a queue board

Primary row/card:

- one job grouped by `order_id` plus `batch_code` when needed

Suggested columns:

- order number
- customer
- construction summary
- qty
- due date
- priority
- released status
- current station
- progress
- total logged time
- late risk

This page can reuse most of the current list/QR aggregation logic from `src/app/(app)/production/page.tsx`.

## 5.3 Page: Darba uzdevuma detaļas

Purpose:

- become the Fulcrum-like job page
- central place for preparation and review before release

Use a dedicated page, not a large modal.

### Header

Show:

- `order_number`
- `customer_name`
- `product_name`
- due date
- priority
- job status
- release status

### KPI row

Show only metrics derivable from current data first:

- planned queue steps count
- completed steps count
- progress percent
- total quantity
- total actual time
- due status
- blocked steps count

Future KPI after schema extension:

- labor cost
- margin
- expected vs actual hours

### Main sections

#### A. Overview

- order summary
- production notes
- primary construction summary
- key attachments

Sources:

- `orders`
- `order_items`
- `order_items.production_notes` if present
- `order_item_documents`
- `order_attachments`

#### B. Units / Constructions

Show each production row based on existing `production_items` and source `order_items`.

Useful existing fields:

- `batch_code`
- `item_name`
- `qty`
- `material`
- `dimensions`
- `meta.rowKey`
- `meta.rowIndex`
- `station_id`
- `status`

This section should make it easy to see:

- what exactly is being produced
- whether it has already been split into units/batches
- which station currently owns it

#### C. BOM

Back this directly with `order_item_bom_lines`.

Useful fields:

- `component_code`
- `component_name`
- `component_type`
- `qty`
- `unit`
- `length`
- `width`
- `height`
- `attributes`
- `source_kind`

Important:

- there is already a real BOM table in the schema
- this should be used instead of inventing a new BOM storage model

#### D. Routing and Station Assignment

Use existing queue/execution data:

- `order_production_maps.mapping`
- `batch_runs.route_key`
- `batch_runs.step_index`
- `batch_runs.station_id`
- `batch_runs.planned_date`

Actions:

- assign station sequence
- split by stations
- move planned date
- release to queue

#### E. Activity

Use:

- `production_status_events`

Show:

- status changes
- block reasons
- who changed what
- when release and execution events happened

### Primary actions

- `Release to queue`
- `Assign stations`
- `Split units`
- `Reschedule`
- `Open order`

## 5.4 Page: Staciju rindas

Purpose:

- planner/supervisor board for sequencing station work

This should be a dedicated page, separate from the ready list.

Layout:

- top controls row
- station columns
- each card = one queue operation from `batch_runs`

Column header should show:

- station name
- tracking mode
- queue count
- backlog hours
- late items count
- blocked items count

Data sources:

- `workstations`
- `batch_runs`
- related `orders`
- related `production_items`

Card fields:

- `orders.order_number`
- `orders.customer_name`
- `batch_runs.batch_code`
- `production_items.item_name`
- `production_items.qty`
- `orders.due_date`
- `orders.priority`
- `batch_runs.status`
- `batch_runs.planned_date`
- `batch_runs.blocked_reason`
- `batch_runs.duration_minutes`
- `batch_runs.route_key`
- `batch_runs.step_index`

Actions:

- drag reorder within station
- move to another date
- move to another station when allowed
- open job detail
- open operator queue

Important:

- this page should stay batch-run centric
- do not collapse it back into whole-order cards

## 5.5 Page: Operatori

Purpose:

- show operator workload, throughput, and future labor-cost reporting

Current data already supports a basic operator page, but not a full cost model.

Base list fields from current schema:

- `operators.name`
- `operators.role`
- `operators.station_id`
- `operators.is_active`
- `operator_station_assignments.station_id`

Derivable KPI from current execution data:

- total worked minutes
- completed constructions count
- handled orders count
- stations worked on
- active queue items

Derivation sources:

- `production_items.duration_minutes`
- `production_items.done_at`
- `batch_runs.duration_minutes`
- `production_status_events`

Current limitation:

- there is no `hourly_rate` on `operators`
- there is no true normalized timesheet table

Therefore first release should include:

- operator list
- productivity KPI
- time by order
- time by construction/unit
- time by station

Recommended later schema extension:

- add `hourly_rate`
- add `overtime_rate`
- optionally add `operator_time_entries` if per-operator cost accounting becomes critical

## 5.6 Page: Pārskati

Purpose:

- management analytics only

Suggested sections:

- on-time delivery trend
- station bottlenecks
- queue backlog
- operator productivity
- blocked reasons frequency
- production lead time

This page should consume aggregated data and not become the operational workspace.

## 6. Existing Fields That Should Be Reused

The redesign should explicitly reuse these existing fields before adding anything new.

### Orders

- `order_number`
- `customer_name`
- `product_name`
- `quantity`
- `due_date`
- `priority`
- `order_field_values`
- `order_field_labels`

### Construction / unit level

- `order_items.position`
- `order_items.item_name`
- `order_items.item_type`
- `order_items.qty`
- `order_items.material`
- `order_items.dimensions`
- `order_items.attributes`
- `order_items.production_notes`

### BOM

- `order_item_bom_lines.*`

### Files

- `order_item_documents.role`
- `order_attachments`
- `production_items.source_attachment_id`

### Production unit / execution payload

- `production_items.batch_code`
- `production_items.item_name`
- `production_items.qty`
- `production_items.material`
- `production_items.dimensions`
- `production_items.priority`
- `production_items.status`
- `production_items.station_id`
- `production_items.meta`
- `production_items.duration_minutes`

### Queue / schedule

- `batch_runs.station_id`
- `batch_runs.route_key`
- `batch_runs.step_index`
- `batch_runs.status`
- `batch_runs.blocked_reason`
- `batch_runs.planned_date`
- `batch_runs.started_at`
- `batch_runs.done_at`
- `batch_runs.duration_minutes`

### Station configuration

- `workstations.tracking_mode`
- `station_dependencies`
- `construction_items.default_stations`

## 7. Where New Fields Are Actually Needed

Not everything requires schema changes. The first redesign can be built mostly from current tables.

### Can be derived without schema change

- ready / released / blocked / late counts
- progress
- queue position display
- backlog hours
- BOM presence
- file presence
- job-level aggregates
- operator worked time

### Likely needs schema change later

- operator labor rates
- operator overtime rates
- explicit job-level release status if current derivation becomes too implicit
- explicit planning priority score
- setup group / family grouping for better scheduling

Recommended future additions:

- `operators.hourly_rate numeric`
- `operators.overtime_rate numeric`
- `batch_runs.priority_score numeric`
- `batch_runs.setup_group text`

These should be phase 2 or later, not required to start the UX rebuild.

## 8. Delivery Phases

### Phase 1

- make `Gatavs ražošanai` a full page
- create `/production/jobs/:jobId`
- reuse existing orders/items/BOM/files/queue data
- keep current operator execution model intact

### Phase 2

- extract `Staciju rindas` into its own full page
- improve station column KPI
- add queue interactions and better backlog visibility

### Phase 3

- add `Operatori` page
- expose KPI and time by order/unit/station
- only then extend operator cost fields if needed

### Phase 4

- add management `Pārskati`
- add advanced planning fields such as setup grouping and scoring

## 9. Non-Goals for the First Rebuild

- replacing `batch_runs` as execution authority
- replacing `production_items` with a new production unit table
- inventing a second BOM model
- forcing everything into one mega production page
- building cost accounting before operator visibility exists

## 10. Final Recommendation

The production redesign should be built around this split:

- `Gatavs ražošanai` = dispatch and release
- `Darba uzdevums` = preparation and review
- `Staciju rindas` = sequencing and planning
- `Operatori` = performance and labor visibility
- `Pārskati` = management analytics

This matches the current PWS schema well enough to start implementation immediately, while leaving room for later additions such as labor rates and scheduling optimization fields.
