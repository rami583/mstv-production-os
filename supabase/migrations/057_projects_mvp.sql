create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  notes text,
  status text not null default 'active',
  owner_profile_id uuid references public.profiles(id) on delete set null,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_name_not_blank check (length(trim(name)) > 0),
  constraint projects_status_check check (status in ('active', 'paused', 'completed'))
);

create table if not exists public.project_actions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  notes text,
  status text not null default 'todo',
  assigned_profile_id uuid references public.profiles(id) on delete set null,
  due_date date,
  sort_order integer,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_actions_title_not_blank check (length(trim(title)) > 0),
  constraint project_actions_status_check check (status in ('todo', 'done'))
);

create index if not exists projects_status_updated_at_idx on public.projects(status, updated_at desc);
create index if not exists projects_owner_profile_id_idx on public.projects(owner_profile_id);
create index if not exists project_actions_project_id_sort_order_idx on public.project_actions(project_id, sort_order);
create index if not exists project_actions_assigned_profile_id_idx on public.project_actions(assigned_profile_id);

create or replace function public.touch_project_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_project_updated_at on public.projects;
create trigger touch_project_updated_at
before update on public.projects
for each row execute function public.touch_project_updated_at();

drop trigger if exists touch_project_action_updated_at on public.project_actions;
create trigger touch_project_action_updated_at
before update on public.project_actions
for each row execute function public.touch_project_updated_at();

alter table public.projects enable row level security;
alter table public.project_actions enable row level security;

drop policy if exists "admins manage projects" on public.projects;
create policy "admins manage projects"
on public.projects
for all
to authenticated
using (public.current_profile_is_admin())
with check (public.current_profile_is_admin());

drop policy if exists "admins manage project actions" on public.project_actions;
create policy "admins manage project actions"
on public.project_actions
for all
to authenticated
using (public.current_profile_is_admin())
with check (public.current_profile_is_admin());

grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update, delete on table public.project_actions to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.projects;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.project_actions;
exception
  when duplicate_object then null;
end;
$$;

notify pgrst, 'reload schema';
