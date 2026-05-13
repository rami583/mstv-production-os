create table if not exists public.event_document_groups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now()
);

create index if not exists event_document_groups_event_id_idx on public.event_document_groups(event_id);

alter table public.event_document_groups enable row level security;

drop policy if exists "prototype anon access" on public.event_document_groups;
create policy "prototype anon access" on public.event_document_groups for all using (true) with check (true);

alter table public.event_documents
  add column if not exists group_id uuid references public.event_document_groups(id) on delete cascade;

create index if not exists event_documents_group_id_idx on public.event_documents(group_id);

do $$
declare
  document_row record;
  new_group_id uuid;
begin
  for document_row in
    select *
    from public.event_documents
    where group_id is null
  loop
    insert into public.event_document_groups (event_id, label, created_at)
    values (
      document_row.event_id,
      coalesce(nullif(regexp_replace(document_row.file_name, '\.[^.]+$', ''), ''), 'Document'),
      document_row.created_at
    )
    returning id into new_group_id;

    update public.event_documents
    set group_id = new_group_id
    where id = document_row.id;
  end loop;
end $$;

alter table public.event_documents
  alter column group_id set not null;

notify pgrst, 'reload schema';
