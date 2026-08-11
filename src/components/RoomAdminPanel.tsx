import { useState, type FormEvent } from 'react';
import { adminUpdateRoom, adminCancelRoom } from '../lib/api';
import { beijingInputNowMinimum, beijingInputToIso, isoToBeijingInput } from '../lib/beijingTime';
import { toUserMessage } from '../lib/errors';
import type { RoomDetails } from '../lib/types';

type Props = {
  room: RoomDetails;
  token: string;
  onChanged: () => Promise<void>;
};

export function RoomAdminPanel({ room, token, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(room.title);
  const [startAt, setStartAt] = useState(isoToBeijingInput(room.startAt));
  const [hostNickname, setHostNickname] = useState(room.hostNickname);
  const [hostQQ, setHostQQ] = useState(room.hostQQ);
  const [note, setNote] = useState(room.note);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await adminUpdateRoom({
        roomCode: room.roomCode, adminToken: token,
        startAt: beijingInputToIso(startAt), title, hostNickname, hostQQ, note,
      });
      await onChanged();
      setMessage('房间信息已更新。');
    } catch (error) {
      setMessage(toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyAdminLink() {
    const base = `${window.location.origin}${window.location.pathname}`;
    await navigator.clipboard.writeText(`${base}#/room/${room.roomCode}?admin=${encodeURIComponent(token)}`);
    setMessage('管理链接已复制，只发给可信的人。');
  }

  async function cancel() {
    if (!window.confirm('确认取消这场约战？取消后所有人只能查看，不能再报名。')) return;
    setBusy(true);
    try {
      await adminCancelRoom(room.roomCode, token);
      await onChanged();
    } catch (error) {
      setMessage(toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-panel">
      <button type="button" className="admin-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        房主管理 <span>{open ? '收起' : '展开'}</span>
      </button>
      {open && (
        <div className="admin-content">
          <button type="button" className="secondary-button full-button" onClick={() => void copyAdminLink()}>复制管理链接</button>
          <form onSubmit={(event) => void save(event)}>
            <label>房间标题<input required maxLength={40} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
            <label>开赛时间（北京时间）<input required type="datetime-local" min={beijingInputNowMinimum()} value={startAt} onChange={(event) => setStartAt(event.target.value)} /></label>
            <label>房主昵称<input required maxLength={64} value={hostNickname} onChange={(event) => setHostNickname(event.target.value)} /></label>
            <label>房主 QQ<input required inputMode="numeric" pattern="[0-9]{5,12}" value={hostQQ} onChange={(event) => setHostQQ(event.target.value)} /></label>
            <label>备注<textarea rows={3} maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} /></label>
            <button type="submit" className="primary-button full-button" disabled={busy}>保存修改</button>
          </form>
          {message && <p className="field-hint" role="status">{message}</p>}
          <button type="button" className="danger-button full-button" onClick={() => void cancel()} disabled={busy}>取消整场约战</button>
        </div>
      )}
    </section>
  );
}
