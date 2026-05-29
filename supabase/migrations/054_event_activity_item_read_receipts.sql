create table if not exists public.event_activity_item_reads (
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  item_key text not null,
  read_at timestamptz not null default now(),
  primary key (event_id, profile_id, item_key),
  constraint event_activity_item_reads_item_key_not_blank check (length(trim(item_key)) > 0)
);

create index if not exists event_activity_item_reads_profile_event_idx
  on public.event_activity_item_reads (profile_id, event_id, read_at desc);

alter table public.event_activity_item_reads enable row level security;

drop policy if exists "authenticated users read own event item read receipts" on public.event_activity_item_reads;
create policy "authenticated users read own event item read receipts"
on public.event_activity_item_reads
for select
to authenticated
using (
  profile_id = auth.uid()
  and public.can_view_event(event_id)
);

drop policy if exists "authenticated users insert own event item read receipts" on public.event_activity_item_reads;
create policy "authenticated users insert own event item read receipts"
on public.event_activity_item_reads
for insert
to authenticated
with check (
  profile_id = auth.uid()
  and public.can_view_event(event_id)
);

drop policy if exists "authenticated users update own event item read receipts" on public.event_activity_item_reads;
create policy "authenticated users update own event item read receipts"
on public.event_activity_item_reads
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

grant select, insert, update on table public.event_activity_item_reads to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.event_activity_item_reads;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
