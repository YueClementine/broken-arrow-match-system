create function public.batrace_search_cache_get(p_cache_key text)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select cache.payload
  from private.batrace_search_cache as cache
  where cache.cache_key = p_cache_key
    and cache.expires_at > now();
$$;

create function public.batrace_search_cache_put(
  p_cache_key text,
  p_payload jsonb,
  p_expires_at timestamptz
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into private.batrace_search_cache (cache_key, payload, expires_at, updated_at)
  values (p_cache_key, p_payload, p_expires_at, now())
  on conflict (cache_key) do update
  set payload = excluded.payload,
      expires_at = excluded.expires_at,
      updated_at = now();
$$;

revoke all on function public.batrace_search_cache_get(text) from public, anon, authenticated;
revoke all on function public.batrace_search_cache_put(text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.batrace_search_cache_get(text) to service_role;
grant execute on function public.batrace_search_cache_put(text, jsonb, timestamptz) to service_role;
