# Production Workflow System (PWS) – Domain Model

## Core Principle

PWS is NOT an ERP.
PWS does NOT replace accounting systems.
PWS connects sales orders with real production execution.

---

## Multi-Tenancy

- One tenant = one factory
- Tenants are fully isolated
- Users belong to exactly one tenant (MVP)

---

## Canonical Hierarchy

Tenant  
└── Order (internal PWS order)  
  └── Item (logical product grouping)  
    └── Batch (production unit)  
      └── TimeLog (operator events)

---

## Orders

### ExternalOrder

- Read-only mirror from accounting (Horizon, etc.)
- Never edited inside PWS
- Synced or re-imported if source changes

### Order (PWS)

Internal coordination object.

**Order lifecycle ends before production starts.**

Statuses:

- Imported
- Reviewed
- To Produce
- Processing
- Ready for Production

Rules:

- Operators never interact with Orders
- Operator actions never change Order status

---

## Items (Product Classification)

Items are logical groupings, not production units.

Classification axes:

- System (PE 50, PE 68, PE 78, OF 90)
- Product Type (Door, Double Door, Window, Showcase)
- Technical Class (EI30, NHI, IW)

No deep category trees.
No ERP-style product catalogs.

---

## Production

### Batch (Work Order)

The only unit used in production execution.

Batch statuses:

- Scheduled
- In Progress
- Completed

Batch is created by Production Manager after Order is Ready.

---

## Operators & Time Tracking

Operators interact ONLY with batches.

Actions:

- Start
- Pause (with reason)
- Done

All actions create TimeLog entries.
TimeLogs are events, not state.

---

## Stop Reasons

Simple catalog, configurable per tenant.

Examples:

- Material missing
- Machine failure
- Waiting for drawings

---

## Non-Goals (MVP)

- No billing
- No capacity planning
- No automated scheduling
- No cross-tenant data
- No ERP-level normalization
