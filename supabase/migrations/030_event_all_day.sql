alter table public.events
  add column if not exists is_all_day boolean not null default false;
