import type { RoomSeat as RoomSeatType } from '../lib/types';
import { PlayerProfileCard } from './PlayerProfileCard';

type Props = {
  seat: RoomSeatType;
  readOnly: boolean;
  isAdmin: boolean;
  busy: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onRemove: () => void;
  onEditProfile: () => void;
};

export function RoomSeat({ seat, readOnly, isAdmin, busy, onJoin, onLeave, onRemove, onEditProfile }: Props) {
  if (!seat.nickname) {
    return (
      <div className="seat-card empty-seat">
        <span className="seat-number">{seat.seatNo.toString().padStart(2, '0')}</span>
        <span>空位</span>
        {!readOnly && <button type="button" onClick={onJoin} disabled={busy}>占这个位置</button>}
      </div>
    );
  }

  return (
    <article className={`seat-card occupied-seat${seat.isMine ? ' my-seat' : ''}`}>
      <div className="seat-header">
        <span className="seat-number">{seat.seatNo.toString().padStart(2, '0')}</span>
        <div><h3>{seat.nickname}</h3><p>QQ {seat.qq}</p></div>
        {seat.isMine && <span className="mine-badge">我的位置</span>}
      </div>
      {seat.profile && <PlayerProfileCard profile={seat.profile} />}
      {!readOnly && (
        <div className="seat-actions">
          {seat.isMine && <button type="button" className="text-button" onClick={onEditProfile}>更新资料</button>}
          {seat.isMine && <button type="button" className="danger-text" onClick={onLeave} disabled={busy}>退出房间</button>}
          {isAdmin && <button type="button" className="danger-text" onClick={onRemove} disabled={busy}>移出玩家</button>}
        </div>
      )}
    </article>
  );
}
