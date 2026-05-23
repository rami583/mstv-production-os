create or replace function public.can_view_external_calendar(calendar_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_profile_is_admin()
    or exists (
      select 1
      from public.external_calendars calendar
      where calendar.id = $1
        and (
          calendar.visibility = 'team'
          or calendar.created_by_profile_id = auth.uid()
        )
    );
$$;

create or replace function public.can_view_event(event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_profile_is_admin()
    or (
      auth.uid() is not null
      and not exists (
        select 1
        from public.external_event_links link
        where link.event_id = $1
      )
    )
    or exists (
      select 1
      from public.external_event_links link
      join public.external_calendars calendar
        on calendar.id = link.external_calendar_id
      where link.event_id = $1
        and (
          calendar.visibility = 'team'
          or calendar.created_by_profile_id = auth.uid()
        )
    );
$$;

revoke all on function public.can_view_external_calendar(uuid) from public;
revoke all on function public.can_view_event(uuid) from public;
grant execute on function public.can_view_external_calendar(uuid) to authenticated;
grant execute on function public.can_view_event(uuid) to authenticated;

alter table public.events enable row level security;

drop policy if exists "prototype anon access" on public.events;
drop policy if exists "authenticated view visible events" on public.events;
create policy "authenticated view visible events"
on public.events
for select
to authenticated
using (
  public.can_view_event(id)
);

drop policy if exists "authenticated admins insert events" on public.events;
create policy "authenticated admins insert events"
on public.events
for insert
to authenticated
with check (
  public.current_profile_is_admin()
);

drop policy if exists "authenticated admins update events" on public.events;
create policy "authenticated admins update events"
on public.events
for update
to authenticated
using (
  public.current_profile_is_admin()
)
with check (
  public.current_profile_is_admin()
);

drop policy if exists "authenticated admins delete events" on public.events;
create policy "authenticated admins delete events"
on public.events
for delete
to authenticated
using (
  public.current_profile_is_admin()
);

notify pgrst, 'reload schema';
