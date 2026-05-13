create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  event_name text not null,
  date date not null,
  client_arrival_time time,
  start_time time not null,
  end_time time not null,
  end_of_day_time time,
  status text not null default 'Brouillon' check (
    status in ('Brouillon', 'En préparation', 'En attente client', 'Prêt', 'En direct', 'Terminé')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_options (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null,
  status text not null default 'incomplete' check (status in ('incomplete', 'completed')),
  details text,
  created_at timestamptz not null default now()
);

create table if not exists public.event_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null,
  url text,
  status text not null default 'missing' check (status in ('missing', 'available')),
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  subtitle text,
  status text not null default 'incomplete' check (status in ('incomplete', 'completed')),
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  first_name text not null unique,
  role text,
  created_at timestamptz not null default now()
);

create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  primary key (task_id, team_member_id)
);

create index if not exists events_date_start_time_idx on public.events(date, start_time);
create index if not exists event_options_event_id_idx on public.event_options(event_id);
create index if not exists event_links_event_id_idx on public.event_links(event_id);
create index if not exists tasks_event_id_idx on public.tasks(event_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at
before update on public.events
for each row execute function public.set_updated_at();

alter table public.events enable row level security;
alter table public.event_options enable row level security;
alter table public.event_links enable row level security;
alter table public.tasks enable row level security;
alter table public.team_members enable row level security;
alter table public.task_assignees enable row level security;

drop policy if exists "prototype anon access" on public.events;
create policy "prototype anon access" on public.events for all using (true) with check (true);

drop policy if exists "prototype anon access" on public.event_options;
create policy "prototype anon access" on public.event_options for all using (true) with check (true);

drop policy if exists "prototype anon access" on public.event_links;
create policy "prototype anon access" on public.event_links for all using (true) with check (true);

drop policy if exists "prototype anon access" on public.tasks;
create policy "prototype anon access" on public.tasks for all using (true) with check (true);

drop policy if exists "prototype anon access" on public.team_members;
create policy "prototype anon access" on public.team_members for all using (true) with check (true);

drop policy if exists "prototype anon access" on public.task_assignees;
create policy "prototype anon access" on public.task_assignees for all using (true) with check (true);

insert into public.team_members (first_name, role)
values
  ('Antoine', 'Production'),
  ('Rami', 'Réalisation'),
  ('Gauthier', 'Technique'),
  ('Arthur', 'Plateau'),
  ('Tony', 'Régie'),
  ('Guillaume', 'Habillage'),
  ('Maud', 'Maquillage')
on conflict (first_name) do update set role = excluded.role;
