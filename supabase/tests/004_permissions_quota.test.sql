begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
set local role anon;
select throws_ok('select * from public.rooms', '42501', null, 'anon cannot read rooms directly');
select throws_ok('select * from public.room_seats', '42501', null, 'anon cannot read seats directly');
select lives_ok('select * from public.list_lobby_rooms()', 'anon can use sanitized lobby RPC');
select lives_ok($$select public.get_room_details('MISSING')$$, 'anon can use sanitized room RPC');
reset role;

select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select lives_ok($$select public.consume_batrace_quota('30000000-0000-0000-0000-000000000001', 'search')$$, 'service role can consume search quota');
select lives_ok($$select public.consume_batrace_quota('30000000-0000-0000-0000-000000000001', 'profile')$$, 'service role can consume profile quota');
reset role;

select is((select batrace_enabled from public.get_public_config()), false, 'BATrace defaults off');
select is((select count(*)::integer from private.batrace_quota), 3, 'per-user and shared global counters are recorded');
select is((select request_count from private.batrace_quota where scope_key = '*'), 3, 'profile miss counts as two upstream requests');
select is((select count(*)::integer from information_schema.role_table_grants where table_schema = 'private' and grantee in ('anon','authenticated')), 0, 'private tables have no client grants');
select is((select count(*)::integer from information_schema.role_table_grants where table_schema = 'public' and table_name = 'player_profiles' and grantee in ('anon','authenticated')), 0, 'profiles have no direct client grants');

select * from finish();
rollback;
