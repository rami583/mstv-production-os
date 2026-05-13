create table if not exists public.event_link_entries (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.event_links(id) on delete cascade,
  url text,
  stream_key text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists event_link_entries_link_id_position_idx
on public.event_link_entries(link_id, position);

alter table public.event_link_entries enable row level security;

drop policy if exists "prototype anon access" on public.event_link_entries;
create policy "prototype anon access"
on public.event_link_entries
for all
using (true)
with check (true);

insert into public.event_link_entries (link_id, url, stream_key, position)
select
  link.id,
  link.url,
  link.stream_key,
  0
from public.event_links link
where (nullif(trim(coalesce(link.url, '')), '') is not null
  or nullif(trim(coalesce(link.stream_key, '')), '') is not null)
  and not exists (
    select 1
    from public.event_link_entries entry
    where entry.link_id = link.id
  );

update public.event_links link
set status = case
  when exists (
    select 1
    from public.event_link_entries entry
    where entry.link_id = link.id
      and (
        case
          when lower(link.label) in ('plateforme', 'plateforme de diffusion', 'événement plateforme', 'event plateforme')
            then nullif(trim(coalesce(entry.url, '')), '') is not null
              and nullif(trim(coalesce(entry.stream_key, '')), '') is not null
          else nullif(trim(coalesce(entry.url, '')), '') is not null
        end
      )
  ) then 'available'
  else 'missing'
end;

notify pgrst, 'reload schema';
