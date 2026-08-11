import { describe, expect, it } from 'vitest';
import {
  buildPlayerProfile,
  sanitizeAndSortCandidates,
} from './profileTransform';

const searchPayload = {
  count: 5,
  players: [
    { id: 2, name: 'RAVEN-X', level: 15, rating: 1709.68, rank: 20, rating_games: 78, updated_at: '2026-07-28T00:00:00Z' },
    { id: 1, name: 'Raven', level: 81, rating: 2722.32, rank: 1, rating_games: 820, updated_at: '2026-07-28T00:00:00Z' },
    { id: 3, name: 'raven', level: 7, rating: 526.95, rank: 30, rating_games: 11, updated_at: '2026-07-07T00:00:00Z' },
    { id: 4, name: 'No Elo', level: 1, rating: 0, rank: -1, rating_games: 0, updated_at: '2026-07-01T00:00:00Z' },
    { id: 5, name: 'Other', level: 30, rating: 2100, rank: 10, rating_games: 100, updated_at: '2026-07-01T00:00:00Z' },
  ],
};

describe('BATrace profile transforms', () => {
  it('filters players without Elo and prioritizes exact and prefix matches', () => {
    expect(sanitizeAndSortCandidates(searchPayload, 'Raven')).toEqual([
      expect.objectContaining({ id: 1, name: 'Raven', elo: 2722 }),
      expect.objectContaining({ id: 3, name: 'raven', elo: 527 }),
      expect.objectContaining({ id: 2, name: 'RAVEN-X', elo: 1710 }),
      expect.objectContaining({ id: 5, name: 'Other', elo: 2100 }),
    ]);
  });

  it('uses the final valid trend Elo and computes the last 12 match summary', () => {
    const points = Array.from({ length: 14 }, (_, index) => ({
      matchId: String(index),
      won: index % 3 !== 0,
      kdRatio: index + 1,
      ratingAfter: index === 13 ? 2345.6 : 2200 + index,
    }));

    expect(
      buildPlayerProfile(
        { info: { id: 8863, name: 'Raven', level: 83 } },
        {
          matchCount: 81,
          trend: { points },
          categoryPreferences: [{ categoryKey: 'aircrafts', percentage: 21.8 }],
          highlightUnits: [
            { unitName: 'B-2 Spirit' },
            { unitName: 'Rangers RRC' },
            { unitName: 'Delta Force' },
            { unitName: 'Ignored' },
          ],
        },
        '2026-08-11T12:00:00.000Z',
      ),
    ).toEqual({
      batraceId: 8863,
      canonicalName: 'Raven',
      level: 83,
      elo: 2346,
      recentWinRate: 67,
      recentAverageKd: 8.5,
      matchCount: 81,
      primaryCategory: 'aircrafts',
      topUnits: ['B-2 Spirit', 'Rangers RRC', 'Delta Force'],
      fetchedAt: '2026-08-11T12:00:00.000Z',
    });
  });
});
