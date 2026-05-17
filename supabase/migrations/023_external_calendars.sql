create table if not exists public.external_calendars (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ics_url text not null,
  color text,
  visibility text default 'admin',
  created_at timestamptz default now()
);

create table if not exists public.external_calendar_events (
  id uuid primary key default gen_random_uuid(),
  external_calendar_id uuid not null references public.external_calendars(id) on delete cascade,
  external_event_id text not null,
  title text not null,
  description text,
  location text,
  start_time timestamptz not null,
  end_time timestamptz,
  all_day boolean default false,
  raw_event jsonb,
  last_synced_at timestamptz default now()
);

create unique index if not exists external_calendar_events_calendar_event_uid_idx
  on public.external_calendar_events(external_calendar_id, external_event_id);

create index if not exists external_calendar_events_calendar_id_idx
  on public.external_calendar_events(external_calendar_id);

create index if not exists external_calendar_events_start_time_idx
  on public.external_calendar_events(start_time);

alter table public.external_calendars enable row level security;
alter table public.external_calendar_events enable row level security;

drop policy if exists "admins manage external calendars" on public.external_calendars;
create policy "admins manage external calendars"
on public.external_calendars
for all
to authenticated
using (public.current_profile_is_admin())
with check (public.current_profile_is_admin());

drop policy if exists "admins manage external calendar events" on public.external_calendar_events;
create policy "admins manage external calendar events"
on public.external_calendar_events
for all
to authenticated
using (public.current_profile_is_admin())
with check (public.current_profile_is_admin());

insert into public.external_calendars (name, ics_url, color, visibility)
select 'Direction', '', 'direction', 'admin'
where not exists (
  select 1
  from public.external_calendars
  where lower(name) = 'direction'
);

do $$
declare
  realtime_table text;
  realtime_tables text[] := array[
    'external_calendars',
    'external_calendar_events'
  ];
begin
  foreach realtime_table in array realtime_tables loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = realtime_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', realtime_table);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
