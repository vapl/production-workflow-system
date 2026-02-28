-- Rename legacy order hierarchy columns to explicit order field columns.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'hierarchy'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'order_field_values'
  ) then
    alter table public.orders rename column hierarchy to order_field_values;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'hierarchy_labels'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'order_field_labels'
  ) then
    alter table public.orders rename column hierarchy_labels to order_field_labels;
  end if;
end $$;
