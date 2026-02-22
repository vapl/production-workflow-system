-- Bulk RLS policy perf fix:
-- 1) Rewrite auth.uid() -> (select auth.uid()) in all public policies.
-- 2) Merge duplicate permissive profiles policies for SELECT/UPDATE.
-- 3) Remove duplicate workflow_rules unique index.
-- 4) Add covering indexes for linter-reported unindexed foreign keys.

do $$
declare
  rec record;
  role_list text;
  new_using text;
  new_check text;
  sql_stmt text;
begin
  for rec in
    select
      schemaname,
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') like '%auth.uid()%'
        or coalesce(with_check, '') like '%auth.uid()%'
      )
  loop
    new_using := case
      when rec.qual is null then null
      else regexp_replace(rec.qual, '\bauth\.uid\(\)', '(select auth.uid())', 'g')
    end;
    new_check := case
      when rec.with_check is null then null
      else regexp_replace(rec.with_check, '\bauth\.uid\(\)', '(select auth.uid())', 'g')
    end;

    role_list := null;
    if rec.roles is not null and array_length(rec.roles, 1) is not null then
      select string_agg(
        case
          when r = 'public' then 'public'
          else quote_ident(r)
        end,
        ', '
      )
      into role_list
      from unnest(rec.roles) as r;
    end if;

    execute format(
      'drop policy if exists %I on %I.%I',
      rec.policyname,
      rec.schemaname,
      rec.tablename
    );

    sql_stmt := format(
      'create policy %I on %I.%I as %s for %s',
      rec.policyname,
      rec.schemaname,
      rec.tablename,
      rec.permissive,
      rec.cmd
    );

    if role_list is not null and btrim(role_list) <> '' then
      sql_stmt := sql_stmt || ' to ' || role_list;
    end if;

    if new_using is not null then
      sql_stmt := sql_stmt || ' using (' || new_using || ')';
    end if;

    if new_check is not null then
      sql_stmt := sql_stmt || ' with check (' || new_check || ')';
    end if;

    execute sql_stmt;
  end loop;
end;
$$;

-- Merge duplicate permissive SELECT/UPDATE policies for profiles.
drop policy if exists "profiles_select_by_self" on public.profiles;
drop policy if exists "profiles_select_by_tenant_admin" on public.profiles;
create policy "profiles_select_combined" on public.profiles
  for select
  using (
    id = (select auth.uid())
    or (
      (select public.is_current_user_admin())
      and profiles.tenant_id = (select public.current_tenant_id())
    )
  );

drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "profiles_update_by_tenant_admin" on public.profiles;
create policy "profiles_update_combined" on public.profiles
  for update
  using (
    id = (select auth.uid())
    or (
      (select public.is_current_user_admin())
      and profiles.tenant_id = (select public.current_tenant_id())
    )
  )
  with check (
    id = (select auth.uid())
    or (
      (select public.is_current_user_admin())
      and profiles.tenant_id = (select public.current_tenant_id())
    )
  );

-- Remove duplicate index reported by linter.
drop index if exists public.workflow_rules_tenant_id_key;

-- Covering indexes for currently reported unindexed foreign keys.
create index if not exists batch_runs_blocked_by_idx
  on public.batch_runs(blocked_by);
create index if not exists batch_runs_blocked_reason_id_idx
  on public.batch_runs(blocked_reason_id);
create index if not exists external_job_field_values_field_id_idx
  on public.external_job_field_values(field_id);
create index if not exists external_jobs_partner_id_idx
  on public.external_jobs(partner_id);
create index if not exists external_jobs_received_by_idx
  on public.external_jobs(received_by);
create index if not exists order_attachments_added_by_idx
  on public.order_attachments(added_by);
create index if not exists order_comments_author_idx
  on public.order_comments(author);
create index if not exists order_input_values_field_id_idx
  on public.order_input_values(field_id);
create index if not exists order_production_maps_source_attachment_id_idx
  on public.order_production_maps(source_attachment_id);
create index if not exists order_status_history_order_id_idx
  on public.order_status_history(order_id);
create index if not exists production_items_source_attachment_id_idx
  on public.production_items(source_attachment_id);
create index if not exists production_qr_codes_created_by_idx
  on public.production_qr_codes(created_by);
create index if not exists production_qr_codes_field_id_idx
  on public.production_qr_codes(field_id);
create index if not exists production_qr_codes_order_id_idx
  on public.production_qr_codes(order_id);
create index if not exists production_status_events_batch_run_id_idx
  on public.production_status_events(batch_run_id);
create index if not exists production_status_events_production_item_id_idx
  on public.production_status_events(production_item_id);
create index if not exists production_status_events_reason_id_idx
  on public.production_status_events(reason_id);
create index if not exists user_invites_invited_by_idx
  on public.user_invites(invited_by);
