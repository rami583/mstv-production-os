alter table public.external_calendars
  add column if not exists provider_type text not null default 'ics_read_only',
  add column if not exists provider_account_id uuid,
  add column if not exists provider_calendar_id text,
  add column if not exists sync_capability text not null default 'read_only',
  add column if not exists sync_enabled boolean not null default true,
  add column if not exists last_sync_started_at timestamptz,
  add column if not exists last_sync_finished_at timestamptz,
  add column if not exists last_sync_status text,
  add column if not exists last_sync_error text,
  add column if not exists external_updated_at timestamptz;

alter table public.external_calendars
  alter column ics_url drop not null,
  alter column ics_url set default '';

update public.external_calendars
set provider_type = 'ics_read_only',
    sync_capability = 'read_only'
where provider_type is null
   or provider_type = ''
   or sync_capability is null
   or sync_capability = '';

create table if not exists public.external_calendar_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider_type text not null,
  provider_account_id text,
  provider_email text,
  display_name text,
  scopes text[] not null default '{}',
  access_token_encrypted text,
  refresh_token_encrypted text,
  credential_payload_encrypted text,
  token_expires_at timestamptz,
  connection_status text not null default 'active',
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_calendar_accounts_provider_type_check
    check (provider_type in ('google', 'microsoft', 'apple_caldav')),
  constraint external_calendar_accounts_connection_status_check
    check (connection_status in ('active', 'needs_reconnect', 'disabled', 'error'))
);

alter table public.external_calendar_accounts enable row level security;

create unique index if not exists external_calendar_accounts_user_provider_account_idx
  on public.external_calendar_accounts(user_id, provider_type, provider_account_id)
  where provider_account_id is not null;

create index if not exists external_calendar_accounts_user_id_idx
  on public.external_calendar_accounts(user_id);

create index if not exists external_calendars_provider_account_id_idx
  on public.external_calendars(provider_account_id);

create index if not exists external_calendars_provider_calendar_id_idx
  on public.external_calendars(provider_type, provider_calendar_id);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.external_calendars'::regclass
      and conname = 'external_calendars_provider_type_check'
  ) then
    alter table public.external_calendars drop constraint external_calendars_provider_type_check;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.external_calendars'::regclass
      and conname = 'external_calendars_sync_capability_check'
  ) then
    alter table public.external_calendars drop constraint external_calendars_sync_capability_check;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.external_calendars'::regclass
      and conname = 'external_calendars_last_sync_status_check'
  ) then
    alter table public.external_calendars drop constraint external_calendars_last_sync_status_check;
  end if;
end $$;

alter table public.external_calendars
  add constraint external_calendars_provider_type_check
    check (provider_type in ('google', 'microsoft', 'apple_caldav', 'ics_read_only')),
  add constraint external_calendars_sync_capability_check
    check (sync_capability in ('read_only', 'bidirectional')),
  add constraint external_calendars_last_sync_status_check
    check (last_sync_status is null or last_sync_status in ('idle', 'syncing', 'synced', 'failed', 'conflict'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.external_calendars'::regclass
      and conname = 'external_calendars_provider_account_id_fkey'
  ) then
    alter table public.external_calendars
      add constraint external_calendars_provider_account_id_fkey
      foreign key (provider_account_id)
      references public.external_calendar_accounts(id)
      on delete set null;
  end if;
end $$;

create table if not exists public.external_event_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  external_calendar_id uuid not null references public.external_calendars(id) on delete cascade,
  provider_type text not null,
  provider_calendar_id text not null,
  external_event_id text not null,
  external_event_uid text,
  sync_direction text not null default 'bidirectional',
  sync_status text not null default 'synced',
  local_updated_at timestamptz,
  last_synced_at timestamptz,
  last_external_updated_at timestamptz,
  conflict_detected_at timestamptz,
  conflict_reason text,
  last_sync_error text,
  deleted_locally_at timestamptz,
  deleted_externally_at timestamptz,
  raw_external_event jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_event_links_provider_type_check
    check (provider_type in ('google', 'microsoft', 'apple_caldav')),
  constraint external_event_links_sync_direction_check
    check (sync_direction in ('pull', 'push', 'bidirectional')),
  constraint external_event_links_sync_status_check
    check (sync_status in ('pending', 'syncing', 'synced', 'failed', 'conflict'))
);

alter table public.external_event_links enable row level security;

create unique index if not exists external_event_links_event_calendar_idx
  on public.external_event_links(event_id, external_calendar_id);

create unique index if not exists external_event_links_calendar_event_idx
  on public.external_event_links(external_calendar_id, external_event_id);

create index if not exists external_event_links_sync_status_idx
  on public.external_event_links(sync_status);

create table if not exists public.external_calendar_sync_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.external_calendar_accounts(id) on delete set null,
  external_calendar_id uuid references public.external_calendars(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  external_event_link_id uuid references public.external_event_links(id) on delete set null,
  operation text not null,
  status text not null,
  message text,
  technical_detail text,
  created_at timestamptz not null default now(),
  constraint external_calendar_sync_log_operation_check
    check (operation in ('connect', 'list_calendars', 'pull', 'push_create', 'push_update', 'push_delete', 'manual_sync')),
  constraint external_calendar_sync_log_status_check
    check (status in ('started', 'success', 'failed', 'conflict'))
);

alter table public.external_calendar_sync_log enable row level security;

create index if not exists external_calendar_sync_log_calendar_id_idx
  on public.external_calendar_sync_log(external_calendar_id, created_at desc);

drop policy if exists "authenticated view own external calendar accounts" on public.external_calendar_accounts;
create policy "authenticated view own external calendar accounts"
on public.external_calendar_accounts
for select
to authenticated
using (
  public.current_profile_is_admin()
  or user_id = auth.uid()
);

drop policy if exists "authenticated manage own external calendar accounts" on public.external_calendar_accounts;
create policy "authenticated manage own external calendar accounts"
on public.external_calendar_accounts
for all
to authenticated
using (
  public.current_profile_is_admin()
  or user_id = auth.uid()
)
with check (
  public.current_profile_is_admin()
  or user_id = auth.uid()
);

drop policy if exists "authenticated view external event links" on public.external_event_links;
create policy "authenticated view external event links"
on public.external_event_links
for select
to authenticated
using (
  public.current_profile_is_admin()
  or exists (
    select 1
    from public.external_calendars calendar
    where calendar.id = external_event_links.external_calendar_id
      and (
        calendar.created_by_profile_id = auth.uid()
        or calendar.visibility = 'team'
      )
  )
);

drop policy if exists "authenticated manage own external event links" on public.external_event_links;
create policy "authenticated manage own external event links"
on public.external_event_links
for all
to authenticated
using (
  public.current_profile_is_admin()
  or exists (
    select 1
    from public.external_calendars calendar
    where calendar.id = external_event_links.external_calendar_id
      and calendar.created_by_profile_id = auth.uid()
  )
)
with check (
  public.current_profile_is_admin()
  or exists (
    select 1
    from public.external_calendars calendar
    where calendar.id = external_event_links.external_calendar_id
      and calendar.created_by_profile_id = auth.uid()
      and calendar.sync_capability = 'bidirectional'
  )
);

drop policy if exists "authenticated view external calendar sync log" on public.external_calendar_sync_log;
create policy "authenticated view external calendar sync log"
on public.external_calendar_sync_log
for select
to authenticated
using (
  public.current_profile_is_admin()
  or exists (
    select 1
    from public.external_calendars calendar
    where calendar.id = external_calendar_sync_log.external_calendar_id
      and calendar.created_by_profile_id = auth.uid()
  )
);

drop policy if exists "authenticated create external calendar sync log" on public.external_calendar_sync_log;
create policy "authenticated create external calendar sync log"
on public.external_calendar_sync_log
for insert
to authenticated
with check (
  public.current_profile_is_admin()
  or exists (
    select 1
    from public.external_calendars calendar
    where calendar.id = external_calendar_sync_log.external_calendar_id
      and calendar.created_by_profile_id = auth.uid()
  )
);

do $$
declare
  realtime_table text;
  realtime_tables text[] := array[
    'external_calendar_accounts',
    'external_event_links',
    'external_calendar_sync_log'
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
