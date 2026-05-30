drop policy if exists "authenticated view team tasks" on public.tasks;
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

notify pgrst, 'reload schema';
