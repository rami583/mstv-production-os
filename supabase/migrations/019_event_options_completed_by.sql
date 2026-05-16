alter table public.event_options
add column if not exists completed_by_profile_id uuid references public.profiles(id) on delete set null,
add column if not exists completed_by_initials text,
add column if not exists completed_at timestamptz;

update public.event_options
set
  completed_by_profile_id = null,
  completed_by_initials = null,
  completed_at = null
where status = 'incomplete';

notify pgrst, 'reload schema';
