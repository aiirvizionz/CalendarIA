create table if not exists public.user_event_preferences (
  google_sub text primary key,
  initialized_at timestamptz not null default now(),
  constraint user_event_preferences_google_sub_length check (char_length(google_sub) between 1 and 255)
);

create table if not exists public.event_types (
  id uuid primary key default gen_random_uuid(),
  google_sub text not null references public.user_event_preferences(google_sub) on delete cascade,
  name text not null,
  name_key text not null,
  google_color_id smallint not null,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_types_name_length check (char_length(btrim(name)) between 1 and 40),
  constraint event_types_name_key_length check (char_length(name_key) between 1 and 80),
  constraint event_types_google_color_id_range check (google_color_id between 1 and 11),
  constraint event_types_position_range check (position between 0 and 99),
  constraint event_types_user_name_unique unique (google_sub, name_key)
);

create index if not exists event_types_user_position_idx
  on public.event_types (google_sub, position, created_at);

alter table public.user_event_preferences enable row level security;
alter table public.event_types enable row level security;

revoke all on table public.user_event_preferences from anon, authenticated;
revoke all on table public.event_types from anon, authenticated;
grant select, insert, update, delete on table public.user_event_preferences to service_role;
grant select, insert, update, delete on table public.event_types to service_role;
