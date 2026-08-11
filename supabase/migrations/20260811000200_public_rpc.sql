create function public.list_lobby_rooms()
returns table (
  room_code text,
  title text,
  start_at timestamptz,
  player_count integer,
  voice_pair_id smallint,
  team_a_channel smallint,
  team_b_channel smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    rooms.room_code::text,
    rooms.title::text,
    rooms.start_at,
    count(seats.player_uid)::integer,
    pairs.id,
    pairs.team_a_channel,
    pairs.team_b_channel
  from public.rooms as rooms
  join public.voice_channel_pairs as pairs on pairs.id = rooms.voice_pair_id
  join public.room_seats as seats on seats.room_id = rooms.id
  where rooms.status = 'active'
    and rooms.start_at > now()
    and rooms.start_at <= now() + interval '7 days'
  group by rooms.id, pairs.id
  order by rooms.start_at asc;
$$;

create function public.get_room_details(p_room_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'subscriptionKey', rooms.id,
    'roomCode', rooms.room_code,
    'title', rooms.title,
    'startAt', rooms.start_at,
    'hostNickname', rooms.host_nickname,
    'hostQQ', rooms.host_qq,
    'note', rooms.note,
    'status', rooms.status,
    'readOnly', rooms.status <> 'active' or rooms.start_at <= now(),
    'playerCount', (select count(*) from public.room_seats occupied where occupied.room_id = rooms.id and occupied.player_uid is not null),
    'voice', jsonb_build_object(
      'pairId', pairs.id,
      'teamAChannel', pairs.team_a_channel,
      'teamBChannel', pairs.team_b_channel
    ),
    'seats', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'team', seats.team,
          'seatNo', seats.seat_no,
          'nickname', seats.nickname,
          'qq', seats.qq,
          'joinedAt', seats.joined_at,
          'isMine', seats.player_uid is not null and seats.player_uid = (select auth.uid()),
          'profile', case when profiles.batrace_id is null then null else jsonb_build_object(
            'batraceId', profiles.batrace_id,
            'canonicalName', profiles.canonical_name,
            'level', profiles.level,
            'elo', profiles.elo,
            'recentWinRate', profiles.recent_win_rate,
            'recentAverageKd', profiles.recent_average_kd,
            'matchCount', profiles.match_count,
            'primaryCategory', profiles.primary_category,
            'topUnits', profiles.top_units,
            'fetchedAt', profiles.fetched_at
          ) end
        ) order by seats.team, seats.seat_no
      )
      from public.room_seats as seats
      left join public.player_profiles as profiles on profiles.batrace_id = seats.batrace_player_id
      where seats.room_id = rooms.id
    ), '[]'::jsonb)
  )
  from public.rooms as rooms
  join public.voice_channel_pairs as pairs on pairs.id = rooms.voice_pair_id
  where rooms.room_code = upper(btrim(p_room_code))
  limit 1;
$$;

create function public.get_public_config()
returns table (batrace_enabled boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select config.batrace_enabled from private.app_config as config where config.singleton;
$$;

create function private.admin_token_valid(p_room_id uuid, p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from private.room_admin_secrets as secrets
    where secrets.room_id = p_room_id
      and secrets.token_hash = extensions.digest(coalesce(p_token, ''), 'sha256')
  ), false);
$$;

create function public.create_room(
  p_start_at timestamptz,
  p_title text,
  p_host_nickname text,
  p_host_qq text,
  p_note text,
  p_host_team text,
  p_host_seat_no smallint,
  p_host_batrace_id bigint
)
returns table (
  room_code text,
  admin_token text,
  voice_pair_id smallint,
  team_a_channel smallint,
  team_b_channel smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room_id uuid := extensions.gen_random_uuid();
  v_room_code text;
  v_admin_token text;
  v_voice_pair_id smallint;
  v_team_a_channel smallint;
  v_team_b_channel smallint;
  v_host_name text;
  v_inserted boolean := false;
  v_attempt integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  -- Serialize quota checks with voice allocation so concurrent requests by one
  -- UID cannot both pass the 30-second cooldown.
  perform pg_advisory_xact_lock(20260811, 1);
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 40 then raise exception 'INVALID_TITLE'; end if;
  if p_host_batrace_id is null and char_length(btrim(coalesce(p_host_nickname, ''))) not between 1 and 30 then raise exception 'INVALID_NICKNAME'; end if;
  if coalesce(p_host_qq, '') !~ '^[0-9]{5,12}$' then raise exception 'INVALID_QQ'; end if;
  if char_length(btrim(coalesce(p_note, ''))) > 300 then raise exception 'INVALID_NOTE'; end if;
  if p_host_team not in ('A', 'B') or p_host_seat_no not between 1 and 5 then raise exception 'INVALID_SEAT'; end if;
  if p_start_at <= now() or p_start_at > now() + interval '7 days' then raise exception 'INVALID_START_TIME'; end if;

  if p_host_batrace_id is not null then
    select profiles.canonical_name into v_host_name
    from public.player_profiles as profiles
    where profiles.batrace_id = p_host_batrace_id;
    if not found then raise exception 'INVALID_BATRACE_PROFILE'; end if;
  else
    v_host_name := btrim(p_host_nickname);
  end if;

  if (
    select count(*) >= 3
    from public.rooms as rooms
    where rooms.created_by = v_user_id
      and rooms.status = 'active'
      and rooms.start_at > now()
  ) then
    raise exception 'ROOM_QUOTA_EXCEEDED';
  end if;

  if exists (
    select 1 from public.rooms as rooms
    where rooms.created_by = v_user_id
      and rooms.created_at > now() - interval '30 seconds'
  ) then
    raise exception 'CREATE_COOLDOWN';
  end if;

  select pairs.id, pairs.team_a_channel, pairs.team_b_channel
  into v_voice_pair_id, v_team_a_channel, v_team_b_channel
  from public.voice_channel_pairs as pairs
  where pairs.enabled
    and not exists (
      select 1
      from public.rooms as rooms
      where rooms.status = 'active'
        and rooms.voice_pair_id = pairs.id
        and tstzrange(rooms.voice_reserved_from, rooms.voice_reserved_until, '[)') &&
            tstzrange(p_start_at - interval '10 minutes', p_start_at + interval '60 minutes', '[)')
    )
  order by pairs.id
  limit 1;

  if v_voice_pair_id is null then raise exception 'NO_VOICE_PAIR_AVAILABLE'; end if;

  for v_attempt in 1..5 loop
    v_room_code := upper(encode(extensions.gen_random_bytes(6), 'hex'));
    begin
      insert into public.rooms (
        id, room_code, title, start_at, host_nickname, host_qq, note,
        created_by, voice_pair_id, voice_reserved_from, voice_reserved_until
      ) values (
        v_room_id, v_room_code, btrim(p_title), p_start_at, v_host_name,
        p_host_qq, btrim(coalesce(p_note, '')), v_user_id, v_voice_pair_id,
        p_start_at - interval '10 minutes', p_start_at + interval '60 minutes'
      );
      v_inserted := true;
      exit;
    exception when unique_violation then
      v_inserted := false;
    end;
  end loop;

  if not v_inserted then raise exception 'ROOM_CODE_GENERATION_FAILED'; end if;

  v_admin_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.room_admin_secrets (room_id, token_hash)
  values (v_room_id, extensions.digest(v_admin_token, 'sha256'));

  insert into public.room_seats (
    room_id, team, seat_no, player_uid, nickname, qq, batrace_player_id, joined_at
  )
  select
    v_room_id,
    teams.team,
    numbers.seat_no,
    case when teams.team = p_host_team and numbers.seat_no = p_host_seat_no then v_user_id end,
    case when teams.team = p_host_team and numbers.seat_no = p_host_seat_no then v_host_name end,
    case when teams.team = p_host_team and numbers.seat_no = p_host_seat_no then p_host_qq end,
    case when teams.team = p_host_team and numbers.seat_no = p_host_seat_no then p_host_batrace_id end,
    case when teams.team = p_host_team and numbers.seat_no = p_host_seat_no then now() end
  from (values ('A'::text), ('B'::text)) as teams(team)
  cross join generate_series(1, 5) as numbers(seat_no);

  return query select v_room_code, v_admin_token, v_voice_pair_id, v_team_a_channel, v_team_b_channel;
end;
$$;

create function public.join_room_seat(
  p_room_code text,
  p_team text,
  p_seat_no smallint,
  p_nickname text,
  p_qq text,
  p_batrace_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.rooms%rowtype;
  v_nickname text;
  v_updated integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select rooms.* into v_room from public.rooms as rooms where rooms.room_code = upper(btrim(p_room_code));
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'active' or v_room.start_at <= now() then raise exception 'ROOM_READ_ONLY'; end if;
  if p_team not in ('A', 'B') or p_seat_no not between 1 and 5 then raise exception 'INVALID_SEAT'; end if;
  if coalesce(p_qq, '') !~ '^[0-9]{5,12}$' then raise exception 'INVALID_QQ'; end if;

  if p_batrace_id is not null then
    select profiles.canonical_name into v_nickname
    from public.player_profiles as profiles where profiles.batrace_id = p_batrace_id;
    if not found then raise exception 'INVALID_BATRACE_PROFILE'; end if;
  else
    if char_length(btrim(coalesce(p_nickname, ''))) not between 1 and 30 then raise exception 'INVALID_NICKNAME'; end if;
    v_nickname := btrim(p_nickname);
  end if;

  if exists (
    select 1 from public.room_seats as seats
    where seats.room_id = v_room.id and seats.player_uid = v_user_id
  ) then
    raise exception 'ALREADY_JOINED';
  end if;

  begin
    update public.room_seats
    set player_uid = v_user_id,
        nickname = v_nickname,
        qq = p_qq,
        batrace_player_id = p_batrace_id,
        joined_at = now()
    where room_id = v_room.id
      and team = p_team
      and seat_no = p_seat_no
      and player_uid is null;
    get diagnostics v_updated = row_count;
  exception when unique_violation then
    raise exception 'ALREADY_JOINED';
  end;

  if v_updated = 0 then raise exception 'SEAT_TAKEN'; end if;
end;
$$;

create function public.leave_room_seat(p_room_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.rooms%rowtype;
  v_updated integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select rooms.* into v_room from public.rooms as rooms where rooms.room_code = upper(btrim(p_room_code));
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'active' or v_room.start_at <= now() then raise exception 'ROOM_READ_ONLY'; end if;

  update public.room_seats
  set player_uid = null, nickname = null, qq = null, batrace_player_id = null, joined_at = null
  where room_id = v_room.id and player_uid = v_user_id;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'NOT_JOINED'; end if;
end;
$$;

create function public.update_my_player_profile(
  p_room_code text,
  p_nickname text,
  p_batrace_id bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.rooms%rowtype;
  v_nickname text;
  v_updated integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select rooms.* into v_room from public.rooms as rooms where rooms.room_code = upper(btrim(p_room_code));
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'active' or v_room.start_at <= now() then raise exception 'ROOM_READ_ONLY'; end if;

  if p_batrace_id is not null then
    select profiles.canonical_name into v_nickname
    from public.player_profiles as profiles where profiles.batrace_id = p_batrace_id;
    if not found then raise exception 'INVALID_BATRACE_PROFILE'; end if;
  else
    if char_length(btrim(coalesce(p_nickname, ''))) not between 1 and 30 then raise exception 'INVALID_NICKNAME'; end if;
    v_nickname := btrim(p_nickname);
  end if;

  update public.room_seats
  set nickname = v_nickname,
      batrace_player_id = p_batrace_id
  where room_id = v_room.id and player_uid = v_user_id;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'NOT_JOINED'; end if;
end;
$$;

create function public.verify_room_admin(p_room_code text, p_admin_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.admin_token_valid(rooms.id, p_admin_token)
    from public.rooms as rooms
    where rooms.room_code = upper(btrim(p_room_code))
  ), false);
$$;

create function public.admin_update_room(
  p_room_code text,
  p_admin_token text,
  p_start_at timestamptz,
  p_title text,
  p_host_nickname text,
  p_host_qq text,
  p_note text
)
returns table (
  updated_start_at timestamptz,
  voice_pair_id smallint,
  team_a_channel smallint,
  team_b_channel smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_voice_pair_id smallint;
  v_team_a_channel smallint;
  v_team_b_channel smallint;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;
  select rooms.* into v_room from public.rooms as rooms where rooms.room_code = upper(btrim(p_room_code));
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if not private.admin_token_valid(v_room.id, p_admin_token) then raise exception 'INVALID_ADMIN_TOKEN'; end if;
  if v_room.status <> 'active' or v_room.start_at <= now() then raise exception 'ROOM_READ_ONLY'; end if;
  if p_start_at <= now() or p_start_at > now() + interval '7 days' then raise exception 'INVALID_START_TIME'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 40 then raise exception 'INVALID_TITLE'; end if;
  if char_length(btrim(coalesce(p_host_nickname, ''))) not between 1 and 64 then raise exception 'INVALID_NICKNAME'; end if;
  if coalesce(p_host_qq, '') !~ '^[0-9]{5,12}$' then raise exception 'INVALID_QQ'; end if;
  if char_length(btrim(coalesce(p_note, ''))) > 300 then raise exception 'INVALID_NOTE'; end if;

  perform pg_advisory_xact_lock(20260811, 1);
  select pairs.id, pairs.team_a_channel, pairs.team_b_channel
  into v_voice_pair_id, v_team_a_channel, v_team_b_channel
  from public.voice_channel_pairs as pairs
  where pairs.enabled
    and not exists (
      select 1 from public.rooms as rooms
      where rooms.id <> v_room.id
        and rooms.status = 'active'
        and rooms.voice_pair_id = pairs.id
        and tstzrange(rooms.voice_reserved_from, rooms.voice_reserved_until, '[)') &&
            tstzrange(p_start_at - interval '10 minutes', p_start_at + interval '60 minutes', '[)')
    )
  order by case when pairs.id = v_room.voice_pair_id then 0 else 1 end, pairs.id
  limit 1;

  if v_voice_pair_id is null then raise exception 'NO_VOICE_PAIR_AVAILABLE'; end if;

  update public.rooms
  set start_at = p_start_at,
      title = btrim(p_title),
      host_nickname = btrim(p_host_nickname),
      host_qq = p_host_qq,
      note = btrim(coalesce(p_note, '')),
      voice_pair_id = v_voice_pair_id,
      voice_reserved_from = p_start_at - interval '10 minutes',
      voice_reserved_until = p_start_at + interval '60 minutes',
      updated_at = now()
  where id = v_room.id;

  return query select p_start_at, v_voice_pair_id, v_team_a_channel, v_team_b_channel;
end;
$$;

create function public.admin_remove_player(
  p_room_code text,
  p_admin_token text,
  p_team text,
  p_seat_no smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_updated integer;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;
  select rooms.* into v_room from public.rooms as rooms where rooms.room_code = upper(btrim(p_room_code));
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if not private.admin_token_valid(v_room.id, p_admin_token) then raise exception 'INVALID_ADMIN_TOKEN'; end if;
  if v_room.status <> 'active' or v_room.start_at <= now() then raise exception 'ROOM_READ_ONLY'; end if;
  if p_team not in ('A', 'B') or p_seat_no not between 1 and 5 then raise exception 'INVALID_SEAT'; end if;

  update public.room_seats
  set player_uid = null, nickname = null, qq = null, batrace_player_id = null, joined_at = null
  where room_id = v_room.id and team = p_team and seat_no = p_seat_no and player_uid is not null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then raise exception 'SEAT_EMPTY'; end if;
end;
$$;

create function public.admin_cancel_room(p_room_code text, p_admin_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED'; end if;
  select rooms.* into v_room from public.rooms as rooms where rooms.room_code = upper(btrim(p_room_code));
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if not private.admin_token_valid(v_room.id, p_admin_token) then raise exception 'INVALID_ADMIN_TOKEN'; end if;
  if v_room.status <> 'active' or v_room.start_at <= now() then raise exception 'ROOM_READ_ONLY'; end if;

  update public.rooms set status = 'cancelled', updated_at = now() where id = v_room.id;
end;
$$;

create function public.consume_batrace_quota(p_user_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_bucket timestamptz;
  v_global_bucket timestamptz := date_trunc('day', now());
  v_user_limit integer;
  v_count integer;
begin
  if p_user_id is null or p_kind not in ('search', 'profile') then raise exception 'INVALID_BATRACE_REQUEST'; end if;
  v_user_bucket := case when p_kind = 'search' then date_trunc('hour', now()) else v_global_bucket end;
  v_user_limit := 20;
  perform pg_advisory_xact_lock(20260811, 2);

  insert into private.batrace_quota (bucket_start, scope_key, kind, request_count)
  values (v_user_bucket, p_user_id::text, p_kind, 1)
  on conflict (bucket_start, scope_key, kind)
  do update set request_count = private.batrace_quota.request_count + 1
  returning request_count into v_count;
  if v_count > v_user_limit then raise exception 'BATRACE_RATE_LIMITED'; end if;

  insert into private.batrace_quota (bucket_start, scope_key, kind, request_count)
  values (v_global_bucket, '*', 'global', case when p_kind = 'profile' then 2 else 1 end)
  on conflict (bucket_start, scope_key, kind)
  do update set request_count = private.batrace_quota.request_count +
    case when p_kind = 'profile' then 2 else 1 end
  returning request_count into v_count;
  if v_count > 240 then raise exception 'BATRACE_RATE_LIMITED'; end if;
end;
$$;

revoke all on function public.list_lobby_rooms() from public;
revoke all on function public.get_room_details(text) from public;
revoke all on function public.get_public_config() from public;
grant execute on function public.list_lobby_rooms() to anon, authenticated;
grant execute on function public.get_room_details(text) to anon, authenticated;
grant execute on function public.get_public_config() to anon, authenticated;

revoke all on function public.create_room(timestamptz, text, text, text, text, text, smallint, bigint) from public;
revoke all on function public.join_room_seat(text, text, smallint, text, text, bigint) from public;
revoke all on function public.leave_room_seat(text) from public;
revoke all on function public.update_my_player_profile(text, text, bigint) from public;
revoke all on function public.verify_room_admin(text, text) from public;
revoke all on function public.admin_update_room(text, text, timestamptz, text, text, text, text) from public;
revoke all on function public.admin_remove_player(text, text, text, smallint) from public;
revoke all on function public.admin_cancel_room(text, text) from public;
grant execute on function public.create_room(timestamptz, text, text, text, text, text, smallint, bigint) to authenticated;
grant execute on function public.join_room_seat(text, text, smallint, text, text, bigint) to authenticated;
grant execute on function public.leave_room_seat(text) to authenticated;
grant execute on function public.update_my_player_profile(text, text, bigint) to authenticated;
grant execute on function public.verify_room_admin(text, text) to authenticated;
grant execute on function public.admin_update_room(text, text, timestamptz, text, text, text, text) to authenticated;
grant execute on function public.admin_remove_player(text, text, text, smallint) to authenticated;
grant execute on function public.admin_cancel_room(text, text) to authenticated;

revoke all on function public.consume_batrace_quota(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_batrace_quota(uuid, text) to service_role;
