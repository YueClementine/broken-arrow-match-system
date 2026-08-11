import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlayerLookup } from './PlayerLookup';
import type { PlayerCandidate, PlayerProfileSnapshot } from './profileTransform';

const candidate: PlayerCandidate = {
  id: 8863,
  name: 'Raven',
  level: 83,
  elo: 2346,
  rank: 1,
  ratingGames: 81,
  updatedAt: null,
};

const profile: PlayerProfileSnapshot = {
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
};

describe('PlayerLookup', () => {
  it('debounces search and replaces the nickname with the selected canonical name', async () => {
    const onNicknameChange = vi.fn();
    const onProfileChange = vi.fn();
    const search = vi.fn(async () => [candidate]);
    const loadProfile = vi.fn(async () => profile);
    render(
      <PlayerLookup
        enabled
        nickname="zo"
        profile={null}
        onNicknameChange={onNicknameChange}
        onProfileChange={onProfileChange}
        search={search}
        loadProfile={loadProfile}
        debounceMs={0}
      />,
    );

    expect(await screen.findByRole('option', { name: /Raven.*ELO 2346.*Lv\.83.*ID 8863/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: /Raven.*ELO 2346/i }));

    await waitFor(() => expect(loadProfile).toHaveBeenCalledWith(8863));
    expect(onNicknameChange).toHaveBeenCalledWith('Raven');
    expect(onProfileChange).toHaveBeenCalledWith(profile);
  });

  it('keeps manual entry usable when lookup fails and can skip a selected profile', async () => {
    const onProfileChange = vi.fn();
    const { rerender } = render(
      <PlayerLookup
        enabled
        nickname="manual"
        profile={null}
        onNicknameChange={vi.fn()}
        onProfileChange={onProfileChange}
        search={vi.fn(async () => { throw new Error('offline'); })}
        loadProfile={vi.fn()}
        debounceMs={0}
      />,
    );
    fireEvent.change(screen.getByLabelText('游戏昵称'), { target: { value: 'manual2' } });
    expect(await screen.findByText('BATrace 暂时不可用，可继续使用手填昵称。')).toBeInTheDocument();

    rerender(
      <PlayerLookup
        enabled
        nickname="Raven"
        profile={profile}
        onNicknameChange={vi.fn()}
        onProfileChange={onProfileChange}
        search={vi.fn()}
        loadProfile={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '解除 BATrace 关联' }));
    expect(onProfileChange).toHaveBeenCalledWith(null);
  });
});
