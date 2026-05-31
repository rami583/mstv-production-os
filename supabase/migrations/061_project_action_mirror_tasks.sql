alter table public.tasks
  add column if not exists project_action_id uuid references public.project_actions(id) on delete cascade;

drop trigger if exists sync_project_mirror_task_from_project on public.projects;
drop trigger if exists sync_project_mirror_task_from_participant on public.project_participants;
drop trigger if exists sync_project_from_mirror_task on public.tasks;

drop function if exists public.sync_project_mirror_task(uuid);
drop function if exists public.sync_project_mirror_task_from_project();
drop function if exists public.sync_project_mirror_task_from_participant();
drop function if exists public.sync_project_from_mirror_task();

drop index if exists public.tasks_project_id_unique_idx;

delete from public.tasks
where project_id is not null
  and project_action_id is null;

create unique index if not exists tasks_project_action_id_unique_idx
on public.tasks(project_action_id)
where project_action_id is not null;

create index if not exists tasks_project_action_id_idx
on public.tasks(project_action_id);

create or replace function public.sync_project_action_mirror_task(target_action_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_action public.project_actions%rowtype;
  existing_task public.tasks%rowtype;
  next_sort_order integer;
begin
  select *
  into target_action
  from public.project_actions
  where id = target_action_id;

  if not found then
    return;
  end if;

  if target_action.assigned_profile_id is null then
    delete from public.tasks
    where project_action_id = target_action_id;
    return;
  end if;

  select *
  into existing_task
  from public.tasks
  where project_action_id = target_action_id
  limit 1;

  if existing_task.id is null then
    select coalesce(max(sort_order), 0) + 1
    into next_sort_order
    from public.tasks
    where assigned_profile_id is not distinct from target_action.assigned_profile_id
      and status = 'todo';

    insert into public.tasks (
      title,
      event_id,
      project_id,
      project_action_id,
      assigned_profile_id,
      status,
      priority,
      sort_order,
      due_date,
      notes,
      created_by
    )
    values (
      target_action.title,
      null,
      target_action.project_id,
      target_action.id,
      target_action.assigned_profile_id,
      target_action.status,
      'normal',
      next_sort_order,
      target_action.due_date,
      target_action.notes,
      target_action.created_by_profile_id
    );

    return;
  end if;

  if existing_task.assigned_profile_id is distinct from target_action.assigned_profile_id and target_action.status = 'todo' then
    select coalesce(max(sort_order), 0) + 1
    into next_sort_order
    from public.tasks
    where assigned_profile_id is not distinct from target_action.assigned_profile_id
      and status = 'todo';
  else
    next_sort_order := existing_task.sort_order;
  end if;

  update public.tasks
  set
    title = target_action.title,
    event_id = null,
    project_id = target_action.project_id,
    project_action_id = target_action.id,
    assigned_profile_id = target_action.assigned_profile_id,
    status = target_action.status,
    priority = 'normal',
    sort_order = next_sort_order,
    due_date = target_action.due_date,
    notes = target_action.notes,
    created_by = target_action.created_by_profile_id
  where id = existing_task.id;
end;
$$;

revoke all on function public.sync_project_action_mirror_task(uuid) from public;
revoke all on function public.sync_project_action_mirror_task(uuid) from authenticated;

create or replace function public.sync_project_action_mirror_task_from_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.tasks
    where project_action_id = old.id;
    return old;
  end if;

  perform public.sync_project_action_mirror_task(new.id);
  return new;
end;
$$;

create or replace function public.sync_project_action_from_mirror_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_action_id is null or old.status is not distinct from new.status then
    return new;
  end if;

  update public.project_actions
  set status = new.status
  where id = new.project_action_id
    and status is distinct from new.status;

  return new;
end;
$$;

revoke all on function public.sync_project_action_mirror_task_from_action() from public;
revoke all on function public.sync_project_action_mirror_task_from_action() from authenticated;
revoke all on function public.sync_project_action_from_mirror_task() from public;
revoke all on function public.sync_project_action_from_mirror_task() from authenticated;

drop trigger if exists sync_project_action_mirror_task_from_action on public.project_actions;
create trigger sync_project_action_mirror_task_from_action
after insert or update of title, notes, status, assigned_profile_id, due_date, project_id
on public.project_actions
for each row execute function public.sync_project_action_mirror_task_from_action();

drop trigger if exists sync_project_action_from_mirror_task on public.tasks;
create trigger sync_project_action_from_mirror_task
after update of status
on public.tasks
for each row execute function public.sync_project_action_from_mirror_task();

do $$
declare
  action_record record;
begin
  for action_record in select id from public.project_actions loop
    perform public.sync_project_action_mirror_task(action_record.id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
