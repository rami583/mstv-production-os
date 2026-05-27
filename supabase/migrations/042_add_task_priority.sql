alter table public.tasks
  add column if not exists priority text default 'normal';

update public.tasks
set priority = 'normal'
where priority is null or priority not in ('urgent', 'normal', 'low');

alter table public.tasks
  alter column priority set default 'normal',
  alter column priority set not null;

alter table public.tasks
  drop constraint if exists tasks_priority_check;

alter table public.tasks
  add constraint tasks_priority_check check (priority in ('urgent', 'normal', 'low'));

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
