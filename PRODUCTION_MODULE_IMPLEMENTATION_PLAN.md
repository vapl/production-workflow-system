# Production Module Implementation Plan

This plan translates `PRODUCTION_MODULE_ARCHITECTURE.md` into an incremental delivery roadmap for the current PWS codebase.

It is written against the current implementation in:

- `src/app/(app)/production/page.tsx`
- `src/app/(app)/production/operator/page.tsx`
- `src/lib/domain/productionQueue.ts`
- `src/lib/domain/buildProductionSplitRows.ts`
- `src/lib/domain/orderItems.ts`
- `src/lib/domain/prepareProductionQrRows.ts`
- `src/lib/domain/transitionBatchRunStatus.ts`
- `supabase/schema.sql`

## 1. Delivery Strategy

Do not rewrite the execution core.

Keep:

- `batch_runs` as execution authority
- `production_items` as production payload / unit rows
- `/production/operator` as the active operator execution surface

Refactor:

- `/production` from one mixed workspace into separate planner/manager pages

Implementation order:

1. extract data layer from current `/production`
2. ship `Gatavs ražošanai`
3. ship `Darba uzdevuma` page
4. extract `Staciju rindas`
5. add `Operatori`
6. add `Pārskati`

## 2. Phase Overview

## Phase 0: Stabilize Current Production Page

Goal:

- reduce risk before splitting the page into multiple routes

### Tasks

- identify and isolate reusable selectors/helpers from `src/app/(app)/production/page.tsx`
- stop adding new feature logic directly inside the page component
- define shared types for:
  - ready job card
  - job detail aggregate
  - station queue card
  - operator KPI row

### Extract into new modules

- `src/lib/domain/productionReady.ts`
- `src/lib/domain/productionJobDetail.ts`
- `src/lib/domain/productionQueueMetrics.ts`
- `src/types/production.ts`

### Reuse from existing code

- `buildQueueByStation`
- `filterReadyBatchGroups`
- `buildProductionSplitRows`
- `buildConstructionRowsFromOrderItems`
- `prepareProductionQrRows`

### Acceptance criteria

- `/production` still works exactly as before
- core query/derivation logic lives outside the page component

## Phase 1: Build `Gatavs ražošanai`

Route:

- `/production/ready`

Goal:

- replace current small ready sidebar with a full dispatch page

### UI scope

- KPI row
- search and filters
- full job card list
- bulk actions
- `Open` action to job detail

### Data sources

- `orders`
- `order_items`
- `order_item_bom_lines`
- `order_item_documents`
- `production_items`
- `batch_runs`
- `order_production_maps`

### New selectors / loaders

- `loadReadyProductionJobs(tenantId)`
- `buildReadyProductionJobs(...)`
- `computeReadyProductionKpis(...)`

### Card data contract

- order id
- order number
- customer name
- due date
- priority
- product/construction summary
- quantity summary
- batch code summary
- BOM status
- file status
- routing status
- released status
- blocked status

### Existing logic to reuse

- ready grouping from `buildProductionSplitRows.ts`
- search/priority filtering from `productionQueue.ts`
- construction extraction from `orderItems.ts`

### New components

- `src/components/production/ReadyKpiRow.tsx`
- `src/components/production/ReadyFilters.tsx`
- `src/components/production/ReadyJobCard.tsx`
- `src/components/production/ReadyJobList.tsx`

### File touchpoints

- add `src/app/(app)/production/ready/page.tsx`
- update navigation in `src/components/layout/AppShell.tsx`
- update tabs/nav if production subnav exists

### Acceptance criteria

- user can open a dedicated ready page
- user can filter by search and priority
- user sees whether BOM/files/routing are missing
- user can open job detail from each card

## Phase 2: Build `Darba uzdevuma` detail page

Routes:

- `/production/jobs`
- `/production/jobs/[jobId]`

Goal:

- create the Fulcrum-like central job page

### Page sections

- header
- KPI row
- overview
- units/constructions
- BOM
- routing and station assignments
- files
- activity timeline

### Data shape

Create a dedicated aggregate builder:

- `loadProductionJobDetail(orderId)`

Return:

- order summary
- order items
- manufacturing units
- BOM lines
- production files
- production items
- batch runs
- status events
- derived KPI

### Existing sources to reuse

- `order_items` and `mapOrderItemRow`
- `order_item_bom_lines`
- `order_item_documents`
- `production_items`
- `batch_runs`
- `production_status_events`

### New components

- `src/components/production/job/ProductionJobHeader.tsx`
- `src/components/production/job/ProductionJobKpis.tsx`
- `src/components/production/job/ProductionJobOverview.tsx`
- `src/components/production/job/ProductionJobUnits.tsx`
- `src/components/production/job/ProductionJobBom.tsx`
- `src/components/production/job/ProductionJobRouting.tsx`
- `src/components/production/job/ProductionJobFiles.tsx`
- `src/components/production/job/ProductionJobTimeline.tsx`

### Functional actions in first release

- open linked order
- view BOM
- view files
- release to queue
- move planned date
- assign route/station sequence using current route model

### First release constraint

- do not invent a new production-job table
- use `order_id` as route identity

### Acceptance criteria

- planner can open one job on a dedicated page
- planner can see units, BOM, files, routing, and timeline in one place
- planner can release or reschedule through existing `batch_runs`

## Phase 3: Split out `Staciju rindas`

Route:

- `/production/queues`

Goal:

- move station planning into its own dedicated planner page

### UI scope

- station columns
- backlog and KPI per station
- queue cards by `batch_runs`
- date range controls
- search and filters

### Reuse

- `buildQueueByStation`
- `workstations`
- `batch_runs`
- `production_items`
- current planned date logic from `/production/page.tsx`

### Refactor needed

Current `buildQueueByStation` is enough for baseline, but should be extended to return:

- late flag
- blocked flag
- route key
- step index
- total duration
- station-specific counts

### Add new helper

- `computeStationQueueMetrics(batchRuns, productionItems, stations, viewDate, range)`

### New components

- `src/components/production/queue/StationQueueBoard.tsx`
- `src/components/production/queue/StationQueueColumn.tsx`
- `src/components/production/queue/StationQueueCard.tsx`
- `src/components/production/queue/StationQueueToolbar.tsx`

### Interaction scope for first release

- open job detail
- bulk move planned date
- open operator view for station

### Interaction scope for second release

- drag reorder
- cross-station move

### Acceptance criteria

- planner can see all stations in one dedicated page
- station header shows queue count and backlog
- queue cards are batch-run based, not whole-order based
- planned date updates continue using existing `batch_runs.planned_date`

## Phase 4: Build `Operatori`

Routes:

- `/production/operators`
- `/production/operators/[operatorId]`

Goal:

- expose operator productivity and time visibility without changing operator execution flow

### Existing data constraints

Current schema supports:

- operator identity
- station assignment
- aggregate work duration

Current schema does not support:

- hourly rate
- overtime rate
- normalized per-operator time entries

### First release scope

- operator list
- KPI row
- per-operator detail view
- time by order
- time by construction/unit
- time by station

### Data sources

- `operators`
- `operator_station_assignments`
- `production_items.duration_minutes`
- `production_items.done_at`
- `batch_runs.duration_minutes`
- `production_status_events`

### Likely implementation approach

- build aggregate queries in client/server data layer
- mirror the logic already used by dashboard operator performance widgets

### Reuse

- operator-related aggregation ideas from `src/components/dashboard/OperatorPerformancePanel.tsx`

### New components

- `src/components/production/operators/OperatorKpiRow.tsx`
- `src/components/production/operators/OperatorList.tsx`
- `src/components/production/operators/OperatorSummaryCard.tsx`
- `src/components/production/operators/OperatorTimeBreakdown.tsx`

### Acceptance criteria

- manager can see operator worked time and output
- manager can drill down by order, construction, and station

## Phase 5: Schema extension for labor rates

Goal:

- support real operator cost visibility

### Migration

Add to `operators`:

- `hourly_rate numeric null`
- `overtime_rate numeric null`

Optional later:

- `cost_currency text null`

### UI additions

- operator form fields for rates
- labor-cost KPI on operator detail
- labor-cost rollup in reports

### Acceptance criteria

- manager can configure operator hourly rate
- cost KPI is derived from worked time and stored rate

## Phase 6: Build `Pārskati`

Route:

- `/production/reports`

Goal:

- consolidate production analytics without polluting planning pages

### Report groups

- on-time delivery
- backlog by station
- blocked reasons
- operator productivity
- total worked time
- completed constructions/orders

### Existing data sources

- `batch_runs`
- `production_items`
- `production_status_events`
- `orders`
- `operators`

### Reuse

- `dashboardKpis.ts`
- `getRecentActivities.ts`
- `getBottleneckBatches.ts`
- operator dashboard aggregation patterns

### Acceptance criteria

- management gets a distinct reporting area
- operational pages stay lean

## 3. Suggested File Structure

```text
src/
  app/(app)/production/
    page.tsx                -> redirect or overview shell
    ready/page.tsx
    jobs/page.tsx
    jobs/[jobId]/page.tsx
    queues/page.tsx
    operators/page.tsx
    operators/[operatorId]/page.tsx
    reports/page.tsx
    operator/page.tsx       -> keep existing execution screen

  components/production/
    ReadyKpiRow.tsx
    ReadyFilters.tsx
    ReadyJobCard.tsx
    ReadyJobList.tsx
    job/
    queue/
    operators/

  lib/domain/
    productionReady.ts
    productionJobDetail.ts
    productionQueueMetrics.ts
    productionOperators.ts
    productionReports.ts

  types/
    production.ts
```

## 4. Concrete Refactor Plan for Existing `/production`

Current problem:

- `src/app/(app)/production/page.tsx` mixes:
  - ready list
  - queue board
  - QR/print table
  - planning actions
  - file preview logic
  - route selection

### Step-by-step refactor

1. extract all type declarations to `src/types/production.ts`
2. move ready-group derivation into `productionReady.ts`
3. move station queue derivation into `productionQueueMetrics.ts`
4. move job aggregate derivation into `productionJobDetail.ts`
5. create new routes using these shared loaders/selectors
6. reduce old `/production/page.tsx` to a navigation shell or redirect

### Hard rule

Do not copy-paste the current page into multiple new pages.

Instead:

- extract derivation logic first
- then compose smaller pages from shared selectors and smaller components

## 5. Data-Layer Implementation Tasks

## 5.1 Add shared production types

Create `src/types/production.ts` with:

- `ProductionPriority`
- `ProductionStatus`
- `ReadyProductionJob`
- `ProductionJobDetail`
- `StationQueueCard`
- `OperatorKpiRow`

## 5.2 Add ready-job selector

Create `src/lib/domain/productionReady.ts`:

- `buildReadyProductionJobs`
- `filterReadyProductionJobs`
- `computeReadyProductionKpis`

Inputs:

- orders
- order items
- bom lines
- files
- production items
- batch runs

## 5.3 Add job-detail selector

Create `src/lib/domain/productionJobDetail.ts`:

- `buildProductionJobDetail`
- `computeProductionJobKpis`

## 5.4 Extend queue metrics helper

Create `src/lib/domain/productionQueueMetrics.ts`:

- `buildStationQueueCards`
- `computeStationBacklog`
- `computeStationLateCounts`
- `computeStationBlockedCounts`

This should wrap and gradually replace direct use of `buildQueueByStation`.

## 5.5 Add operator aggregates

Create `src/lib/domain/productionOperators.ts`:

- `buildOperatorSummaryRows`
- `buildOperatorOrderBreakdown`
- `buildOperatorUnitBreakdown`
- `buildOperatorStationBreakdown`

## 6. Permissions and Navigation Tasks

Current permission model already distinguishes:

- `production.view`
- `production.operator.view`

### Tasks

- keep operator route accessible for workers
- keep planner pages under `production.view`
- add production subnavigation component if needed

### Files

- `src/lib/auth/permissions.ts`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/TabsNav.tsx`

## 7. Schema Tasks

## 7.1 No-schema-change phases

Phases 0-4 should be possible without breaking schema changes.

## 7.2 Deferred migrations

Create migrations only when Phase 5 starts:

- add operator rates
- optional queue scoring/setup grouping fields

Suggested future migrations:

- `supabase/migrations/*_operator_labor_rates.sql`
- `supabase/migrations/*_batch_runs_queue_priority.sql`

## 8. QA Plan

## 8.1 Regression checks after Phase 1

- existing `/production/operator` still loads queue
- `transitionBatchRunStatus(...)` flow still works
- ready jobs shown on new page match old ready sidebar counts

## 8.2 Regression checks after Phase 2

- job detail reflects correct BOM/files/items/runs
- release action creates/updates the same queue state as before
- no drift introduced between `batch_runs` and `production_items`

## 8.3 Regression checks after Phase 3

- station queue counts match current planner view
- planned date updates still work
- station filtering remains correct

## 8.4 Regression checks after Phase 4

- operator time totals reconcile with existing dashboard metrics
- no hidden dependency on missing hourly-rate fields

## 9. Recommended Sprint Plan

## Sprint 1

- Phase 0
- Phase 1

Deliverable:

- production ready page live

## Sprint 2

- Phase 2

Deliverable:

- production job detail page live

## Sprint 3

- Phase 3

Deliverable:

- dedicated station queue page live

## Sprint 4

- Phase 4

Deliverable:

- operator page live

## Sprint 5

- Phase 5
- Phase 6

Deliverable:

- labor rates and reports

## 10. Recommended Immediate Next Step

Start with Phase 0, not UI building.

The first concrete coding task should be:

1. create `src/types/production.ts`
2. extract ready-list derivation from `src/app/(app)/production/page.tsx`
3. create `/production/ready`
4. wire navigation to the new page

That sequence gives the lowest-risk path from the current monolithic page to the new production module structure.
