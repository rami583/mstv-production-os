alter table event_links
  add column if not exists stream_key text;

notify pgrst, 'reload schema';
