create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  event_name text not null,
  date date not null,
  client_arrival_time time,
  start_time time,
  end_time time,
  end_of_day_time time,
  status text not null default 'Brouillon' check (
    status in ('Brouillon', 'En préparation', 'En attente client', 'Prêt', 'En direct', 'Terminé')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  first_name text not null unique,
  role text,
  created_at timestamptz not null default now()
);

create table if not exists public.event_options (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null,
  status text not null default 'incomplete' check (status in ('incomplete', 'completed')),
  details text,
  assigned_team_member_id uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.event_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null,
  url text,
  stream_key text,
  status text not null default 'missing' check (status in ('missing', 'available')),
  created_at timestamptz not null default now()
);

create table if not exists public.event_link_entries (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.event_links(id) on delete cascade,
  url text,
  stream_key text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.event_document_groups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.event_documents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  group_id uuid references public.event_document_groups(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text,
  file_size bigint,
  created_at timestamptz not null default now()
);

create index if not exists events_date_start_time_idx on public.events(date, start_time);
create index if not exists event_options_event_id_idx on public.event_options(event_id);
create index if not exists event_links_event_id_idx on public.event_links(event_id);
create index if not exists event_link_entries_link_id_position_idx on public.event_link_entries(link_id, position);
create index if not exists event_document_groups_event_id_idx on public.event_document_groups(event_id);
create index if not exists event_documents_event_id_idx on public.event_documents(event_id);
create index if not exists event_documents_group_id_idx on public.event_documents(group_id);

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
alter table public.event_link_entries enable row level security;
alter table public.event_document_groups enable row level security;
alter table public.event_documents enable row level security;
alter table public.team_members enable row level security;

drop policy if exists "prototype anon access" on public.events;
create policy "prototype anon access" on public.events for all using (true) with check (true);

drop policy if exists "prototype anon access" on public.event_options;
create policy "prototype anon access" on public.event_options for all using (true) with check (true);

drop policy if exists "prototype anon access" on public.event_links;
create policy "prototype anon access" on public.event_links for all using (true) with check (true);

drop policy if exists "prototype anon access" on public.event_link_entries;
create policy "prototype anon access" on public.event_link_entries for all using (true) with check (true);

drop policy if exists "prototype anon access" on public.event_document_groups;
create policy "prototype anon access" on public.event_document_groups for all using (true) with check (true);

drop policy if exists "prototype anon access" on public.event_documents;
create policy "prototype anon access" on public.event_documents for all using (true) with check (true);

drop policy if exists "prototype anon access" on public.team_members;
create policy "prototype anon access" on public.team_members for all using (true) with check (true);

insert into public.team_members (first_name, role)
values
  ('Antoine', 'Production'),
  ('Rami', 'Réalisation'),
  ('Gauthier', 'Technique'),
  ('Arthur', 'Plateau'),
  ('Tony', 'Régie'),
  ('Guillaume', 'Habillage')
on conflict (first_name) do update set role = excluded.role;
