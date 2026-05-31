create table if not exists public.project_participants (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  external_name text,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  constraint project_participants_identity_check check (
    (profile_id is not null and external_name is null)
    or
    (profile_id is null and external_name is not null and length(trim(external_name)) > 0)
  )
);

create index if not exists project_participants_project_id_sort_order_idx
on public.project_participants(project_id, sort_order);

create unique index if not exists project_participants_project_profile_unique_idx
on public.project_participants(project_id, profile_id)
where profile_id is not null;

create or replace function public.current_profile_can_read_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_profile_is_admin()
    or exists (
      select 1
      from public.project_participants participant
      where participant.project_id = target_project_id
        and participant.profile_id = auth.uid()
    );
$$;

revoke all on function public.current_profile_can_read_project(uuid) from public;
grant execute on function public.current_profile_can_read_project(uuid) to authenticated;

alter table public.project_participants enable row level security;

drop policy if exists "admins manage project participants" on public.project_participants;
create policy "admins manage project participants"
on public.project_participants
for all
to authenticated
using (public.current_profile_is_admin())
with check (public.current_profile_is_admin());

drop policy if exists "project participants read participants" on public.project_participants;
create policy "project participants read participants"
on public.project_participants
for select
to authenticated
using (public.current_profile_can_read_project(project_id));

drop policy if exists "project participants read projects" on public.projects;
create policy "project participants read projects"
on public.projects
for select
to authenticated
using (public.current_profile_can_read_project(id));

drop policy if exists "project participants read actions" on public.project_actions;
create policy "project participants read actions"
on public.project_actions
for select
to authenticated
using (public.current_profile_can_read_project(project_id));

grant select, insert, update, delete on table public.project_participants to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.project_participants;
exception
  when duplicate_object then null;
end;
$$;

notify pgrst, 'reload schema';
