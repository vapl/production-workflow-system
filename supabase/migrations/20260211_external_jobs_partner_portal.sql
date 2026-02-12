create table if not exists public.tenant_subscriptions (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  plan_code text not null default 'basic'
    check (plan_code in ('basic', 'pro')),
  status text not null default 'active'
    check (status in ('active', 'trial', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_tenant_subscriptions_updated_at
  on public.tenant_subscriptions;
create trigger set_tenant_subscriptions_updated_at
  before update on public.tenant_subscriptions
  for each row execute function public.set_updated_at();

drop policy if exists "tenant_subscriptions_select_by_tenant" on public.tenant_subscriptions;
create policy "tenant_subscriptions_select_by_tenant" on public.tenant_subscriptions
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = tenant_subscriptions.tenant_id
    )
  );

drop policy if exists "tenant_subscriptions_insert_by_tenant" on public.tenant_subscriptions;
create policy "tenant_subscriptions_insert_by_tenant" on public.tenant_subscriptions
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = tenant_subscriptions.tenant_id
    )
  );

drop policy if exists "tenant_subscriptions_update_by_tenant" on public.tenant_subscriptions;
create policy "tenant_subscriptions_update_by_tenant" on public.tenant_subscriptions
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = tenant_subscriptions.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = tenant_subscriptions.tenant_id
    )
  );

alter table public.tenant_subscriptions enable row level security;
grant select, insert, update on public.tenant_subscriptions to authenticated;

alter table public.external_jobs
  add column if not exists request_mode text not null default 'manual'
    check (request_mode in ('manual', 'partner_portal')),
  add column if not exists partner_email text,
  add column if not exists partner_request_sent_at timestamptz,
  add column if not exists partner_request_token_hash text,
  add column if not exists partner_request_token_expires_at timestamptz,
  add column if not exists partner_request_viewed_at timestamptz,
  add column if not exists partner_response_submitted_at timestamptz,
  add column if not exists partner_response_order_number text,
  add column if not exists partner_response_due_date date,
  add column if not exists partner_response_note text;

create unique index if not exists external_jobs_partner_request_token_hash_uidx
  on public.external_jobs(partner_request_token_hash)
  where partner_request_token_hash is not null;
