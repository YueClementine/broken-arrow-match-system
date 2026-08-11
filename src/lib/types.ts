import type { PlayerProfileSnapshot } from '../features/player-profile/profileTransform';
import type { Team } from './validation';

export type LobbyRoom = {
  roomCode: string;
  title: string;
  startAt: string;
  playerCount: number;
  voicePairId: number;
  teamAChannel: number;
  teamBChannel: number;
};

export type RoomSeat = {
  team: Team;
  seatNo: number;
  nickname: string | null;
  qq: string | null;
  joinedAt: string | null;
  isMine: boolean;
  profile: PlayerProfileSnapshot | null;
};

export type RoomDetails = {
  subscriptionKey: string;
  roomCode: string;
  title: string;
  startAt: string;
  hostNickname: string;
  hostQQ: string;
  note: string;
  status: 'active' | 'cancelled';
  readOnly: boolean;
  playerCount: number;
  voice: { pairId: number; teamAChannel: number; teamBChannel: number };
  seats: RoomSeat[];
};

export type CreateRoomInput = {
  startAt: string;
  title: string;
  hostNickname: string;
  hostQQ: string;
  note: string;
  hostTeam: Team;
  hostSeatNo: number;
  hostBatraceId: number | null;
};

export type CreateRoomResult = {
  roomCode: string;
  adminToken: string;
  voicePairId: number;
  teamAChannel: number;
  teamBChannel: number;
};

export type JoinSeatInput = {
  roomCode: string;
  team: Team;
  seatNo: number;
  nickname: string;
  qq: string;
  batraceId: number | null;
};

export type AdminRoomInput = {
  roomCode: string;
  adminToken: string;
  startAt: string;
  title: string;
  hostNickname: string;
  hostQQ: string;
  note: string;
};
