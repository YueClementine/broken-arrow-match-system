import { useEffect, useId, useState } from 'react';
import { PlayerProfileCard } from '../../components/PlayerProfileCard';
import type { PlayerCandidate, PlayerProfileSnapshot } from './profileTransform';

type Props = {
  enabled: boolean;
  nickname: string;
  profile: PlayerProfileSnapshot | null;
  onNicknameChange: (nickname: string) => void;
  onProfileChange: (profile: PlayerProfileSnapshot | null) => void;
  search: (query: string) => Promise<PlayerCandidate[]>;
  loadProfile: (playerId: number) => Promise<PlayerProfileSnapshot>;
  debounceMs?: number;
};

export function PlayerLookup({
  enabled,
  nickname,
  profile,
  onNicknameChange,
  onProfileChange,
  search,
  loadProfile,
  debounceMs = 500,
}: Props) {
  const id = useId();
  const [candidates, setCandidates] = useState<PlayerCandidate[]>([]);
  const [status, setStatus] = useState<'idle' | 'searching' | 'loading' | 'error'>('idle');

  useEffect(() => {
    if (!enabled || profile || nickname.trim().length < 2) {
      setCandidates([]);
      if (status === 'error') setStatus('idle');
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      setStatus('searching');
      try {
        const result = await search(nickname.trim());
        if (!active) return;
        setCandidates(result);
        setStatus('idle');
      } catch {
        if (!active) return;
        setCandidates([]);
        setStatus('error');
      }
    }, debounceMs);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  // status is intentionally excluded: it is output state, not a search input.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounceMs, enabled, nickname, profile, search]);

  async function selectCandidate(candidate: PlayerCandidate) {
    setStatus('loading');
    setCandidates([]);
    try {
      const loaded = await loadProfile(candidate.id);
      onNicknameChange(loaded.canonicalName);
      onProfileChange(loaded);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="player-lookup">
      <label htmlFor={id}>游戏昵称</label>
      <input
        id={id}
        value={nickname}
        maxLength={profile ? 64 : 30}
        autoComplete="nickname"
        placeholder="手填昵称，或搜索 BATrace"
        onChange={(event) => {
          if (profile) onProfileChange(null);
          onNicknameChange(event.target.value);
        }}
      />
      {!enabled && <p className="field-hint">BATrace 资料查询当前关闭，可正常手填昵称。</p>}
      {status === 'searching' && <p className="field-hint" role="status">正在搜索 BATrace…</p>}
      {status === 'loading' && <p className="field-hint" role="status">正在加载裁剪资料…</p>}
      {status === 'error' && <p className="field-error">BATrace 暂时不可用，可继续使用手填昵称。</p>}
      {candidates.length > 0 && (
        <div className="candidate-list" role="listbox" aria-label="BATrace 玩家候选">
          {candidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => void selectCandidate(candidate)}
            >
              <strong>{candidate.name}</strong>
              <span>ELO {candidate.elo} · Lv.{candidate.level ?? '—'} · ID {candidate.id}</span>
            </button>
          ))}
        </div>
      )}
      {profile && (
        <div className="selected-profile">
          <PlayerProfileCard profile={profile} />
          <button type="button" className="text-button" onClick={() => onProfileChange(null)}>
            解除 BATrace 关联
          </button>
        </div>
      )}
    </div>
  );
}
