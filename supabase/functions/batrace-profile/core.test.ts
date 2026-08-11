import { describe, expect, it, vi } from 'vitest';
import { createBatraceHandler, type BatraceDependencies } from './core';

const NOW = new Date('2026-08-11T12:00:00.000Z');
const ORIGIN = 'https://example.github.io';

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function request(body: unknown, origin = ORIGIN, authorization = 'Bearer valid') {
  return new Request('https://project.supabase.co/functions/v1/batrace-profile', {
    method: 'POST',
    headers: { authorization, origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function dependencies(overrides: Partial<BatraceDependencies> = {}): BatraceDependencies {
  return {
    allowedOrigins: [ORIGIN, 'http://localhost:5173'],
    timeoutMs: 50,
    now: () => NOW,
    authenticate: vi.fn(async (header) => header === 'Bearer valid' ? 'user-1' : null),
    isEnabled: vi.fn(async () => true),
    getSearchCache: vi.fn(async () => null),
    putSearchCache: vi.fn(async () => undefined),
    getProfile: vi.fn(async () => null),
    putProfile: vi.fn(async (profile) => profile),
    consumeQuota: vi.fn(async () => undefined),
    fetch: vi.fn(async (url: string | URL) => {
      const path = new URL(url).pathname;
      if (path.endsWith('/search')) {
        return jsonResponse({
          players: [
            { id: 2, name: 'RAVEN-X', level: 15, rating: 1709.68, rating_games: 78 },
            { id: 1, name: 'Raven', level: 81, rating: 2722.32, rating_games: 820 },
            { id: 3, name: 'No Elo', level: 2, rating: 0, rating_games: 0 },
          ],
        });
      }
      if (path.endsWith('/info')) {
        return jsonResponse({ info: { id: 1, name: 'Raven', level: 81, steam64: 'private' } });
      }
      return jsonResponse({
        matchCount: 2,
        trend: { points: [
          { won: true, kdRatio: 2, ratingAfter: 2700 },
          { won: false, kdRatio: 1, ratingAfter: 2722 },
        ] },
        categoryPreferences: [{ categoryKey: 'infantry' }],
        highlightUnits: [{ unitName: 'Rangers' }],
        matches: [{ secret: true }],
      });
    }),
    ...overrides,
  };
}

describe('BATrace Edge handler', () => {
  it('requires a valid JWT and never accepts a user id from the request body', async () => {
    const deps = dependencies();
    const response = await createBatraceHandler(deps)(
      request({ action: 'search', query: 'zo', userId: 'attacker' }, ORIGIN, 'Bearer bad'),
    );

    expect(response.status).toBe(401);
    expect(deps.consumeQuota).not.toHaveBeenCalled();
  });

  it('rejects arbitrary client URLs', async () => {
    const response = await createBatraceHandler(dependencies())(
      request({ action: 'search', query: 'zo', url: 'https://evil.example' }),
    );

    expect(response.status).toBe(400);
  });

  it('filters and ranks candidates, and charges only cache misses', async () => {
    const deps = dependencies();
    const response = await createBatraceHandler(deps)(request({ action: 'search', query: 'Raven' }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.candidates.map((candidate: { name: string }) => candidate.name)).toEqual(['Raven', 'RAVEN-X']);
    expect(deps.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/app\.batrace\.top\/api\/players\/search\?/),
      expect.any(Object),
    );
    expect(deps.consumeQuota).toHaveBeenCalledWith('user-1', 'search');
    expect(deps.putSearchCache).toHaveBeenCalledWith('search:raven', expect.any(Array), new Date(NOW.getTime() + 600_000));
  });

  it('returns cached search data without consuming quota or fetching upstream', async () => {
    const cached = [{ id: 1, name: 'Cached', level: 1, elo: 1200, rank: null, ratingGames: 3, updatedAt: null }];
    const deps = dependencies({ getSearchCache: vi.fn(async () => cached) });
    const response = await createBatraceHandler(deps)(request({ action: 'search', query: 'cached' }));

    expect(await response.json()).toEqual({ candidates: cached, cached: true });
    expect(deps.consumeQuota).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('crops the profile response and never exposes raw BATrace fields', async () => {
    const deps = dependencies();
    const response = await createBatraceHandler(deps)(request({ action: 'profile', playerId: 1 }));
    const payload = await response.json();

    expect(payload.profile).toEqual({
      batraceId: 1,
      canonicalName: 'Raven',
      level: 81,
      elo: 2722,
      recentWinRate: 50,
      recentAverageKd: 1.5,
      matchCount: 2,
      primaryCategory: 'infantry',
      topUnits: ['Rangers'],
      fetchedAt: NOW.toISOString(),
    });
    expect(JSON.stringify(payload)).not.toContain('steam64');
    expect(JSON.stringify(payload)).not.toContain('matches');
    expect(deps.consumeQuota).toHaveBeenCalledWith('user-1', 'profile');
  });

  it('uses a profile fetched within six hours without an upstream call', async () => {
    const profile = {
      batraceId: 1, canonicalName: 'Cached', level: 1, elo: 1200,
      recentWinRate: 50, recentAverageKd: 1, matchCount: 12,
      primaryCategory: null, topUnits: [], fetchedAt: new Date(NOW.getTime() - 1000).toISOString(),
    };
    const deps = dependencies({ getProfile: vi.fn(async () => profile) });
    const response = await createBatraceHandler(deps)(request({ action: 'profile', playerId: 1 }));

    expect(await response.json()).toEqual({ profile, cached: true });
    expect(deps.consumeQuota).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('retries one 5xx response and maps an upstream failure to a safe 503', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 502))
      .mockResolvedValueOnce(jsonResponse({}, 502));
    const response = await createBatraceHandler(dependencies({ fetch }))(request({ action: 'search', query: 'zo' }));

    expect(response.status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await response.json()).toEqual({ error: 'BATRACE_UNAVAILABLE' });
  });

  it('times out, retries once, and degrades to a safe error', async () => {
    const fetch = vi.fn((_url, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const response = await createBatraceHandler(dependencies({ fetch, timeoutMs: 5 }))(
      request({ action: 'search', query: 'zo' }),
    );

    expect(response.status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('honors the runtime switch and restricts CORS origins', async () => {
    const disabled = await createBatraceHandler(dependencies({ isEnabled: vi.fn(async () => false) }))(
      request({ action: 'search', query: 'zo' }),
    );
    const foreign = await createBatraceHandler(dependencies())(
      request({ action: 'search', query: 'zo' }, 'https://evil.example'),
    );

    expect(disabled.status).toBe(503);
    expect(await disabled.json()).toEqual({ error: 'BATRACE_DISABLED' });
    expect(foreign.status).toBe(403);
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('maps a serialized quota rejection to 429 without calling BATrace', async () => {
    const deps = dependencies({
      consumeQuota: vi.fn(async () => { throw new Error('BATRACE_RATE_LIMITED'); }),
    });
    const response = await createBatraceHandler(deps)(request({ action: 'search', query: 'zo' }));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'BATRACE_RATE_LIMITED' });
    expect(deps.fetch).not.toHaveBeenCalled();
  });
});
