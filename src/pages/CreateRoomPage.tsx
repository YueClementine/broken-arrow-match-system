import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PrivacyConfirmation } from '../components/PrivacyConfirmation';
import { PlayerLookup } from '../features/player-profile/PlayerLookup';
import type { PlayerCandidate, PlayerProfileSnapshot } from '../features/player-profile/profileTransform';
import {
  createRoom,
  getBatraceEnabled,
  loadPlayerProfile,
  searchPlayers,
} from '../lib/api';
import { adminStorageKey } from '../lib/adminToken';
import { beijingInputNowMinimum, beijingInputToIso } from '../lib/beijingTime';
import { toUserMessage } from '../lib/errors';
import type { CreateRoomInput, CreateRoomResult } from '../lib/types';
import type { Team } from '../lib/validation';

export type CreateRoomPageApi = {
  createRoom: (input: CreateRoomInput) => Promise<CreateRoomResult>;
  getBatraceEnabled: () => Promise<boolean>;
  searchPlayers: (query: string) => Promise<PlayerCandidate[]>;
  loadPlayerProfile: (playerId: number) => Promise<PlayerProfileSnapshot>;
};

const defaultApi: CreateRoomPageApi = {
  createRoom,
  getBatraceEnabled,
  searchPlayers,
  loadPlayerProfile,
};

export function CreateRoomPage({ api = defaultApi }: { api?: CreateRoomPageApi }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('今晚 5v5');
  const [startAt, setStartAt] = useState('');
  const [nickname, setNickname] = useState('');
  const [qq, setQQ] = useState('');
  const [note, setNote] = useState('');
  const [team, setTeam] = useState<Team>('A');
  const [seatNo, setSeatNo] = useState(1);
  const [profile, setProfile] = useState<PlayerProfileSnapshot | null>(null);
  const [batraceEnabled, setBatraceEnabled] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void api.getBatraceEnabled().then((enabled) => active && setBatraceEnabled(enabled), () => undefined);
    return () => { active = false; };
  }, [api]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!privacy || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await api.createRoom({
        startAt: beijingInputToIso(startAt), title, hostNickname: nickname,
        hostQQ: qq, note, hostTeam: team, hostSeatNo: seatNo,
        hostBatraceId: profile?.batraceId ?? null,
      });
      sessionStorage.setItem(adminStorageKey(result.roomCode), result.adminToken);
      navigate(`/room/${result.roomCode}`);
    } catch (cause) {
      setError(toUserMessage(cause));
      setSubmitting(false);
    }
  }

  return (
    <div className="page narrow-page">
      <div className="page-title"><p className="eyebrow">CREATE ROOM</p><h1>创建约战</h1><p>房主需要先占一个位置，语音频道会自动安排。</p></div>
      <form className="form-card" onSubmit={(event) => void submit(event)}>
        <label>房间标题<input required maxLength={40} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>开赛时间（北京时间）<input required type="datetime-local" min={beijingInputNowMinimum()} value={startAt} onChange={(event) => setStartAt(event.target.value)} /></label>
        <PlayerLookup
          enabled={batraceEnabled}
          nickname={nickname}
          profile={profile}
          onNicknameChange={setNickname}
          onProfileChange={setProfile}
          search={api.searchPlayers}
          loadProfile={api.loadPlayerProfile}
        />
        <label>QQ<input required inputMode="numeric" pattern="[0-9]{5,12}" maxLength={12} value={qq} onChange={(event) => setQQ(event.target.value)} /></label>
        <fieldset>
          <legend>房主位置</legend>
          <div className="inline-fields">
            <label>队伍<select value={team} onChange={(event) => setTeam(event.target.value as Team)}><option value="A">A 队</option><option value="B">B 队</option></select></label>
            <label>座位<select value={seatNo} onChange={(event) => setSeatNo(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((number) => <option key={number} value={number}>{number} 号位</option>)}</select></label>
          </div>
        </fieldset>
        <label>备注（可选）<textarea maxLength={300} rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="地图、规则、迟到说明…" /></label>
        <PrivacyConfirmation checked={privacy} onChange={setPrivacy} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button full-button" type="submit" disabled={!privacy || submitting}>{submitting ? '正在创建…' : '创建约战'}</button>
      </form>
    </div>
  );
}
