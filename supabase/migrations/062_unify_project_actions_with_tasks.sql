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
  created_by,
  created_at,
  updated_at,
  completed_at
)
select
  action.title,
  null,
  action.project_id,
  action.id,
  action.assigned_profile_id,
  action.status,
  'normal',
  action.sort_order,
  action.due_date,
  action.notes,
  action.created_by_profile_id,
  action.created_at,
  action.updated_at,
  case when action.status = 'done' then action.updated_at else null end
from public.project_actions action
where not exists (
  select 1
  from public.tasks task
  where task.project_action_id = action.id
);

drop trigger if exists sync_project_action_mirror_task_from_action on public.project_actions;
drop trigger if exists sync_project_action_from_mirror_task on public.tasks;

drop function if exists public.sync_project_action_mirror_task(uuid);
drop function if exists public.sync_project_action_mirror_task_from_action();
drop function if exists public.sync_project_action_from_mirror_task();

notify pgrst, 'reload schema';
