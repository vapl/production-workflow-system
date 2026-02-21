-- Canonicalize legacy production role names.
-- Old -> New
--   Production manager -> Production planner
--   Production worker  -> Operator
--   Production         -> Warehouse

update public.profiles
set role = case role
  when 'Production manager' then 'Production planner'
  when 'Production worker' then 'Operator'
  when 'Production' then 'Warehouse'
  else role
end
where role in ('Production manager', 'Production worker', 'Production');

update public.user_invites
set role = case role
  when 'Production manager' then 'Production planner'
  when 'Production worker' then 'Operator'
  when 'Production' then 'Warehouse'
  else role
end
where role in ('Production manager', 'Production worker', 'Production');

update public.role_permissions rp
set allowed_roles = (
  select array_agg(
    case role_name
      when 'Production manager' then 'Production planner'
      when 'Production worker' then 'Operator'
      when 'Production' then 'Warehouse'
      else role_name
    end
  )
  from unnest(rp.allowed_roles) as role_name
)
where exists (
  select 1
  from unnest(rp.allowed_roles) as role_name
  where role_name in ('Production manager', 'Production worker', 'Production')
);

update public.tenant_settings ts
set notification_roles = (
  select jsonb_agg(
    case role_name
      when 'Production manager' then 'Production planner'
      when 'Production worker' then 'Operator'
      when 'Production' then 'Warehouse'
      else role_name
    end
  )
  from jsonb_array_elements_text(coalesce(ts.notification_roles, '[]'::jsonb)) as role_name
)
where ts.notification_roles is not null
  and exists (
    select 1
    from jsonb_array_elements_text(ts.notification_roles) as role_name
    where role_name in ('Production manager', 'Production worker', 'Production')
  );

update public.notifications n
set audience_roles = (
  select jsonb_agg(
    case role_name
      when 'Production manager' then 'Production planner'
      when 'Production worker' then 'Operator'
      when 'Production' then 'Warehouse'
      else role_name
    end
  )
  from jsonb_array_elements_text(coalesce(n.audience_roles, '[]'::jsonb)) as role_name
)
where n.audience_roles is not null
  and exists (
    select 1
    from jsonb_array_elements_text(n.audience_roles) as role_name
    where role_name in ('Production manager', 'Production worker', 'Production')
  );

-- Keep attachment default categories aligned with role rename.
update public.workflow_rules wr
set attachment_category_defaults =
  coalesce(
    (case
      when wr.attachment_category_defaults ? 'Production planner'
        then '{}'::jsonb
      when wr.attachment_category_defaults ? 'Production manager'
        then jsonb_build_object(
          'Production planner',
          wr.attachment_category_defaults->'Production manager'
        )
      else '{}'::jsonb
    end),
    '{}'::jsonb
  ) ||
  coalesce(
    (case
      when wr.attachment_category_defaults ? 'Operator'
        then '{}'::jsonb
      when wr.attachment_category_defaults ? 'Production worker'
        then jsonb_build_object(
          'Operator',
          wr.attachment_category_defaults->'Production worker'
        )
      else '{}'::jsonb
    end),
    '{}'::jsonb
  ) ||
  coalesce(
    (case
      when wr.attachment_category_defaults ? 'Warehouse'
        then '{}'::jsonb
      when wr.attachment_category_defaults ? 'Production'
        then jsonb_build_object(
          'Warehouse',
          wr.attachment_category_defaults->'Production'
        )
      else '{}'::jsonb
    end),
    '{}'::jsonb
  ) ||
  (wr.attachment_category_defaults
    - 'Production manager'
    - 'Production worker'
    - 'Production')
where wr.attachment_category_defaults is not null
  and (
    wr.attachment_category_defaults ? 'Production manager'
    or wr.attachment_category_defaults ? 'Production worker'
    or wr.attachment_category_defaults ? 'Production'
  );

