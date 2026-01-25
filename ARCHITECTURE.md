# PWS Architecture Notes

## Frontend

- Next.js App Router
- React Context per domain area:
  - OrdersContext
  - ProductionContext

## Backend (planned)

- Supabase Postgres
- Row Level Security on all tenant data
- tenant_id on every table

## Design Rules

- Explicit code > abstractions
- No magic status transitions
- UI reflects domain, not vice versa
