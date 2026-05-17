alter table public.external_calendars
  add column if not exists created_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists created_by_name text;

update public.external_calendars
set visibility = 'admin_only'
where visibility = 'admin';

delete from public.external_calendars
where lower(name) = 'direction'
  and trim(coalesce(ics_url, '')) = ''
  and created_by_profile_id is null;

alter table public.external_calendars
alter column visibility set default 'private';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.external_calendars'::regclass
      and conname = 'external_calendars_visibility_check'
  ) then
    alter table public.external_calendars drop constraint external_calendars_visibility_check;
  end if;
end $$;

alter table public.external_calendars
add constraint external_calendars_visibility_check
check (visibility in ('admin_only', 'team', 'private'));

create index if not exists external_calendars_created_by_profile_id_idx
  on public.external_calendars(created_by_profile_id);

drop policy if exists "admins manage external calendars" on public.external_calendars;
drop policy if exists "authenticated view visible external calendars" on public.external_calendars;
create policy "authenticated view visible external calendars"
on public.external_calendars
for select
to authenticated
using (
  public.current_profile_is_admin()
  or visibility = 'team'
  or created_by_profile_id = auth.uid()
);

drop policy if exists "authenticated create external calendars" on public.external_calendars;
create policy "authenticated create external calendars"
on public.external_calendars
for insert
to authenticated
with check (
  public.current_profile_is_admin()
  or (
    visibility = 'private'
    and created_by_profile_id = auth.uid()
  )
);

drop policy if exists "authenticated update own or admin external calendars" on public.external_calendars;
create policy "authenticated update own or admin external calendars"
on public.external_calendars
for update
to authenticated
using (
  public.current_profile_is_admin()
  or created_by_profile_id = auth.uid()
)
with check (
  public.current_profile_is_admin()
  or (
    created_by_profile_id = auth.uid()
    and visibility = 'private'
  )
);

drop policy if exists "authenticated delete own or admin external calendars" on public.external_calendars;
create policy "authenticated delete own or admin external calendars"
on public.external_calendars
for delete
to authenticated
using (
  public.current_profile_is_admin()
  or created_by_profile_id = auth.uid()
);

drop policy if exists "admins manage external calendar events" on public.external_calendar_events;
drop policy if exists "authenticated view visible external calendar events" on public.external_calendar_events;
create policy "authenticated view visible external calendar events"
on public.external_calendar_events
for select
to authenticated
using (
  exists (
    select 1
    from public.external_calendars calendar
    where calendar.id = external_calendar_events.external_calendar_id
      and (
        public.current_profile_is_admin()
        or calendar.visibility = 'team'
        or calendar.created_by_profile_id = auth.uid()
      )
  )
);

drop policy if exists "authenticated manage own or admin external calendar events" on public.external_calendar_events;
create policy "authenticated manage own or admin external calendar events"
on public.external_calendar_events
for all
to authenticated
using (
  exists (
    select 1
    from public.external_calendars calendar
    where calendar.id = external_calendar_events.external_calendar_id
      and (
        public.current_profile_is_admin()
        or calendar.created_by_profile_id = auth.uid()
      )
  )
)
with check (
  exists (
    select 1
    from public.external_calendars calendar
    where calendar.id = external_calendar_events.external_calendar_id
      and (
        public.current_profile_is_admin()
        or calendar.created_by_profile_id = auth.uid()
      )
  )
);

notify pgrst, 'reload schema';
