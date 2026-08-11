import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useAnonymousSession } from './hooks/useAnonymousSession';
import { CreateRoomPage } from './pages/CreateRoomPage';
import { LobbyPage } from './pages/LobbyPage';
import { RoomPage } from './pages/RoomPage';

export default function App() {
  const session = useAnonymousSession();

  return (
    <HashRouter>
      <AppShell>
        {session.loading ? (
          <div className="state-panel" role="status"><span className="loader" />正在建立匿名会话…</div>
        ) : session.error ? (
          <div className="state-panel error-state">
            <h1>暂时无法连接约战服务</h1>
            <p>请检查网络后刷新页面。你的浏览器只会创建匿名身份，不需要注册账号。</p>
          </div>
        ) : (
          <Routes>
            <Route path="/" element={<LobbyPage />} />
            <Route path="/create" element={<CreateRoomPage />} />
            <Route path="/room/:roomCode" element={<RoomPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </AppShell>
    </HashRouter>
  );
}
