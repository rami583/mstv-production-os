alter table public.event_options
add column if not exists assigned_team_member_id uuid references public.team_members(id) on delete set null;

do $$
begin
  if to_regclass('public.event_option_assignees') is not null then
    update public.event_options option
    set assigned_team_member_id = assignee.team_member_id
    from (
      select distinct on (option_id)
        option_id,
        team_member_id
      from public.event_option_assignees
      order by option_id
    ) assignee
    where option.id = assignee.option_id
      and option.assigned_team_member_id is null;
  end if;
end $$;

update public.event_options option
set assigned_team_member_id = null
from public.team_members member
where option.assigned_team_member_id = member.id
  and member.first_name = 'Maud';

notify pgrst, 'reload schema';
