alter table public.event_options
add column if not exists completed_by_label text;

update public.event_options
set completed_by_label = case completed_by_initials
  when 'RM' then 'Rami'
  when 'AS' then 'Antoine'
  when 'AL' then 'Arthur'
  when 'TB' then 'Tony'
  when 'GR' then 'Gauthier'
  when 'GG' then 'Guillaume'
  when 'EXT' then 'Externe'
  else completed_by_label
end
where completed_by_label is null
  and completed_by_initials is not null;

notify pgrst, 'reload schema';
