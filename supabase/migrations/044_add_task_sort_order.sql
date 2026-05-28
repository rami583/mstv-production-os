alter table public.tasks
add column if not exists sort_order integer;

alter table public.tasks disable trigger prepare_task_update;

with ordered_tasks as (
  select
    id,
    row_number() over (
      partition by assigned_profile_id, status
      order by
        status asc,
        due_date asc nulls last,
        created_at asc
    ) as next_sort_order
  from public.tasks
  where sort_order is null
)
update public.tasks
set sort_order = ordered_tasks.next_sort_order
from ordered_tasks
where tasks.id = ordered_tasks.id;

alter table public.tasks enable trigger prepare_task_update;

create index if not exists tasks_assignee_status_sort_order_idx
on public.tasks(assigned_profile_id, status, sort_order);

create or replace function public.prepare_task_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and not public.current_profile_is_admin() then
    if old.assigned_profile_id is distinct from auth.uid() then
      raise exception 'Modification de tâche non autorisée.';
    end if;

    if new.title is distinct from old.title
      or new.event_id is distinct from old.event_id
      or new.assigned_profile_id is distinct from old.assigned_profile_id
      or new.priority is distinct from old.priority
      or new.sort_order is distinct from old.sort_order
      or new.due_date is distinct from old.due_date
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at then
      raise exception 'Seul le statut de votre tâche peut être modifié.';
    end if;
  end if;

  if tg_op = 'INSERT' and new.status = 'done' and new.completed_at is null then
    new.completed_at = now();
  elsif tg_op = 'INSERT' and new.status = 'todo' then
    new.completed_at = null;
  elsif tg_op = 'UPDATE' and new.status = 'done' and old.status is distinct from 'done' then
    new.completed_at = now();
  elsif tg_op = 'UPDATE' and new.status = 'todo' then
    new.completed_at = null;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at = now();
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
