begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into public.player_profiles(
  batrace_id, canonical_name, level, elo, recent_win_rate,
  recent_average_kd, match_count, primary_category, top_units, fetched_at
) values (8863, 'Raven', 83, 2346, 67, 1.8, 81, 'aircrafts', '["B-2 Spirit"]', now());

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
set local role authenticated;
create temporary table profiled_room as
select * from public.create_room(
  now() + interval '3 hours', '资料约战', 'ignored', '12345678', '', 'B', 3::smallint, 8863::bigint
);
reset role;
select is((select canonical_name from public.player_profiles where batrace_id = 8863), 'Raven', 'profile snapshot exists');
select is((select nickname from public.room_seats where player_uid = '20000000-0000-0000-0000-000000000001'), 'Raven', 'linked profile enforces canonical nickname');

set local role authenticated;
select ok(public.verify_room_admin((select room_code from profiled_room), (select admin_token from profiled_room)), 'valid admin token verifies');
select is(public.verify_room_admin((select room_code from profiled_room), 'wrong'), false, 'invalid token does not verify');
select lives_ok(
  $$select public.update_my_player_profile((select room_code from profiled_room), '手填昵称', null)$$,
  'owner can unlink profile'
);
reset role;
select is((select batrace_player_id from public.room_seats where player_uid = '20000000-0000-0000-0000-000000000001'), null::bigint, 'profile link is cleared');
select is((select nickname from public.room_seats where player_uid = '20000000-0000-0000-0000-000000000001'), '手填昵称', 'manual nickname replaces canonical nickname');

set local role authenticated;
select lives_ok(
  $$select public.admin_update_room(
    (select room_code from profiled_room), (select admin_token from profiled_room),
    now() + interval '5 hours', '改期约战', '房主新名', '12345678', '改期'
  )$$,
  'admin can reschedule room'
);
select lives_ok(
  $$select public.admin_remove_player((select room_code from profiled_room), (select admin_token from profiled_room), 'B', 3::smallint)$$,
  'admin can clear a seat'
);
select lives_ok(
  $$select public.admin_cancel_room((select room_code from profiled_room), (select admin_token from profiled_room))$$,
  'admin can cancel room'
);
reset role;
select is((select status from public.rooms limit 1), 'cancelled', 'room is soft-cancelled');
select is((select count(*)::integer from public.list_lobby_rooms()), 0, 'cancelled room is absent from lobby');

select * from finish();
rollback;
