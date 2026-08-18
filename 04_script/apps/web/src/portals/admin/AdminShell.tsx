import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../lib/auth';

export function AdminShell() {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          Admin<span>·TM</span>
        </div>
        <nav className="nav">
          <NavLink to="/admin" end>
            대시보드
          </NavLink>
          <NavLink to="/admin/users">유저 관리</NavLink>
          <NavLink to="/admin/wallets">테더지갑</NavLink>
          <NavLink to="/admin/holds">OTC 입금·지급</NavLink>
          <NavLink to="/admin/transactions">트랜잭션</NavLink>
          <NavLink to="/admin/rates">환율</NavLink>
          <NavLink to="/admin/settings">사이트 설정</NavLink>
        </nav>
        <div style={{ marginTop: 'auto', color: 'var(--muted)', fontSize: '0.85rem' }}>
          <div>{user?.email}</div>
          <button className="secondary" style={{ marginTop: '0.75rem', width: '100%' }} onClick={() => logout('admin')}>
            로그아웃
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
