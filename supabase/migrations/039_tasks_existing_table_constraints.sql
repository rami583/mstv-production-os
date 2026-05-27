alter table public.tasks
  alter column id set default gen_random_uuid(),
  alter column id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where contype = 'p'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_pkey primary key (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_event_id_fkey'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_event_id_fkey foreign key (event_id) references public.events(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_assigned_profile_id_fkey'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_assigned_profile_id_fkey foreign key (assigned_profile_id) references public.profiles(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_created_by_fkey'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
  end if;
end;
$$;

notify pgrst, 'reload schema';
