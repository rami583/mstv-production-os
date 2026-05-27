alter table public.tasks
  alter column event_id drop not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'tasks_event_id_fkey'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      drop constraint tasks_event_id_fkey;
  end if;

  alter table public.tasks
    add constraint tasks_event_id_fkey foreign key (event_id) references public.events(id) on delete set null;
end;
$$;

notify pgrst, 'reload schema';
