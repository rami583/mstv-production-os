do $$
declare
  realtime_table text;
  realtime_tables text[] := array[
    'events',
    'event_options',
    'event_option_items',
    'event_links',
    'event_link_entries',
    'event_document_groups',
    'event_documents',
    'event_activity_log',
    'profiles'
  ];
begin
  foreach realtime_table in array realtime_tables loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = realtime_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', realtime_table);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
