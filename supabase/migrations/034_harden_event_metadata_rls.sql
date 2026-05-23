create or replace function public.current_profile_can_manage_event_metadata()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'team')
  );
$$;

create or replace function public.can_view_event_option(option_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_options option
    where option.id = $1
      and public.can_view_event(option.event_id)
  );
$$;

create or replace function public.can_view_event_link(link_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_links link
    where link.id = $1
      and public.can_view_event(link.event_id)
  );
$$;

create or replace function public.can_view_event_document_group(group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_document_groups document_group
    where document_group.id = $1
      and public.can_view_event(document_group.event_id)
  );
$$;

create or replace function public.event_document_group_matches_event(group_id uuid, event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_document_groups document_group
    where document_group.id = $1
      and document_group.event_id = $2
  );
$$;

revoke all on function public.current_profile_can_manage_event_metadata() from public;
revoke all on function public.can_view_event_option(uuid) from public;
revoke all on function public.can_view_event_link(uuid) from public;
revoke all on function public.can_view_event_document_group(uuid) from public;
revoke all on function public.event_document_group_matches_event(uuid, uuid) from public;
grant execute on function public.current_profile_can_manage_event_metadata() to authenticated;
grant execute on function public.can_view_event_option(uuid) to authenticated;
grant execute on function public.can_view_event_link(uuid) to authenticated;
grant execute on function public.can_view_event_document_group(uuid) to authenticated;
grant execute on function public.event_document_group_matches_event(uuid, uuid) to authenticated;

alter table public.event_options enable row level security;

drop policy if exists "prototype anon access" on public.event_options;
drop policy if exists "authenticated view visible event options" on public.event_options;
create policy "authenticated view visible event options"
on public.event_options
for select
to authenticated
using (
  public.can_view_event(event_id)
);

drop policy if exists "authenticated manage visible event options" on public.event_options;
create policy "authenticated manage visible event options"
on public.event_options
for all
to authenticated
using (
  public.current_profile_can_manage_event_metadata()
  and public.can_view_event(event_id)
)
with check (
  public.current_profile_can_manage_event_metadata()
  and public.can_view_event(event_id)
);

alter table public.event_option_items enable row level security;

drop policy if exists "prototype anon access" on public.event_option_items;
drop policy if exists "authenticated view visible event option items" on public.event_option_items;
create policy "authenticated view visible event option items"
on public.event_option_items
for select
to authenticated
using (
  public.can_view_event_option(option_id)
);

drop policy if exists "authenticated manage visible event option items" on public.event_option_items;
create policy "authenticated manage visible event option items"
on public.event_option_items
for all
to authenticated
using (
  public.current_profile_can_manage_event_metadata()
  and public.can_view_event_option(option_id)
)
with check (
  public.current_profile_can_manage_event_metadata()
  and public.can_view_event_option(option_id)
);

alter table public.event_links enable row level security;

drop policy if exists "prototype anon access" on public.event_links;
drop policy if exists "authenticated view visible event links" on public.event_links;
create policy "authenticated view visible event links"
on public.event_links
for select
to authenticated
using (
  public.can_view_event(event_id)
);

drop policy if exists "authenticated manage visible event links" on public.event_links;
create policy "authenticated manage visible event links"
on public.event_links
for all
to authenticated
using (
  public.current_profile_can_manage_event_metadata()
  and public.can_view_event(event_id)
)
with check (
  public.current_profile_can_manage_event_metadata()
  and public.can_view_event(event_id)
);

alter table public.event_link_entries enable row level security;

drop policy if exists "prototype anon access" on public.event_link_entries;
drop policy if exists "authenticated view visible event link entries" on public.event_link_entries;
create policy "authenticated view visible event link entries"
on public.event_link_entries
for select
to authenticated
using (
  public.can_view_event_link(link_id)
);

drop policy if exists "authenticated manage visible event link entries" on public.event_link_entries;
create policy "authenticated manage visible event link entries"
on public.event_link_entries
for all
to authenticated
using (
  public.current_profile_can_manage_event_metadata()
  and public.can_view_event_link(link_id)
)
with check (
  public.current_profile_can_manage_event_metadata()
  and public.can_view_event_link(link_id)
);

alter table public.event_document_groups enable row level security;

drop policy if exists "prototype anon access" on public.event_document_groups;
drop policy if exists "authenticated view visible event document groups" on public.event_document_groups;
create policy "authenticated view visible event document groups"
on public.event_document_groups
for select
to authenticated
using (
  public.can_view_event(event_id)
);

drop policy if exists "authenticated manage visible event document groups" on public.event_document_groups;
create policy "authenticated manage visible event document groups"
on public.event_document_groups
for all
to authenticated
using (
  public.current_profile_can_manage_event_metadata()
  and public.can_view_event(event_id)
)
with check (
  public.current_profile_can_manage_event_metadata()
  and public.can_view_event(event_id)
);

alter table public.event_documents enable row level security;

drop policy if exists "prototype anon access" on public.event_documents;
drop policy if exists "authenticated view visible event documents" on public.event_documents;
create policy "authenticated view visible event documents"
on public.event_documents
for select
to authenticated
using (
  public.can_view_event(event_id)
);

drop policy if exists "authenticated manage visible event documents" on public.event_documents;
create policy "authenticated manage visible event documents"
on public.event_documents
for all
to authenticated
using (
  public.current_profile_can_manage_event_metadata()
  and public.can_view_event(event_id)
)
with check (
  public.current_profile_can_manage_event_metadata()
  and public.can_view_event(event_id)
  and (
    group_id is null
    or public.event_document_group_matches_event(group_id, event_id)
  )
);

alter table public.event_activity_log enable row level security;

drop policy if exists "prototype anon access" on public.event_activity_log;
drop policy if exists "authenticated view visible event activity" on public.event_activity_log;
create policy "authenticated view visible event activity"
on public.event_activity_log
for select
to authenticated
using (
  public.can_view_event(event_id)
);

drop policy if exists "authenticated manage visible event activity" on public.event_activity_log;
create policy "authenticated manage visible event activity"
on public.event_activity_log
for all
to authenticated
using (
  public.current_profile_can_manage_event_metadata()
  and public.can_view_event(event_id)
)
with check (
  public.current_profile_can_manage_event_metadata()
  and public.can_view_event(event_id)
);

notify pgrst, 'reload schema';
