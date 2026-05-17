alter table public.events
add column if not exists imported_from text,
add column if not exists external_import_id text;

create index if not exists events_imported_from_idx
on public.events (imported_from)
where imported_from is not null;

create unique index if not exists events_imported_from_external_import_id_idx
on public.events (imported_from, external_import_id)
where imported_from is not null
  and external_import_id is not null;
