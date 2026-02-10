create unique index if not exists workflow_rules_tenant_id_key
  on public.workflow_rules(tenant_id);

alter table public.workflow_rules enable row level security;

drop policy if exists "workflow_rules_select_by_tenant" on public.workflow_rules;
create policy "workflow_rules_select_by_tenant" on public.workflow_rules
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workflow_rules.tenant_id
    )
  );

drop policy if exists "workflow_rules_insert_by_tenant" on public.workflow_rules;
create policy "workflow_rules_insert_by_tenant" on public.workflow_rules
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workflow_rules.tenant_id
    )
  );

drop policy if exists "workflow_rules_update_by_tenant" on public.workflow_rules;
create policy "workflow_rules_update_by_tenant" on public.workflow_rules
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workflow_rules.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workflow_rules.tenant_id
    )
  );

grant select, insert, update on public.workflow_rules to authenticated;
