-- Align core order field sort order to match the order list table columns.

update public.order_field_settings ofs
set sort_order = mapped.sort_order
from (
  values
    ('order_number'::text, 10),
    ('customer_name'::text, 20),
    ('quantity'::text, 30),
    ('due_date'::text, 40),
    ('engineer'::text, 50),
    ('manager'::text, 60),
    ('priority'::text, 70),
    ('status'::text, 80),
    ('actions'::text, 90),
    ('delivery_address'::text, 100),
    ('customer_phone'::text, 110)
) as mapped(field_key, sort_order)
where ofs.field_key = mapped.field_key
  and ofs.sort_order is distinct from mapped.sort_order;
