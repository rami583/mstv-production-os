alter table public.event_options
  add column if not exists task_id uuid references public.tasks(id) on delete set null;

create index if not exists event_options_task_id_idx
  on public.event_options(task_id);

notify pgrst, 'reload schema';
