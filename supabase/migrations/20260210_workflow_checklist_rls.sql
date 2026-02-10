create index if not exists workflow_checklist_items_tenant_id_idx
  on public.workflow_checklist_items(tenant_id);

alter table public.workflow_checklist_items enable row level security;

drop policy if exists "workflow_checklist_items_select_by_tenant" on public.workflow_checklist_items;
create policy "workflow_checklist_items_select_by_tenant" on public.workflow_checklist_items
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workflow_checklist_items.tenant_id
    )
  );

drop policy if exists "workflow_checklist_items_insert_by_tenant" on public.workflow_checklist_items;
create policy "workflow_checklist_items_insert_by_tenant" on public.workflow_checklist_items
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workflow_checklist_items.tenant_id
    )
  );

drop policy if exists "workflow_checklist_items_update_by_tenant" on public.workflow_checklist_items;
create policy "workflow_checklist_items_update_by_tenant" on public.workflow_checklist_items
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workflow_checklist_items.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workflow_checklist_items.tenant_id
    )
  );

drop policy if exists "workflow_checklist_items_delete_by_tenant" on public.workflow_checklist_items;
create policy "workflow_checklist_items_delete_by_tenant" on public.workflow_checklist_items
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = workflow_checklist_items.tenant_id
    )
  );

grant select, insert, update, delete on public.workflow_checklist_items to authenticated;
