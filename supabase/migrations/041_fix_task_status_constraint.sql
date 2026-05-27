alter table public.tasks
  alter column status set default 'todo';

update public.tasks
set status = 'todo'
where status is null or status not in ('todo', 'done');

alter table public.tasks
  alter column status set not null;

alter table public.tasks
  drop constraint if exists tasks_status_check;

alter table public.tasks
  add constraint tasks_status_check check (status in ('todo', 'done'));

notify pgrst, 'reload schema';
