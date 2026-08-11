begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

create temporary table created_room as
select * from public.create_room(
  now() + interval '2 hours',
  '测试约战',
  '房主',
  '12345678',
  '备注',
  'A',
  1::smallint,
  null::bigint
);

reset role;
select is((select count(*)::integer from created_room), 1, 'room is created');
select is((select voice_pair_id from created_room), 1::smallint, 'lowest voice pair is selected');
select is((select team_a_channel from created_room), 1::smallint, 'A channel is returned');
select is((select team_b_channel from created_room), 2::smallint, 'B channel is returned');
select is((select count(*)::integer from public.room_seats), 10, 'ten fixed seats exist');
select is((select nickname from public.room_seats where team = 'A' and seat_no = 1), '房主', 'host claims selected seat');
select is((select qq from public.room_seats where team = 'A' and seat_no = 1), '12345678', 'host QQ is stored on seat');
select is((select count(*)::integer from private.room_admin_secrets), 1, 'only token digest is stored');
select ok(length((select admin_token from created_room)) = 64, 'admin token is returned once');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select lives_ok(
  $$select public.join_room_seat((select room_code from created_room), 'B', 1::smallint, '玩家2', '87654321', null::bigint)$$,
  'another player can join'
);
select throws_ok(
  $$select public.join_room_seat((select room_code from created_room), 'B', 1::smallint, '玩家2', '87654321', null::bigint)$$,
  'P0001', 'SEAT_TAKEN', 'occupied seat is rejected'
);
select throws_ok(
  $$select public.join_room_seat((select room_code from created_room), 'B', 2::smallint, '玩家2', '87654321', null::bigint)$$,
  'P0001', 'ALREADY_JOINED', 'one user cannot claim two seats'
);
select lives_ok(
  $$select public.leave_room_seat((select room_code from created_room))$$,
  'player can leave own seat'
);
reset role;
select is((select count(*)::integer from public.room_seats where player_uid is not null), 1, 'leave clears only caller seat');
select is((select revision > 0 from public.room_change_versions limit 1), true, 'seat changes advance room revision');
select is((select jsonb_array_length(get_room_details((select room_code from created_room))->'seats')), 10, 'details expose ten sanitized seats');

select * from finish();
rollback;
