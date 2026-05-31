alter table public.projects
add column if not exists sort_order integer;

with ranked_projects as (
  select
    id,
    row_number() over (order by created_at asc, id asc) as next_sort_order
  from public.projects
  where sort_order is null
)
update public.projects as projects
set sort_order = ranked_projects.next_sort_order
from ranked_projects
where projects.id = ranked_projects.id;

create index if not exists projects_sort_order_idx on public.projects(sort_order);

notify pgrst, 'reload schema';
