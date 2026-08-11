import type { PlayerCandidate, PlayerProfileSnapshot } from '../features/player-profile/profileTransform';
import { getSupabase } from './supabase';
import type {
  AdminRoomInput,
  CreateRoomInput,
  CreateRoomResult,
  JoinSeatInput,
  LobbyRoom,
  RoomDetails,
} from './types';
import type { Team } from './validation';

type RpcError = { message: string } | null;
export type RpcClient = {
  rpc: (name: string, parameters?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: RpcError }>;
};

function raise(error: RpcError) {
  if (error) throw new Error(error.message);
}

function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error('INVALID_SERVER_RESPONSE');
  return value as Record<string, unknown>;
}

export async function createRoomWith(client: RpcClient, input: CreateRoomInput): Promise<CreateRoomResult> {
  const { data, error } = await client.rpc('create_room', {
    p_start_at: input.startAt,
    p_title: input.title,
    p_host_nickname: input.hostNickname,
    p_host_qq: input.hostQQ,
    p_note: input.note,
    p_host_team: input.hostTeam,
    p_host_seat_no: input.hostSeatNo,
    p_host_batrace_id: input.hostBatraceId,
  });
  raise(error);
  const result = row(Array.isArray(data) ? data[0] : data);
  return {
    roomCode: String(result.room_code),
    adminToken: String(result.admin_token),
    voicePairId: Number(result.voice_pair_id),
    teamAChannel: Number(result.team_a_channel),
    teamBChannel: Number(result.team_b_channel),
  };
}

export function createRoom(input: CreateRoomInput) {
  return createRoomWith(getSupabase() as unknown as RpcClient, input);
}

export async function listLobbyRooms(): Promise<LobbyRoom[]> {
  const { data, error } = await getSupabase().rpc('list_lobby_rooms');
  raise(error);
  return (data ?? []).map((item: Record<string, unknown>) => ({
    roomCode: String(item.room_code),
    title: String(item.title),
    startAt: String(item.start_at),
    playerCount: Number(item.player_count),
    voicePairId: Number(item.voice_pair_id),
    teamAChannel: Number(item.team_a_channel),
    teamBChannel: Number(item.team_b_channel),
  }));
}

export async function getRoomDetails(roomCode: string): Promise<RoomDetails | null> {
  const { data, error } = await getSupabase().rpc('get_room_details', { p_room_code: roomCode });
  raise(error);
  return data as RoomDetails | null;
}

async function mutation(name: string, parameters: Record<string, unknown>) {
  const { error } = await getSupabase().rpc(name, parameters);
  raise(error);
}

export function joinRoomSeat(input: JoinSeatInput) {
  return mutation('join_room_seat', {
    p_room_code: input.roomCode,
    p_team: input.team,
    p_seat_no: input.seatNo,
    p_nickname: input.nickname,
    p_qq: input.qq,
    p_batrace_id: input.batraceId,
  });
}

export function leaveRoomSeat(roomCode: string) {
  return mutation('leave_room_seat', { p_room_code: roomCode });
}

export function updateMyPlayerProfile(roomCode: string, nickname: string, batraceId: number | null) {
  return mutation('update_my_player_profile', {
    p_room_code: roomCode,
    p_nickname: nickname,
    p_batrace_id: batraceId,
  });
}

export async function verifyRoomAdmin(roomCode: string, adminToken: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('verify_room_admin', {
    p_room_code: roomCode,
    p_admin_token: adminToken,
  });
  raise(error);
  return data === true;
}

export function adminUpdateRoom(input: AdminRoomInput) {
  return mutation('admin_update_room', {
    p_room_code: input.roomCode,
    p_admin_token: input.adminToken,
    p_start_at: input.startAt,
    p_title: input.title,
    p_host_nickname: input.hostNickname,
    p_host_qq: input.hostQQ,
    p_note: input.note,
  });
}

export function adminRemovePlayer(roomCode: string, adminToken: string, team: Team, seatNo: number) {
  return mutation('admin_remove_player', {
    p_room_code: roomCode,
    p_admin_token: adminToken,
    p_team: team,
    p_seat_no: seatNo,
  });
}

export function adminCancelRoom(roomCode: string, adminToken: string) {
  return mutation('admin_cancel_room', { p_room_code: roomCode, p_admin_token: adminToken });
}

export async function getBatraceEnabled(): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('get_public_config');
  raise(error);
  return Array.isArray(data) ? data[0]?.batrace_enabled === true : false;
}

async function invokeBatrace(body: Record<string, unknown>) {
  const { data, error } = await getSupabase().functions.invoke('batrace-profile', { body });
  if (error) throw new Error((data as { error?: string } | null)?.error ?? error.message);
  const payload = data as { error?: string };
  if (payload.error) throw new Error(payload.error);
  return data;
}

export async function searchPlayers(query: string): Promise<PlayerCandidate[]> {
  const data = await invokeBatrace({ action: 'search', query }) as { candidates: PlayerCandidate[] };
  return data.candidates;
}

export async function loadPlayerProfile(playerId: number): Promise<PlayerProfileSnapshot> {
  const data = await invokeBatrace({ action: 'profile', playerId }) as { profile: PlayerProfileSnapshot };
  return data.profile;
}
