alter table public.event_options
  add column if not exists external_assignee_name text;

comment on column public.event_options.external_assignee_name is
  'First name or display name for an external option assignee. Internal assignees are represented by the linked task.';
