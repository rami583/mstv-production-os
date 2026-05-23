alter table public.events
  add column if not exists created_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists created_by_role text,
  add column if not exists created_by_name text;

create index if not exists events_created_by_profile_id_idx
  on public.events(created_by_profile_id);

create or replace function public.can_view_event(event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    $1 is not null
    and (
      public.current_profile_is_admin()
      or exists (
        select 1
        from public.events event
        where event.id = $1
          and event.deleted_at is null
          and not exists (
            select 1
            from public.external_event_links link
            where link.event_id = event.id
          )
          and event.created_by_profile_id = auth.uid()
      )
      or exists (
        select 1
        from public.external_event_links link
        join public.external_calendars calendar
          on calendar.id = link.external_calendar_id
        where link.event_id = $1
          and exists (
            select 1
            from public.events event
            where event.id = link.event_id
              and event.deleted_at is null
          )
          and (
            calendar.visibility = 'team'
            or calendar.created_by_profile_id = auth.uid()
          )
      )
    );
$$;

revoke all on function public.can_view_event(uuid) from public;
grant execute on function public.can_view_event(uuid) to authenticated;

comment on function public.can_view_event(uuid) is
  'Returns true when the authenticated user can view an event. Linked provider events follow external calendar visibility; native/local events are admin-or-creator only.';

notify pgrst, 'reload schema';
