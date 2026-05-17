alter table public.event_options
  add column if not exists created_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists created_by_role text,
  add column if not exists created_by_name text;

alter table public.event_option_items
  add column if not exists created_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists created_by_role text,
  add column if not exists created_by_name text;

alter table public.event_links
  add column if not exists created_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists created_by_role text,
  add column if not exists created_by_name text;

alter table public.event_link_entries
  add column if not exists created_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists created_by_role text,
  add column if not exists created_by_name text;

alter table public.event_document_groups
  add column if not exists created_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists created_by_role text,
  add column if not exists created_by_name text;

alter table public.event_documents
  add column if not exists created_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists created_by_role text,
  add column if not exists created_by_name text;

create index if not exists event_options_created_by_profile_id_idx
  on public.event_options(created_by_profile_id);

create index if not exists event_option_items_created_by_profile_id_idx
  on public.event_option_items(created_by_profile_id);

create index if not exists event_links_created_by_profile_id_idx
  on public.event_links(created_by_profile_id);

create index if not exists event_link_entries_created_by_profile_id_idx
  on public.event_link_entries(created_by_profile_id);

create index if not exists event_document_groups_created_by_profile_id_idx
  on public.event_document_groups(created_by_profile_id);

create index if not exists event_documents_created_by_profile_id_idx
  on public.event_documents(created_by_profile_id);

notify pgrst, 'reload schema';
