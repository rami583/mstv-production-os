alter table public.team_members
add column if not exists last_name text,
add column if not exists initials text,
add column if not exists is_assignable boolean not null default true,
add column if not exists visibility text not null default 'admin';

alter table public.team_members
drop constraint if exists team_members_visibility_check;

alter table public.team_members
add constraint team_members_visibility_check
check (visibility in ('admin', 'team'));

update public.team_members
set
  last_name = case first_name
    when 'Rami' then 'Mustakim'
    when 'Antoine' then 'Santi'
    when 'Guillaume' then 'Gallot'
    when 'Arthur' then 'Legrand'
    when 'Tony' then 'Bouilly'
    when 'Gauthier' then 'Renard'
    else last_name
  end,
  initials = case first_name
    when 'Rami' then 'RM'
    when 'Antoine' then 'AS'
    when 'Guillaume' then 'GG'
    when 'Arthur' then 'AL'
    when 'Tony' then 'TB'
    when 'Gauthier' then 'GR'
    else coalesce(initials, upper(left(first_name, 1)))
  end,
  visibility = case
    when first_name in ('Arthur', 'Tony', 'Gauthier') then 'team'
    else 'admin'
  end,
  is_assignable = true;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'team_members'
  ) then
    alter publication supabase_realtime add table public.team_members;
  end if;
end $$;

notify pgrst, 'reload schema';
