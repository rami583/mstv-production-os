update storage.buckets
set public = false
where id = 'event-documents';

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
      )
    );
$$;

grant execute on function public.can_view_event(uuid) to authenticated;

create or replace function public.event_document_storage_event_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
declare
  event_id_text text;
begin
  event_id_text := nullif(split_part(coalesce(object_name, ''), '/', 1), '');
  if event_id_text is null then
    return null;
  end if;

  return event_id_text::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function public.can_view_event_document_object(object_bucket text, object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    object_bucket = 'event-documents'
    and exists (
      select 1
      from public.event_documents document
      where (
          document.file_path = object_bucket || '/' || object_name
          or document.file_path = object_name
        )
        and public.can_view_event(document.event_id)
    );
$$;

create or replace function public.can_manage_event_document_object(object_bucket text, object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    object_bucket = 'event-documents'
    and public.current_profile_can_manage_event_metadata()
    and public.can_view_event(public.event_document_storage_event_id(object_name));
$$;

revoke all on function public.event_document_storage_event_id(text) from public;
revoke all on function public.can_view_event_document_object(text, text) from public;
revoke all on function public.can_manage_event_document_object(text, text) from public;
grant execute on function public.event_document_storage_event_id(text) to authenticated;
grant execute on function public.can_view_event_document_object(text, text) to authenticated;
grant execute on function public.can_manage_event_document_object(text, text) to authenticated;

drop policy if exists "event documents anon select" on storage.objects;
drop policy if exists "event documents anon insert" on storage.objects;
drop policy if exists "event documents anon update" on storage.objects;
drop policy if exists "event documents anon delete" on storage.objects;

drop policy if exists "authenticated view visible event document objects" on storage.objects;
create policy "authenticated view visible event document objects"
on storage.objects
for select
to authenticated
using (
  public.can_view_event_document_object(bucket_id, name)
);

drop policy if exists "authenticated insert visible event document objects" on storage.objects;
create policy "authenticated insert visible event document objects"
on storage.objects
for insert
to authenticated
with check (
  public.can_manage_event_document_object(bucket_id, name)
);

drop policy if exists "authenticated update visible event document objects" on storage.objects;
create policy "authenticated update visible event document objects"
on storage.objects
for update
to authenticated
using (
  public.can_manage_event_document_object(bucket_id, name)
)
with check (
  public.can_manage_event_document_object(bucket_id, name)
);

drop policy if exists "authenticated delete visible event document objects" on storage.objects;
create policy "authenticated delete visible event document objects"
on storage.objects
for delete
to authenticated
using (
  public.can_manage_event_document_object(bucket_id, name)
);

notify pgrst, 'reload schema';
