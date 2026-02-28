-- Drop unused legacy order field reference tables.
-- The app now uses order_field_settings for configuration and free-form order_field_values on orders.

drop table if exists public.order_field_options cascade;
drop table if exists public.order_fields cascade;
drop table if exists public.hierarchy_nodes cascade;
drop table if exists public.hierarchy_levels cascade;
