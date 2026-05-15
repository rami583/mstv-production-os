create table if not exists event_activity_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  action_type text not null,
  entity_type text,
  entity_id text,
  description text not null,
  previous_value jsonb,
  new_value jsonb,
  created_by text,
  created_at timestamptz default now()
);

create index if not exists event_activity_log_event_id_created_at_idx
on event_activity_log (event_id, created_at desc);

alter table event_activity_log enable row level security;

drop policy if exists "prototype anon access" on event_activity_log;
create policy "prototype anon access" on event_activity_log for all using (true) with check (true);

notify pgrst, 'reload schema';
