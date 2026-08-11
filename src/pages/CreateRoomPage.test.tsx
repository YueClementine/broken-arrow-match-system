import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CreateRoomPage } from './CreateRoomPage';

describe('CreateRoomPage', () => {
  it('requires explicit public-data consent before submission', async () => {
    render(
      <MemoryRouter>
        <CreateRoomPage api={{
          createRoom: vi.fn(),
          getBatraceEnabled: vi.fn(async () => false),
          searchPlayers: vi.fn(),
          loadPlayerProfile: vi.fn(),
        }} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: '创建约战' })).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: '创建约战' })).toBeEnabled();
  });
});
