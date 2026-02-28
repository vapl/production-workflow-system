-- Rename the actions field label to better reflect what the column shows.

update public.order_field_settings
set label = 'Activity'
where field_key = 'actions'
  and label is distinct from 'Activity';
