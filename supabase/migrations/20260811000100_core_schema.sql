create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

create table public.voice_channel_pairs (
  id smallint primary key check (id between 1 and 10),
  team_a_channel smallint not null unique check (team_a_channel between 1 and 19 and team_a_channel % 2 = 1),
  team_b_channel smallint not null unique check (team_b_channel = team_a_channel + 1),
  enabled boolean not null default true
);

insert into public.voice_channel_pairs (id, team_a_channel, team_b_channel)
values
  (1, 1, 2), (2, 3, 4), (3, 5, 6), (4, 7, 8), (5, 9, 10),
  (6, 11, 12), (7, 13, 14), (8, 15, 16), (9, 17, 18), (10, 19, 20);

create table public.player_profiles (
  batrace_id bigint primary key check (batrace_id > 0),
  canonical_name varchar(64) not null check (char_length(btrim(canonical_name)) between 1 and 64),
  level integer check (level is null or level >= 0),
  elo integer check (elo is null or elo >= 0),
  recent_win_rate smallint check (recent_win_rate is null or recent_win_rate between 0 and 100),
  recent_average_kd numeric(7, 2) check (recent_average_kd is null or recent_average_kd >= 0),
  match_count integer not null default 0 check (match_count >= 0),
  primary_category varchar(32),
  top_units jsonb not null default '[]'::jsonb check (jsonb_typeof(top_units) = 'array'),
  fetched_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default extensions.gen_random_uuid(),
  room_code varchar(12) not null unique,
  title varchar(40) not null check (char_length(btrim(title)) between 1 and 40),
  start_at timestamptz not null,
  host_nickname varchar(64) not null check (char_length(btrim(host_nickname)) between 1 and 64),
  host_qq varchar(12) not null check (host_qq ~ '^[0-9]{5,12}$'),
  note varchar(300) not null default '' check (char_length(note) <= 300),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_by uuid not null,
  voice_pair_id smallint not null references public.voice_channel_pairs(id),
  voice_reserved_from timestamptz not null,
  voice_reserved_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rooms_voice_window_valid check (voice_reserved_until > voice_reserved_from),
  constraint rooms_voice_pair_no_overlap exclude using gist (
    voice_pair_id with =,
    tstzrange(voice_reserved_from, voice_reserved_until, '[)') with &&
  ) where (status = 'active')
);

create table public.room_seats (
  room_id uuid not null references public.rooms(id) on delete cascade,
  team text not null check (team in ('A', 'B')),
  seat_no smallint not null check (seat_no between 1 and 5),
  player_uid uuid,
  nickname varchar(64),
  qq varchar(12),
  batrace_player_id bigint references public.player_profiles(batrace_id) on update cascade,
  joined_at timestamptz,
  primary key (room_id, team, seat_no),
  constraint room_seats_occupancy_consistent check (
    (
      player_uid is null and nickname is null and qq is null and
      batrace_player_id is null and joined_at is null
    ) or (
      player_uid is not null and nickname is not null and qq is not null and
      joined_at is not null
    )
  )
);

create unique index room_seats_one_seat_per_user
  on public.room_seats (room_id, player_uid)
  where player_uid is not null;

create table public.room_change_versions (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  changed_at timestamptz not null default now()
);

create table private.room_admin_secrets (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  token_hash bytea not null
);

create table private.batrace_search_cache (
  cache_key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table private.batrace_quota (
  bucket_start timestamptz not null,
  scope_key text not null,
  kind text not null check (kind in ('search', 'profile', 'global')),
  request_count integer not null default 0 check (request_count >= 0),
  primary key (bucket_start, scope_key, kind)
);

create table private.app_config (
  singleton boolean primary key default true check (singleton),
  batrace_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into private.app_config (singleton, batrace_enabled) values (true, false);

create index rooms_lobby_idx on public.rooms (start_at) where status = 'active';
create index rooms_creator_active_idx on public.rooms (created_by, start_at) where status = 'active';
create index room_seats_player_uid_idx on public.room_seats (player_uid) where player_uid is not null;
create index room_seats_batrace_idx on public.room_seats (batrace_player_id) where batrace_player_id is not null;
create index batrace_cache_expiry_idx on private.batrace_search_cache (expires_at);

create function private.initialize_room_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.room_change_versions (room_id) values (new.id);
  return new;
end;
$$;

create trigger rooms_initialize_version
after insert on public.rooms
for each row execute function private.initialize_room_version();

create function private.bump_room_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
begin
  if tg_table_name = 'rooms' then
    v_room_id := new.id;
  else
    v_room_id := new.room_id;
  end if;
  update public.room_change_versions
  set revision = revision + 1,
      changed_at = now()
  where room_id = v_room_id;
  return new;
end;
$$;

create trigger rooms_bump_version
after update on public.rooms
for each row execute function private.bump_room_version();

create trigger room_seats_bump_version
after update on public.room_seats
for each row execute function private.bump_room_version();

create function private.bump_profile_rooms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.room_change_versions as versions
  set revision = versions.revision + 1,
      changed_at = now()
  where exists (
    select 1
    from public.room_seats as seats
    where seats.room_id = versions.room_id
      and seats.batrace_player_id = new.batrace_id
  );
  return new;
end;
$$;

create trigger player_profiles_bump_rooms
after update on public.player_profiles
for each row
when (old.* is distinct from new.*)
execute function private.bump_profile_rooms();

alter table public.voice_channel_pairs enable row level security;
alter table public.player_profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_seats enable row level security;
alter table public.room_change_versions enable row level security;

revoke all on public.voice_channel_pairs from public, anon, authenticated;
revoke all on public.player_profiles from public, anon, authenticated;
revoke all on public.rooms from public, anon, authenticated;
revoke all on public.room_seats from public, anon, authenticated;
revoke all on public.room_change_versions from public, anon, authenticated;

grant select on public.room_change_versions to anon, authenticated;
create policy room_change_versions_public_read
on public.room_change_versions
for select
to anon, authenticated
using (true);

revoke all on all tables in schema private from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.batrace_search_cache to service_role;
grant select, insert, update, delete on private.batrace_quota to service_role;
grant select on private.app_config to service_role;
grant select, insert, update on public.player_profiles to service_role;

comment on table public.player_profiles is 'Sanitized BATrace snapshots only; no Steam64 or raw match payloads.';
comment on column public.rooms.created_by is 'Internal anonymous Supabase UID used only for lightweight creation quotas.';
