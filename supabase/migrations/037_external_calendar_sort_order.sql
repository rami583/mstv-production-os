alter table public.external_calendars
add column if not exists sort_order integer;

with ordered_calendars as (
  select
    id,
    row_number() over (
      partition by created_by_profile_id, provider_type, provider_account_id
      order by created_at asc, name asc, id asc
    ) as next_sort_order
  from public.external_calendars
  where sort_order is null
)
update public.external_calendars calendar
set sort_order = ordered_calendars.next_sort_order
from ordered_calendars
where calendar.id = ordered_calendars.id;

create index if not exists external_calendars_sort_order_idx
on public.external_calendars(created_by_profile_id, provider_type, provider_account_id, sort_order);
