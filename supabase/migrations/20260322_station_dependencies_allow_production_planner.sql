drop policy if exists "station_dependencies_select_by_tenant" on public.station_dependencies;
drop policy if exists "station_dependencies_insert_by_tenant" on public.station_dependencies;
drop policy if exists "station_dependencies_delete_by_tenant" on public.station_dependencies;

create policy "station_dependencies_select_by_tenant" on public.station_dependencies
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = station_dependencies.tenant_id
    )
  );

create policy "station_dependencies_insert_by_production_team" on public.station_dependencies
  for insert
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = station_dependencies.tenant_id
        and (
          coalesce(p.is_admin, false)
          or coalesce(p.is_owner, false)
          or coalesce(p.role, '') = 'Admin'
          or coalesce(p.role, '') = 'Production manager'
          or coalesce(p.role, '') = 'Production planner'
        )
    )
    and exists (
      select 1
      from public.workstations ws
      where ws.id = station_dependencies.station_id
        and ws.tenant_id = station_dependencies.tenant_id
    )
    and exists (
      select 1
      from public.workstations dep
      where dep.id = station_dependencies.depends_on_station_id
        and dep.tenant_id = station_dependencies.tenant_id
    )
  );

create policy "station_dependencies_delete_by_production_team" on public.station_dependencies
  for delete
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = station_dependencies.tenant_id
        and (
          coalesce(p.is_admin, false)
          or coalesce(p.is_owner, false)
          or coalesce(p.role, '') = 'Admin'
          or coalesce(p.role, '') = 'Production manager'
          or coalesce(p.role, '') = 'Production planner'
        )
    )
  );
