import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatBeijingTimeRange } from '../lib/beijingTime';
import { listLobbyRooms } from '../lib/api';
import { getSupabase } from '../lib/supabase';
import type { LobbyRoom } from '../lib/types';

export function LobbyPage() {
  const [rooms, setRooms] = useState<LobbyRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      setRooms(await listLobbyRooms());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const channel = getSupabase()
      .channel('lobby-room-versions')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'room_change_versions',
      }, () => {
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void load(), 250);
      })
      .subscribe();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      void getSupabase().removeChannel(channel);
    };
  }, [load]);

  return (
    <div className="page lobby-page">
      <section className="hero-panel">
        <p className="eyebrow">TACTICAL ROOM BOARD</p>
        <h1>下一场，缺谁？</h1>
        <p>创建 5v5 房间、锁定位置、自动分配 OOPZ 语音频道。</p>
        <Link to="/create" className="primary-button">创建新约战</Link>
      </section>

      <div className="section-heading">
        <div><p className="eyebrow">UPCOMING</p><h2>未来 7 天</h2></div>
        <button type="button" className="text-button" onClick={() => void load()}>刷新</button>
      </div>

      {loading && <div className="state-panel" role="status">正在读取房间…</div>}
      {error && <div className="state-panel error-state">读取失败，请检查网络后重试。</div>}
      {!loading && !error && rooms.length === 0 && (
        <div className="empty-panel"><strong>还没有约战</strong><span>先开一间，等兄弟们上车。</span></div>
      )}
      <div className="room-list">
        {rooms.map((room) => (
          <Link to={`/room/${room.roomCode}`} className="room-card" key={room.roomCode}>
            <div className="room-card-top">
              <span className="room-code">#{room.roomCode}</span>
              <span className="seat-count">{room.playerCount}/10</span>
            </div>
            <h3>{room.title}</h3>
            <p className="room-time">{formatBeijingTimeRange(room.startAt)} <small>北京时间</small></p>
            <div className="voice-strip">
              <span>OOPZ {String(room.teamAChannel).padStart(3, '0')}</span>
              <i />
              <span>OOPZ {String(room.teamBChannel).padStart(3, '0')}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
