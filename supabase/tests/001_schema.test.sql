begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

select has_schema('private');
select has_table('public', 'rooms');
select has_table('public', 'room_seats');
select has_table('public', 'voice_channel_pairs');
select has_table('public', 'player_profiles');
select has_table('public', 'room_change_versions');
select has_table('private', 'room_admin_secrets');
select has_table('private', 'batrace_search_cache');
select has_table('private', 'batrace_quota');
select has_table('private', 'app_config');
select has_pk('public', 'rooms');
select has_pk('public', 'room_seats');
select has_index('public', 'room_seats', 'room_seats_one_seat_per_user');
select col_is_pk('public', 'player_profiles', 'batrace_id');
select is((select count(*)::integer from public.voice_channel_pairs), 10, 'ten OOPZ pairs are migration data');
select is((select team_a_channel from public.voice_channel_pairs where id = 1), 1::smallint, 'pair 1 starts at OOPZ 001');
select is((select team_b_channel from public.voice_channel_pairs where id = 10), 20::smallint, 'pair 10 ends at OOPZ 020');
select has_function('public', 'list_lobby_rooms', array[]::text[]);
select has_function('public', 'get_room_details', array['text']);
select has_function('public', 'get_public_config', array[]::text[]);

select * from finish();
rollback;
