import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link to="/" className="brand" aria-label="断箭约战大厅">
          <span className="brand-mark">BA</span>
          <span><strong>断箭约战</strong><small>5V5 MATCH ROOM</small></span>
        </Link>
        <Link to="/create" className="header-action">＋ 建房</Link>
      </header>
      <main>{children}</main>
      <footer>
        朋友群自用工具 · 比赛时间统一为北京时间<br />
        BATrace 历史数据可能延迟，仅供参考
      </footer>
    </div>
  );
}
