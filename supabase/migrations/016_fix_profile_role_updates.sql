create or replace function public.current_profile_is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.current_profile_is_admin() from public;
grant execute on function public.current_profile_is_admin() to authenticated;

drop policy if exists "authenticated profiles update own basic fields" on public.profiles;
drop policy if exists "authenticated profiles update own or admin" on public.profiles;
create policy "authenticated profiles update own or admin"
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
  or public.current_profile_is_admin()
)
with check (
  id = auth.uid()
  or public.current_profile_is_admin()
);

create or replace function public.prevent_profile_role_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role is distinct from new.role and auth.uid() = new.id then
    new.role := old.role;
  elsif old.role is distinct from new.role and not public.current_profile_is_admin() then
    new.role := old.role;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_profile_role_self_update on public.profiles;
create trigger prevent_profile_role_self_update
before update on public.profiles
for each row
execute function public.prevent_profile_role_self_update();

notify pgrst, 'reload schema';
