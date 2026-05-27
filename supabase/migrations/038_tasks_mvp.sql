create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_id uuid references public.events(id) on delete set null,
  assigned_profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'todo',
  due_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint tasks_status_check check (status in ('todo', 'done')),
  constraint tasks_title_not_blank check (length(trim(title)) > 0)
);

alter table public.tasks
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists title text,
  add column if not exists event_id uuid references public.events(id) on delete set null,
  add column if not exists assigned_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists status text default 'todo',
  add column if not exists due_date date,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists completed_at timestamptz;

update public.tasks
set title = 'Tâche'
where title is null or length(trim(title)) = 0;

update public.tasks
set id = gen_random_uuid()
where id is null;

update public.tasks
set status = 'todo'
where status is null or status not in ('todo', 'done');

update public.tasks
set created_at = now()
where created_at is null;

update public.tasks
set updated_at = now()
where updated_at is null;

alter table public.tasks
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column title set not null,
  alter column status set default 'todo',
  alter column status set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

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
    where conname = 'tasks_status_check'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_status_check check (status in ('todo', 'done'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_title_not_blank'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_title_not_blank check (length(trim(title)) > 0);
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

create index if not exists tasks_event_id_idx on public.tasks(event_id);
create index if not exists tasks_assigned_profile_id_status_idx on public.tasks(assigned_profile_id, status, due_date);
create index if not exists tasks_created_by_idx on public.tasks(created_by);
create index if not exists tasks_due_date_idx on public.tasks(due_date);

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

drop trigger if exists prepare_task_update on public.tasks;
create trigger prepare_task_update
before insert or update on public.tasks
for each row execute function public.prepare_task_update();

alter table public.tasks enable row level security;

drop policy if exists "authenticated view visible tasks" on public.tasks;
create policy "authenticated view visible tasks"
on public.tasks
for select
to authenticated
using (
  public.current_profile_is_admin()
  or assigned_profile_id = auth.uid()
  or (
    event_id is not null
    and public.can_view_event(event_id)
  )
);

drop policy if exists "authenticated admins insert tasks" on public.tasks;
create policy "authenticated admins insert tasks"
on public.tasks
for insert
to authenticated
with check (
  public.current_profile_is_admin()
);

drop policy if exists "authenticated admins update tasks" on public.tasks;
create policy "authenticated admins update tasks"
on public.tasks
for update
to authenticated
using (
  public.current_profile_is_admin()
)
with check (
  public.current_profile_is_admin()
);

drop policy if exists "authenticated assigned users update task status" on public.tasks;
create policy "authenticated assigned users update task status"
on public.tasks
for update
to authenticated
using (
  assigned_profile_id = auth.uid()
)
with check (
  assigned_profile_id = auth.uid()
);

drop policy if exists "authenticated admins delete tasks" on public.tasks;
create policy "authenticated admins delete tasks"
on public.tasks
for delete
to authenticated
using (
  public.current_profile_is_admin()
);

grant select, insert, update, delete on table public.tasks to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception
  when duplicate_object then null;
end;
$$;

notify pgrst, 'reload schema';
