alter table events
add column if not exists deleted_at timestamptz,
add column if not exists deleted_by text;

create index if not exists events_deleted_at_idx
on events (deleted_at);

notify pgrst, 'reload schema';
