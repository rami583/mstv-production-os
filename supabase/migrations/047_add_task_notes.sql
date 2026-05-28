alter table public.tasks
  add column if not exists notes text;

notify pgrst, 'reload schema';
