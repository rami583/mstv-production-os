create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  related_event_id uuid references public.events(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_unread_idx
  on public.notifications (user_id, read_at)
  where read_at is null;

create index if not exists notifications_related_event_id_idx
  on public.notifications (related_event_id);

alter table public.notifications enable row level security;

drop policy if exists "authenticated users read own notifications" on public.notifications;
create policy "authenticated users read own notifications"
  on public.notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "authenticated users insert own notifications" on public.notifications;
create policy "authenticated users insert own notifications"
  on public.notifications
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "authenticated users update own notifications" on public.notifications;
create policy "authenticated users update own notifications"
  on public.notifications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "authenticated users delete own notifications" on public.notifications;
create policy "authenticated users delete own notifications"
  on public.notifications
  for delete
  to authenticated
  using (auth.uid() = user_id);

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
