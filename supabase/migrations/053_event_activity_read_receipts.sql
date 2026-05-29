alter table public.event_activity_log
  add column if not exists created_by_profile_id uuid references public.profiles(id) on delete set null;

create index if not exists event_activity_log_event_created_by_idx
  on public.event_activity_log (event_id, created_by_profile_id, created_at desc);

create table if not exists public.event_activity_reads (
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

create index if not exists event_activity_reads_profile_id_idx
  on public.event_activity_reads (profile_id, read_at desc);

alter table public.event_activity_reads enable row level security;

drop policy if exists "authenticated users read own event read receipts" on public.event_activity_reads;
create policy "authenticated users read own event read receipts"
on public.event_activity_reads
for select
to authenticated
using (
  profile_id = auth.uid()
  and public.can_view_event(event_id)
);

drop policy if exists "authenticated users insert own event read receipts" on public.event_activity_reads;
create policy "authenticated users insert own event read receipts"
on public.event_activity_reads
for insert
to authenticated
with check (
  profile_id = auth.uid()
  and public.can_view_event(event_id)
);

drop policy if exists "authenticated users update own event read receipts" on public.event_activity_reads;
create policy "authenticated users update own event read receipts"
on public.event_activity_reads
for update
to authenticated
using (
  profile_id = auth.uid()
  and public.can_view_event(event_id)
)
with check (
  profile_id = auth.uid()
  and public.can_view_event(event_id)
);

grant select, insert, update on table public.event_activity_reads to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.event_activity_reads;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
