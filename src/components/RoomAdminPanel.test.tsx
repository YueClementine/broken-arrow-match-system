import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RoomAdminPanel } from './RoomAdminPanel';

vi.mock('../lib/api', () => ({
  adminUpdateRoom: vi.fn(),
  adminCancelRoom: vi.fn(),
}));

describe('RoomAdminPanel', () => {
  it('keeps the cancel action visible while the edit controls are collapsed', () => {
    render(<RoomAdminPanel
      room={{
        subscriptionKey: 'room-id',
        roomCode: 'ABC123',
        title: '周末约战',
        startAt: '2026-08-12T12:00:00.000Z',
        hostNickname: '房主',
        hostQQ: '12345678',
        note: '',
        status: 'active',
        readOnly: false,
        playerCount: 1,
        voice: { pairId: 1, teamAChannel: 1, teamBChannel: 2 },
        seats: [],
      }}
      token="admin-token"
      onChanged={vi.fn()}
    />);

    expect(screen.getByRole('button', { name: '取消整场约战' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '复制管理链接' })).not.toBeInTheDocument();
  });
});
