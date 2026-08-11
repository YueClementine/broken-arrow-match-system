export type PlayerCandidate = {
  id: number;
  name: string;
  level: number | null;
  elo: number;
  rank: number | null;
  ratingGames: number;
  updatedAt: string | null;
};

export type PlayerProfileSnapshot = {
  batraceId: number;
  canonicalName: string;
  level: number | null;
  elo: number | null;
  recentWinRate: number | null;
  recentAverageKd: number | null;
  matchCount: number;
  primaryCategory: string | null;
  topUnits: string[];
  fetchedAt: string;
};

type SearchPlayer = {
  id?: unknown;
  name?: unknown;
  level?: unknown;
  rating?: unknown;
  rank?: unknown;
  rating_games?: unknown;
  updated_at?: unknown;
};

type SearchPayload = { players?: SearchPlayer[] };

function matchPriority(name: string, query: string): number {
  if (name === query) return 0;
  const normalizedName = name.toLocaleLowerCase();
  const normalizedQuery = query.toLocaleLowerCase();
  if (normalizedName === normalizedQuery) return 1;
  if (normalizedName.startsWith(normalizedQuery)) return 2;
  return 3;
}

export function sanitizeAndSortCandidates(
  payload: SearchPayload,
  query: string,
): PlayerCandidate[] {
  return (payload.players ?? [])
    .filter(
      (player) =>
        typeof player.id === 'number' &&
        typeof player.name === 'string' &&
        typeof player.rating === 'number' &&
        player.rating > 0 &&
        typeof player.rating_games === 'number' &&
        player.rating_games > 0,
    )
    .map((player) => ({
      id: player.id as number,
      name: player.name as string,
      level: typeof player.level === 'number' ? player.level : null,
      elo: Math.round(player.rating as number),
      rank: typeof player.rank === 'number' ? player.rank : null,
      ratingGames: player.rating_games as number,
      updatedAt: typeof player.updated_at === 'string' ? player.updated_at : null,
    }))
    .sort((left, right) => {
      const priority = matchPriority(left.name, query) - matchPriority(right.name, query);
      return priority || right.elo - left.elo || left.name.localeCompare(right.name);
    })
    .slice(0, 8);
}

type InfoPayload = {
  info?: { id?: unknown; name?: unknown; level?: unknown };
};

type TrendPoint = {
  won?: unknown;
  kdRatio?: unknown;
  ratingAfter?: unknown;
};

type AnalysisPayload = {
  matchCount?: unknown;
  trend?: { points?: TrendPoint[] };
  categoryPreferences?: Array<{ categoryKey?: unknown; [key: string]: unknown }>;
  highlightUnits?: Array<{ unitName?: unknown; [key: string]: unknown }>;
};

function roundedAverage(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

export function buildPlayerProfile(
  infoPayload: InfoPayload,
  analysisPayload: AnalysisPayload,
  fetchedAt: string,
): PlayerProfileSnapshot {
  const info = infoPayload.info;
  if (!info || typeof info.id !== 'number' || typeof info.name !== 'string' || !info.name.trim()) {
    throw new Error('INVALID_BATRACE_PROFILE');
  }
  const points = (analysisPayload.trend?.points ?? []).filter(
    (point) => point && typeof point === 'object',
  );
  const recent = points.slice(-12);
  const validRatings = points
    .map((point) => point.ratingAfter)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const kdValues = recent
    .map((point) => point.kdRatio)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  const winSamples = recent.filter((point) => typeof point.won === 'boolean');
  const wins = winSamples.filter((point) => point.won === true).length;

  return {
    batraceId: info.id,
    canonicalName: info.name.trim(),
    level: typeof info.level === 'number' && Number.isFinite(info.level) ? info.level : null,
    elo: validRatings.length > 0 ? Math.round(validRatings.at(-1) as number) : null,
    recentWinRate:
      winSamples.length > 0 ? Math.round((wins / winSamples.length) * 100) : null,
    recentAverageKd: roundedAverage(kdValues),
    matchCount:
      typeof analysisPayload.matchCount === 'number' && Number.isFinite(analysisPayload.matchCount)
        ? analysisPayload.matchCount
        : points.length,
    primaryCategory:
      typeof analysisPayload.categoryPreferences?.[0]?.categoryKey === 'string'
        ? analysisPayload.categoryPreferences[0].categoryKey
        : null,
    topUnits: (analysisPayload.highlightUnits ?? [])
      .map((unit) => unit.unitName)
      .filter((name): name is string => typeof name === 'string' && name.length > 0)
      .slice(0, 3),
    fetchedAt,
  };
}
