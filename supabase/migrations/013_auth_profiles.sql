create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  role text not null default 'readonly' check (role in ('admin', 'production', 'technical', 'readonly')),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "authenticated profiles read" on public.profiles;
create policy "authenticated profiles read"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "authenticated profiles insert own" on public.profiles;
create policy "authenticated profiles insert own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "authenticated profiles update own basic fields" on public.profiles;
create policy "authenticated profiles update own basic fields"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create or replace function public.prevent_profile_role_self_update()
returns trigger
language plpgsql
security definer
as $$
begin
  if auth.uid() = new.id and old.role is distinct from new.role then
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
