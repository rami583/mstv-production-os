create table if not exists public.event_documents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text,
  file_size bigint,
  created_at timestamptz not null default now()
);

create index if not exists event_documents_event_id_idx on public.event_documents(event_id);

alter table public.event_documents enable row level security;

drop policy if exists "prototype anon access" on public.event_documents;
create policy "prototype anon access" on public.event_documents for all using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('event-documents', 'event-documents', false)
on conflict (id) do nothing;

drop policy if exists "event documents anon select" on storage.objects;
create policy "event documents anon select" on storage.objects
  for select using (bucket_id = 'event-documents');

drop policy if exists "event documents anon insert" on storage.objects;
create policy "event documents anon insert" on storage.objects
  for insert with check (bucket_id = 'event-documents');

drop policy if exists "event documents anon update" on storage.objects;
create policy "event documents anon update" on storage.objects
  for update using (bucket_id = 'event-documents') with check (bucket_id = 'event-documents');

drop policy if exists "event documents anon delete" on storage.objects;
create policy "event documents anon delete" on storage.objects
  for delete using (bucket_id = 'event-documents');

notify pgrst, 'reload schema';
