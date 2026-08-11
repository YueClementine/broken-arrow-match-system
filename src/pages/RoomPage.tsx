import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PrivacyConfirmation } from '../components/PrivacyConfirmation';
import { RoomAdminPanel } from '../components/RoomAdminPanel';
import { RoomSeat } from '../components/RoomSeat';
import { PlayerLookup } from '../features/player-profile/PlayerLookup';
import type { PlayerProfileSnapshot } from '../features/player-profile/profileTransform';
import {
  adminRemovePlayer,
  getBatraceEnabled,
  getRoomDetails,
  joinRoomSeat,
  leaveRoomSeat,
  loadPlayerProfile,
  searchPlayers,
  updateMyPlayerProfile,
  verifyRoomAdmin,
} from '../lib/api';
import { adminStorageKey, captureAdminToken } from '../lib/adminToken';
import { formatBeijingDateTime } from '../lib/beijingTime';
import { toUserMessage } from '../lib/errors';
import { getSupabase } from '../lib/supabase';
import type { RoomDetails, RoomSeat as RoomSeatType } from '../lib/types';
import type { Team } from '../lib/validation';

type SeatTarget = { team: Team; seatNo: number };

export function RoomPage() {
  const { roomCode = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const code = roomCode.toUpperCase();
  const [room, setRoom] = useState<RoomDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [target, setTarget] = useState<SeatTarget | null>(null);
  const [editingProfile, setEditingProfile] = useState<RoomSeatType | null>(null);
  const [adminToken, setAdminToken] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [batraceEnabled, setBatraceEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const details = await getRoomDetails(code);
      setRoom(details);
      setError(details ? '' : '没有找到这个房间。');
    } catch (cause) {
      setError(toUserMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    const cleanSearch = captureAdminToken(code, location.search, sessionStorage);
    if (cleanSearch !== location.search) navigate(`${location.pathname}${cleanSearch}`, { replace: true });
    const token = sessionStorage.getItem(adminStorageKey(code)) ?? '';
    setAdminToken(token);
    if (token) void verifyRoomAdmin(code, token).then(setIsAdmin, () => setIsAdmin(false));
  }, [code, location.pathname, location.search, navigate]);

  useEffect(() => { void getBatraceEnabled().then(setBatraceEnabled, () => undefined); }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!room?.subscriptionKey) return;
    const channel = getSupabase().channel(`room:${room.subscriptionKey}`).on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'room_change_versions', filter: `room_id=eq.${room.subscriptionKey}` },
      () => {
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void load(), 250);
      },
    ).subscribe();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      void getSupabase().removeChannel(channel);
    };
  }, [load, room?.subscriptionKey]);

  async function leave() {
    setBusy(true);
    try { await leaveRoomSeat(code); await load(); } catch (cause) { setError(toUserMessage(cause)); }
    finally { setBusy(false); }
  }

  async function remove(seat: RoomSeatType) {
    if (!adminToken || !window.confirm(`确认移出 ${seat.nickname}？`)) return;
    setBusy(true);
    try { await adminRemovePlayer(code, adminToken, seat.team, seat.seatNo); await load(); }
    catch (cause) { setError(toUserMessage(cause)); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="state-panel" role="status">正在读取房间…</div>;
  if (!room) return <div className="state-panel error-state"><h1>房间不存在</h1><p>{error}</p></div>;

  const teams = (['A', 'B'] as const).map((team) => ({
    team,
    seats: room.seats.filter((seat) => seat.team === team),
    channel: team === 'A' ? room.voice.teamAChannel : room.voice.teamBChannel,
  }));

  return (
    <div className="page room-page">
      <section className="room-heading">
        <div className="room-card-top"><span className="room-code">#{room.roomCode}</span><span className={`status-pill ${room.status}`}>{room.status === 'cancelled' ? '已取消' : room.readOnly ? '已开始' : '报名中'}</span></div>
        <h1>{room.title}</h1>
        <p className="large-time">{formatBeijingDateTime(room.startAt)}</p>
        <p>房主 {room.hostNickname} · QQ {room.hostQQ}</p>
        {room.note && <p className="room-note">{room.note}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>

      {isAdmin && adminToken && !room.readOnly && <RoomAdminPanel room={room} token={adminToken} onChanged={load} />}
      {room.readOnly && <div className="read-only-banner">本场约战已{room.status === 'cancelled' ? '取消' : '开始'}，房间现在只读。</div>}

      <div className="team-grid">
        {teams.map(({ team, seats, channel }) => (
          <section className={`team-panel team-${team.toLowerCase()}`} key={team}>
            <header><div><p className="eyebrow">TEAM {team}</p><h2>{team} 队</h2></div><span>OOPZ {String(channel).padStart(3, '0')}</span></header>
            <div className="seat-list">
              {seats.map((seat) => (
                <RoomSeat
                  key={seat.seatNo}
                  seat={seat}
                  readOnly={room.readOnly}
                  isAdmin={isAdmin}
                  busy={busy}
                  onJoin={() => setTarget({ team, seatNo: seat.seatNo })}
                  onLeave={() => void leave()}
                  onRemove={() => void remove(seat)}
                  onEditProfile={() => setEditingProfile(seat)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {target && <JoinPanel roomCode={code} target={target} batraceEnabled={batraceEnabled} onClose={() => setTarget(null)} onJoined={async () => { setTarget(null); await load(); }} />}
      {editingProfile && <ProfileEditor roomCode={code} seat={editingProfile} batraceEnabled={batraceEnabled} onClose={() => setEditingProfile(null)} onSaved={async () => { setEditingProfile(null); await load(); }} />}
    </div>
  );
}

function DialogFrame({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="dialog-backdrop" role="presentation"><section className="dialog" role="dialog" aria-modal="true" aria-label={title}><div className="dialog-title"><h2>{title}</h2><button type="button" aria-label="关闭" onClick={onClose}>×</button></div>{children}</section></div>;
}

function JoinPanel({ roomCode, target, batraceEnabled, onClose, onJoined }: { roomCode: string; target: SeatTarget; batraceEnabled: boolean; onClose: () => void; onJoined: () => Promise<void> }) {
  const [nickname, setNickname] = useState('');
  const [qq, setQQ] = useState('');
  const [profile, setProfile] = useState<PlayerProfileSnapshot | null>(null);
  const [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!privacy) return;
    setBusy(true);
    try {
      await joinRoomSeat({ roomCode, ...target, nickname, qq, batraceId: profile?.batraceId ?? null });
      await onJoined();
    } catch (cause) { setError(toUserMessage(cause)); setBusy(false); }
  }

  return <DialogFrame title={`加入 ${target.team} 队 ${target.seatNo} 号位`} onClose={onClose}><form onSubmit={(event) => void submit(event)}>
    <PlayerLookup enabled={batraceEnabled} nickname={nickname} profile={profile} onNicknameChange={setNickname} onProfileChange={setProfile} search={searchPlayers} loadProfile={loadPlayerProfile} />
    <label>QQ<input required inputMode="numeric" pattern="[0-9]{5,12}" maxLength={12} value={qq} onChange={(event) => setQQ(event.target.value)} /></label>
    <PrivacyConfirmation checked={privacy} onChange={setPrivacy} />
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary-button full-button" type="submit" disabled={!privacy || busy}>{busy ? '正在报名…' : '确认报名'}</button>
  </form></DialogFrame>;
}

function ProfileEditor({ roomCode, seat, batraceEnabled, onClose, onSaved }: { roomCode: string; seat: RoomSeatType; batraceEnabled: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [nickname, setNickname] = useState(seat.nickname ?? '');
  const [profile, setProfile] = useState(seat.profile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try { await updateMyPlayerProfile(roomCode, nickname, profile?.batraceId ?? null); await onSaved(); }
    catch (cause) { setError(toUserMessage(cause)); setBusy(false); }
  }
  return <DialogFrame title="更新我的玩家资料" onClose={onClose}><form onSubmit={(event) => void submit(event)}>
    <PlayerLookup enabled={batraceEnabled} nickname={nickname} profile={profile} onNicknameChange={setNickname} onProfileChange={setProfile} search={searchPlayers} loadProfile={loadPlayerProfile} />
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary-button full-button" type="submit" disabled={busy}>保存玩家资料</button>
  </form></DialogFrame>;
}
