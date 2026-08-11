import {
  buildPlayerProfile,
  sanitizeAndSortCandidates,
  type PlayerCandidate,
  type PlayerProfileSnapshot,
} from '../_shared/profileTransform.ts';

const BATRACE_ORIGIN = 'https://app.batrace.top';
const SEARCH_TTL_MS = 10 * 60 * 1000;
const PROFILE_TTL_MS = 6 * 60 * 60 * 1000;

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type BatraceDependencies = {
  allowedOrigins: string[];
  timeoutMs: number;
  now: () => Date;
  authenticate: (authorization: string | null) => Promise<string | null>;
  isEnabled: () => Promise<boolean>;
  getSearchCache: (key: string) => Promise<PlayerCandidate[] | null>;
  putSearchCache: (key: string, value: PlayerCandidate[], expiresAt: Date) => Promise<void>;
  getProfile: (playerId: number) => Promise<PlayerProfileSnapshot | null>;
  putProfile: (profile: PlayerProfileSnapshot) => Promise<PlayerProfileSnapshot>;
  consumeQuota: (userId: string, kind: 'search' | 'profile') => Promise<void>;
  fetch: FetchLike;
};

function headersFor(origin: string | null, deps: BatraceDependencies): HeadersInit {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    vary: 'Origin',
  };
  if (origin && deps.allowedOrigins.includes(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-headers'] = 'authorization, apikey, content-type, x-client-info';
    headers['access-control-allow-methods'] = 'POST, OPTIONS';
  }
  return headers;
}

function json(
  deps: BatraceDependencies,
  origin: string | null,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), { status, headers: headersFor(origin, deps) });
}

async function fetchJson(deps: BatraceDependencies, url: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
    try {
      const response = await deps.fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json', 'user-agent': 'broken-arrow-match-system/1.0' },
        signal: controller.signal,
      });
      if (response.ok) return await response.json();
      lastError = new Error(`UPSTREAM_${response.status}`);
      if (response.status < 500) break;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('BATRACE_UNAVAILABLE');
}

function safePlayerId(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function errorResponse(deps: BatraceDependencies, origin: string | null, error: unknown): Response {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('BATRACE_RATE_LIMITED')) {
    return json(deps, origin, { error: 'BATRACE_RATE_LIMITED' }, 429);
  }
  if (message === 'INVALID_BATRACE_PROFILE') {
    return json(deps, origin, { error: 'BATRACE_PROFILE_INVALID' }, 502);
  }
  return json(deps, origin, { error: 'BATRACE_UNAVAILABLE' }, 503);
}

export function createBatraceHandler(deps: BatraceDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    if (origin && !deps.allowedOrigins.includes(origin)) {
      return json(deps, origin, { error: 'ORIGIN_NOT_ALLOWED' }, 403);
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: headersFor(origin, deps) });
    }
    if (request.method !== 'POST') return json(deps, origin, { error: 'METHOD_NOT_ALLOWED' }, 405);

    const userId = await deps.authenticate(request.headers.get('authorization'));
    if (!userId) return json(deps, origin, { error: 'AUTH_REQUIRED' }, 401);

    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return json(deps, origin, { error: 'INVALID_REQUEST' }, 400);
    }
    if ('url' in body || 'userId' in body || !await deps.isEnabled()) {
      if ('url' in body || 'userId' in body) return json(deps, origin, { error: 'INVALID_REQUEST' }, 400);
      return json(deps, origin, { error: 'BATRACE_DISABLED' }, 503);
    }

    try {
      if (body.action === 'search') {
        const query = typeof body.query === 'string' ? body.query.trim() : '';
        if (query.length < 2 || query.length > 64) {
          return json(deps, origin, { error: 'INVALID_QUERY' }, 400);
        }
        const cacheKey = `search:${query.toLocaleLowerCase()}`;
        const cached = await deps.getSearchCache(cacheKey);
        if (cached) return json(deps, origin, { candidates: cached, cached: true });

        await deps.consumeQuota(userId, 'search');
        const url = new URL('/api/players/search', BATRACE_ORIGIN);
        url.searchParams.set('q', query);
        url.searchParams.set('limit', '20');
        const candidates = sanitizeAndSortCandidates(await fetchJson(deps, url.toString()) as never, query);
        await deps.putSearchCache(cacheKey, candidates, new Date(deps.now().getTime() + SEARCH_TTL_MS));
        return json(deps, origin, { candidates, cached: false });
      }

      if (body.action === 'profile') {
        const playerId = safePlayerId(body.playerId);
        if (!playerId) return json(deps, origin, { error: 'INVALID_PLAYER_ID' }, 400);
        const cached = await deps.getProfile(playerId);
        if (cached && deps.now().getTime() - new Date(cached.fetchedAt).getTime() < PROFILE_TTL_MS) {
          return json(deps, origin, { profile: cached, cached: true });
        }

        await deps.consumeQuota(userId, 'profile');
        const infoUrl = new URL('/api/players/info', BATRACE_ORIGIN);
        const analysisUrl = new URL('/api/analysis/player', BATRACE_ORIGIN);
        infoUrl.searchParams.set('stbid', String(playerId));
        analysisUrl.searchParams.set('stbid', String(playerId));
        const [info, analysis] = await Promise.all([
          fetchJson(deps, infoUrl.toString()),
          fetchJson(deps, analysisUrl.toString()),
        ]);
        const profile = buildPlayerProfile(info as never, analysis as never, deps.now().toISOString());
        if (profile.batraceId !== playerId) throw new Error('INVALID_BATRACE_PROFILE');
        const saved = await deps.putProfile(profile);
        return json(deps, origin, { profile: saved, cached: false });
      }

      return json(deps, origin, { error: 'INVALID_ACTION' }, 400);
    } catch (error) {
      return errorResponse(deps, origin, error);
    }
  };
}
