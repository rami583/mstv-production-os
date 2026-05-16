alter table public.events
add column if not exists quote_reference text,
add column if not exists quote_version text,
add column if not exists source_quote_text text,
add column if not exists last_quote_imported_at timestamptz;

create index if not exists events_quote_reference_idx
on public.events (quote_reference)
where quote_reference is not null;

create index if not exists events_client_date_idx
on public.events (client_name, date);

notify pgrst, 'reload schema';
