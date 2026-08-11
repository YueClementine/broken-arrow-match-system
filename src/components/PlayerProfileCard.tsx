import type { PlayerProfileSnapshot } from '../features/player-profile/profileTransform';
import { formatBeijingDateTime } from '../lib/beijingTime';

const CATEGORY_NAMES: Record<string, string> = {
  infantry: '步兵',
  vehicles: '载具',
  tanks: '坦克',
  helicopters: '直升机',
  aircrafts: '固定翼',
  artillery: '炮兵',
  support: '支援',
};

function value(value: number | null, suffix = '') {
  return value === null ? '—' : `${value}${suffix}`;
}

export function PlayerProfileCard({ profile }: { profile: PlayerProfileSnapshot }) {
  return (
    <div className="profile-card" data-testid="player-profile">
      <div className="profile-stats" aria-label={`${profile.canonicalName} BATrace 摘要`}>
        <span>ELO {value(profile.elo)}</span>
        <span>Lv.{value(profile.level)}</span>
        <span>近 12 场胜率 {value(profile.recentWinRate, '%')}</span>
        <span>平均 KD {value(profile.recentAverageKd)}</span>
      </div>
      <details>
        <summary>展开 BATrace 资料</summary>
        <dl className="profile-details">
          <div><dt>主力兵种</dt><dd>{profile.primaryCategory ? CATEGORY_NAMES[profile.primaryCategory] ?? profile.primaryCategory : '—'}</dd></div>
          <div><dt>常用单位</dt><dd>{profile.topUnits.length ? profile.topUnits.join(' · ') : '—'}</dd></div>
          <div><dt>有效样本</dt><dd>最近最多 12 个趋势点 / 累计 {profile.matchCount} 场</dd></div>
          <div><dt>抓取时间</dt><dd>{formatBeijingDateTime(profile.fetchedAt)}</dd></div>
        </dl>
        <a
          href={`https://app.batrace.top/player/${profile.batraceId}`}
          target="_blank"
          rel="noreferrer"
        >
          查看 BATrace 原始资料页
        </a>
      </details>
      <p className="data-note">数据来自 BATrace，可能存在数天延迟，仅供参考。</p>
    </div>
  );
}
