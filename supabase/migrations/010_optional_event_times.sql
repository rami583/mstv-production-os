alter table public.events
alter column start_time drop not null,
alter column end_time drop not null;

notify pgrst, 'reload schema';
