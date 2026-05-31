alter table public.tasks
  add column if not exists project_id uuid references public.projects(id) on delete cascade;

create unique index if not exists tasks_project_id_unique_idx
on public.tasks(project_id)
where project_id is not null;

create index if not exists tasks_project_id_idx
on public.tasks(project_id);

create or replace function public.sync_project_mirror_task(target_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project public.projects%rowtype;
  responsible_profile_id uuid;
  existing_task public.tasks%rowtype;
  next_sort_order integer;
  next_status text;
begin
  select *
  into target_project
  from public.projects
  where id = target_project_id;

  if not found then
    return;
  end if;

  select participant.profile_id
  into responsible_profile_id
  from public.project_participants participant
  where participant.project_id = target_project_id
  order by participant.sort_order asc, participant.created_at asc
  limit 1;

  if responsible_profile_id is null then
    delete from public.tasks
    where project_id = target_project_id;
    return;
  end if;

  next_status := case when target_project.status = 'completed' then 'done' else 'todo' end;

  select *
  into existing_task
  from public.tasks
  where project_id = target_project_id
  limit 1;

  if existing_task.id is null then
    select coalesce(max(sort_order), 0) + 1
    into next_sort_order
    from public.tasks
    where assigned_profile_id is not distinct from responsible_profile_id
      and status = 'todo';

    insert into public.tasks (
      title,
      event_id,
      assigned_profile_id,
      status,
      priority,
      sort_order,
      due_date,
      notes,
      created_by,
      project_id
    )
    values (
      'Projet : ' || target_project.name,
      null,
      responsible_profile_id,
      next_status,
      'normal',
      next_sort_order,
      null,
      null,
      target_project.created_by_profile_id,
      target_project.id
    );

    return;
  end if;

  if existing_task.assigned_profile_id is distinct from responsible_profile_id and next_status = 'todo' then
    select coalesce(max(sort_order), 0) + 1
    into next_sort_order
    from public.tasks
    where assigned_profile_id is not distinct from responsible_profile_id
      and status = 'todo';
  else
    next_sort_order := existing_task.sort_order;
  end if;

  update public.tasks
  set
    title = 'Projet : ' || target_project.name,
    event_id = null,
    assigned_profile_id = responsible_profile_id,
    status = next_status,
    priority = 'normal',
    sort_order = next_sort_order,
    due_date = null,
    notes = null,
    created_by = target_project.created_by_profile_id
  where id = existing_task.id;
end;
$$;

revoke all on function public.sync_project_mirror_task(uuid) from public;
revoke all on function public.sync_project_mirror_task(uuid) from authenticated;

create or replace function public.sync_project_mirror_task_from_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_project_mirror_task(new.id);
  return new;
end;
$$;

create or replace function public.sync_project_mirror_task_from_participant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_project_mirror_task(old.project_id);
    return old;
  end if;

  perform public.sync_project_mirror_task(new.project_id);
  return new;
end;
$$;

create or replace function public.sync_project_from_mirror_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_project_status text;
begin
  if new.project_id is null or old.status is not distinct from new.status then
    return new;
  end if;

  next_project_status := case when new.status = 'done' then 'completed' else 'active' end;

  update public.projects
  set status = next_project_status
  where id = new.project_id
    and status is distinct from next_project_status;

  return new;
end;
$$;

revoke all on function public.sync_project_mirror_task_from_project() from public;
revoke all on function public.sync_project_mirror_task_from_project() from authenticated;
revoke all on function public.sync_project_mirror_task_from_participant() from public;
revoke all on function public.sync_project_mirror_task_from_participant() from authenticated;
revoke all on function public.sync_project_from_mirror_task() from public;
revoke all on function public.sync_project_from_mirror_task() from authenticated;

drop trigger if exists sync_project_mirror_task_from_project on public.projects;
create trigger sync_project_mirror_task_from_project
after insert or update of name, status
on public.projects
for each row execute function public.sync_project_mirror_task_from_project();

drop trigger if exists sync_project_mirror_task_from_participant on public.project_participants;
create trigger sync_project_mirror_task_from_participant
after insert or update or delete
on public.project_participants
for each row execute function public.sync_project_mirror_task_from_participant();

drop trigger if exists sync_project_from_mirror_task on public.tasks;
create trigger sync_project_from_mirror_task
after update of status
on public.tasks
for each row execute function public.sync_project_from_mirror_task();

do $$
declare
  project_record record;
begin
  for project_record in select id from public.projects loop
    perform public.sync_project_mirror_task(project_record.id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
