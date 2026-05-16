drop trigger if exists prevent_profile_role_self_update on public.profiles;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format(
      'alter table public.profiles drop constraint if exists %I',
      constraint_record.conname
    );
  end loop;
end $$;

update public.profiles
set role = case
  when lower(trim(coalesce(role, ''))) = 'admin' then 'admin'
  else 'team'
end;

alter table public.profiles
alter column role set default 'team';

alter table public.profiles
add constraint profiles_role_check
check (role in ('admin', 'team'));

create or replace function public.prevent_profile_role_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if old.role is distinct from new.role and auth.uid() = new.id then
    new.role := old.role;
  elsif old.role is distinct from new.role and not public.current_profile_is_admin() then
    new.role := old.role;
  end if;

  return new;
end;
$$;

create trigger prevent_profile_role_self_update
before update on public.profiles
for each row
execute function public.prevent_profile_role_self_update();

notify pgrst, 'reload schema';
