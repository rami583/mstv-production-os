alter table public.external_calendar_accounts
  add column if not exists provider_account_email text,
  add column if not exists sync_capability text not null default 'bidirectional';

update public.external_calendar_accounts
set provider_account_email = coalesce(provider_account_email, provider_email)
where provider_account_email is null;

update public.external_calendar_accounts
set connection_status = case connection_status
  when 'active' then 'connected'
  when 'disabled' then 'disconnected'
  when 'needs_reconnect' then 'error'
  else connection_status
end;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.external_calendar_accounts'::regclass
      and conname = 'external_calendar_accounts_connection_status_check'
  ) then
    alter table public.external_calendar_accounts drop constraint external_calendar_accounts_connection_status_check;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.external_calendar_accounts'::regclass
      and conname = 'external_calendar_accounts_sync_capability_check'
  ) then
    alter table public.external_calendar_accounts drop constraint external_calendar_accounts_sync_capability_check;
  end if;
end $$;

alter table public.external_calendar_accounts
  add constraint external_calendar_accounts_connection_status_check
    check (connection_status in ('connected', 'disconnected', 'error')),
  add constraint external_calendar_accounts_sync_capability_check
    check (sync_capability in ('read_only', 'bidirectional'));

update public.external_calendars
set sync_capability = 'bidirectional'
where provider_type = 'google';

create unique index if not exists external_calendars_provider_account_calendar_idx
  on public.external_calendars(provider_account_id, provider_calendar_id)
  where provider_account_id is not null
    and provider_calendar_id is not null;

notify pgrst, 'reload schema';
