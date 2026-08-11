import { describe, expect, it, vi } from 'vitest';
import { createRoomWith } from './api';

describe('room API adapter', () => {
  it('maps the first create_room row to the browser DTO', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        room_code: 'A1B2C3',
        admin_token: 'secret',
        voice_pair_id: 1,
        team_a_channel: 1,
        team_b_channel: 2,
      }],
      error: null,
    });

    await expect(createRoomWith({ rpc }, {
      startAt: '2026-08-12T12:00:00.000Z',
      title: '周末约战',
      hostNickname: 'Raven',
      hostQQ: '12345678',
      note: '',
      hostTeam: 'A',
      hostSeatNo: 1,
      hostBatraceId: null,
    })).resolves.toEqual({
      roomCode: 'A1B2C3',
      adminToken: 'secret',
      voicePairId: 1,
      teamAChannel: 1,
      teamBChannel: 2,
    });
  });

  it('throws the stable database error instead of returning partial data', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'SEAT_TAKEN' } });
    await expect(createRoomWith({ rpc }, {
      startAt: '', title: '', hostNickname: '', hostQQ: '', note: '',
      hostTeam: 'A', hostSeatNo: 1, hostBatraceId: null,
    })).rejects.toThrow('SEAT_TAKEN');
  });
});
