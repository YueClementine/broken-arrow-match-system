import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PlayerProfileCard } from './PlayerProfileCard';

describe('PlayerProfileCard', () => {
  it('shows compact stats and expands the cropped details', async () => {
    render(<PlayerProfileCard profile={{
      batraceId: 8863,
      canonicalName: 'Raven',
      level: 83,
      elo: 2346,
      recentWinRate: 67,
      recentAverageKd: 1.8,
      matchCount: 81,
      primaryCategory: 'aircrafts',
      topUnits: ['B-2 Spirit'],
      fetchedAt: '2026-08-11T12:00:00.000Z',
    }} />);

    expect(screen.getByText('ELO 2346')).toBeInTheDocument();
    expect(screen.getByText('展开 BATrace 资料').closest('details')).not.toHaveAttribute('open');
    await userEvent.click(screen.getByText('展开 BATrace 资料'));
    expect(screen.getByText('B-2 Spirit')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看 BATrace 原始资料页' })).toHaveAttribute(
      'href',
      'https://app.batrace.top/player/8863',
    );
  });
});
