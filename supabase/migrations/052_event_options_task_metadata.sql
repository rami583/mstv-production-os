alter table public.event_options
  add column if not exists task_due_date date,
  add column if not exists task_notes text;

comment on column public.event_options.task_due_date is
  'Option-level due date used when an option is external or unassigned and should not surface as a person task.';

comment on column public.event_options.task_notes is
  'Option-level notes used when an option is external or unassigned and should not surface as a person task.';
