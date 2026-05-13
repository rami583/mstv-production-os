create table if not exists public.event_option_items (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references public.event_options(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now()
);

create index if not exists event_option_items_option_id_idx on public.event_option_items(option_id);

alter table public.event_option_items enable row level security;

drop policy if exists "prototype anon access" on public.event_option_items;
create policy "prototype anon access" on public.event_option_items for all using (true) with check (true);

insert into public.event_option_items (option_id, label)
select option_id, label
from (
  select
    event_options.id as option_id,
    trim(detail_item) as label
  from public.event_options
  cross join lateral regexp_split_to_table(coalesce(event_options.details, ''), E'\\n|,') as detail_item
) as split_details
where label <> ''
  and not exists (
    select 1
    from public.event_option_items
    where event_option_items.option_id = split_details.option_id
      and event_option_items.label = split_details.label
  );
