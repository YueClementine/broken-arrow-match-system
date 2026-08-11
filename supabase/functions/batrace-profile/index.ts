import { createClient } from 'npm:@supabase/supabase-js@2';
import { createBatraceHandler } from './core.ts';
import type { PlayerCandidate, PlayerProfileSnapshot } from '../_shared/profileTransform.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const secretKey = Deno.env.get('SUPABASE_SECRET_KEY');
const siteOrigin = Deno.env.get('SITE_ORIGIN');

if (!supabaseUrl || !secretKey || !siteOrigin) {
  throw new Error('SUPABASE_URL, SUPABASE_SECRET_KEY and SITE_ORIGIN are required');
}

const backend = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const backendHostname = new URL(supabaseUrl).hostname;
const developmentOrigins = ['localhost', '127.0.0.1'].includes(backendHostname)
  ? ['http://localhost:5173', 'http://127.0.0.1:5173']
  : [];

const handler = createBatraceHandler({
  allowedOrigins: [siteOrigin, ...developmentOrigins],
  timeoutMs: 8_000,
  now: () => new Date(),
  fetch,
  authenticate: async (authorization) => {
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return null;
    const { data, error } = await backend.auth.getUser(token);
    if (error || !data.user || data.user.is_anonymous !== true) return null;
    return data.user.id;
  },
  isEnabled: async () => {
    const { data, error } = await backend.rpc('get_public_config').single();
    if (error) throw error;
    return data.batrace_enabled === true;
  },
  getSearchCache: async (key) => {
    const { data, error } = await backend.rpc('batrace_search_cache_get', { p_cache_key: key });
    if (error) throw error;
    return Array.isArray(data) ? data as PlayerCandidate[] : null;
  },
  putSearchCache: async (key, payload, expiresAt) => {
    const { error } = await backend.rpc('batrace_search_cache_put', {
      p_cache_key: key,
      p_payload: payload,
      p_expires_at: expiresAt.toISOString(),
    });
    if (error) throw error;
  },
  getProfile: async (playerId) => {
    const { data, error } = await backend
      .from('player_profiles')
      .select('batrace_id,canonical_name,level,elo,recent_win_rate,recent_average_kd,match_count,primary_category,top_units,fetched_at')
      .eq('batrace_id', playerId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      batraceId: data.batrace_id,
      canonicalName: data.canonical_name,
      level: data.level,
      elo: data.elo,
      recentWinRate: data.recent_win_rate,
      recentAverageKd: data.recent_average_kd === null ? null : Number(data.recent_average_kd),
      matchCount: data.match_count,
      primaryCategory: data.primary_category,
      topUnits: Array.isArray(data.top_units) ? data.top_units.filter((item): item is string => typeof item === 'string') : [],
      fetchedAt: data.fetched_at,
    } satisfies PlayerProfileSnapshot;
  },
  putProfile: async (profile) => {
    const { error } = await backend.from('player_profiles').upsert({
      batrace_id: profile.batraceId,
      canonical_name: profile.canonicalName,
      level: profile.level,
      elo: profile.elo,
      recent_win_rate: profile.recentWinRate,
      recent_average_kd: profile.recentAverageKd,
      match_count: profile.matchCount,
      primary_category: profile.primaryCategory,
      top_units: profile.topUnits,
      fetched_at: profile.fetchedAt,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return profile;
  },
  consumeQuota: async (userId, kind) => {
    const { error } = await backend.rpc('consume_batrace_quota', {
      p_user_id: userId,
      p_kind: kind,
    });
    if (error) throw error;
  },
});

Deno.serve(handler);
