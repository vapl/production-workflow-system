# Fulcrum-style UX/flow benchmark for Production Workflow System

## 1) What is already aligned well

- Operator-first queue flow is in place (`/warehouse/queue` -> production operator view).
- External jobs and receive flow exist (`/warehouse/external`, `/warehouse/receive`).
- Status-driven production model exists (`queued`, `pending`, `in_progress`, `paused`, `blocked`, `done`).
- Role-based permissions are present (`production.view`, `production.operator.view`, `orders.manage`).
- Configurable production completion rule already exists (`workflow_rules.production_completion_config`).
- AI-assisted order input import exists in order detail (`/orders/[orderId]`).

## 2) Main gaps vs Fulcrum-style approach

### A. Shop-floor action discipline (high impact)

- `pause`/`block` should consistently require reason codes (not free text only).
- Reason taxonomy should be tenant-configurable in Settings.
- Every status transition should append immutable history (who, when, from, to, reason code, note).

### B. Queue visibility + ownership model

- If engineer takes an order, item should remain visible to other engineers.
- Editing rights should be owner-limited (or role-overridable), but visibility should stay shared.
- Queue cards should show ownership state clearly:
  - Unassigned
  - Assigned to me
  - Assigned to other user

### C. Scheduling and risk signals

- Add visible lateness risk and sequence priority markers in queue rows/cards.
- Add explicit "next recommended task" indicator per role.
- Add "aging in status" indicator for blocked/paused items.

### D. External + purchasing signal quality

- Normalize external order number source priority:
  1) manually entered value
  2) parsed/imported explicit value
  3) auto-generated fallback
- Add explicit badge to distinguish auto-generated external number from partner-provided number.
- In receive flow, enforce dependency checks with clear fail reason text.

### E. AI import review safety

- Keep preview + user confirmation before write (already partly present).
- Add per-field confidence and parser source snippet for traceability.
- Keep one-click rollback for last AI import batch.

## 3) Recommended rule matrix (Settings)

Add a compact "Execution Rules" section under Settings -> Workflow Rules:

- `assignment_mode`:
  - `manual_only`
  - `auto_assign_on_start`
  - `require_assignment_before_start`
- `visibility_mode`:
  - `shared_queue_owner_edit_only`
  - `owner_hidden_from_others` (not recommended)
- `pause_policy`:
  - `reason_required`
  - `reason_and_note_required`
- `block_policy`:
  - `reason_required`
  - `reason_and_resolution_eta_required`
- `completion_mode` (already exists):
  - `all_items_done`
  - `completion_stations_done`

## 4) 3-sprint implementation plan

## Sprint 1 (foundation, low risk)

- Introduce reason codes config in Settings (pause/block).
- Enforce reason code requirement in operator actions.
- Add immutable status history writes for every transition.
- Fix external order number precedence logic.

Deliverable: cleaner auditability and fewer ambiguous statuses.

## Sprint 2 (ownership + visibility)

- Implement shared visibility + owner-limited edit model for engineering queue.
- Add assignment chips and owner state in orders list and detail.
- Add permission override for Admin/Owner with explicit action logging.

Deliverable: no "disappearing orders", clear responsibility, controlled edits.

## Sprint 3 (flow optimization)

- Add risk/priority indicators (late risk, aging in status).
- Add "next action" hints on queue cards.
- Add AI import confidence + source snippet + rollback action.

Deliverable: faster daily operation and safer AI-assisted data entry.

## 5) Concrete acceptance criteria

- Engineer A starts task -> Engineer B still sees item in queue.
- Engineer B cannot edit owner-only fields unless privileged.
- Pause/Block cannot be submitted without required reason rule.
- Every status change appears in transition history with actor and timestamp.
- External order number shown in tables always matches source precedence.
- Mobile order-input table uses horizontal scroll and remains usable on small screens.

## 6) File touchpoints (current codebase)

- `src/app/orders/page.tsx`
- `src/app/orders/[orderId]/page.tsx`
- `src/app/production/operator/page.tsx`
- `src/app/settings/page.tsx`
- `src/components/dashboard/DashboardView.tsx`
- `src/lib/auth/permissions.ts`
- `src/lib/domain/productionCompletion.ts`
- `supabase/migrations/*` (status/reason/history/rules schema)

