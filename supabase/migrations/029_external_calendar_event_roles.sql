alter table public.external_calendars
add column if not exists calendar_role text not null default 'external_context';

alter table public.events
add column if not exists event_role text not null default 'production';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.external_calendars'::regclass
      and conname = 'external_calendars_calendar_role_check'
  ) then
    alter table public.external_calendars drop constraint external_calendars_calendar_role_check;
  end if;
end $$;

alter table public.external_calendars
add constraint external_calendars_calendar_role_check
check (calendar_role in ('business_primary', 'external_context'));

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.events'::regclass
      and conname = 'events_event_role_check'
  ) then
    alter table public.events drop constraint events_event_role_check;
  end if;
end $$;

alter table public.events
add constraint events_event_role_check
check (event_role in ('production', 'external_context'));

update public.external_calendars
set calendar_role = 'business_primary'
where name = 'Mon Studio TV'
  and provider_type = 'apple_caldav'
  and calendar_role = 'external_context';

update public.events event
set event_role = case
  when exists (
    select 1
    from public.external_event_links link
    join public.external_calendars calendar on calendar.id = link.external_calendar_id
    where link.event_id = event.id
      and calendar.calendar_role = 'business_primary'
  ) then 'production'
  when exists (
    select 1
    from public.external_event_links link
    join public.external_calendars calendar on calendar.id = link.external_calendar_id
    where link.event_id = event.id
      and calendar.calendar_role = 'external_context'
  ) then 'external_context'
  else event.event_role
end
where event.deleted_at is null;

create index if not exists external_calendars_calendar_role_idx
on public.external_calendars(calendar_role);

create index if not exists events_event_role_idx
on public.events(event_role);
