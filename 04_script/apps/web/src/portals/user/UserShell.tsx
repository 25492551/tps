import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../lib/auth';

export function UserShell() {
  const { user, logout } = useAuth();
  const canBuy = !!user?.canBuyTether;
  const canSell = !!user?.canSellTether;
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          Tether<span>Market</span>
        </div>
        <nav className="nav">
          <NavLink to="/app" end>
            홈
          </NavLink>
          <NavLink to="/app/wallets">테더지갑</NavLink>
          <NavLink to="/app/banks">원화계좌</NavLink>
          {canBuy && <NavLink to="/app/buy">테더 구매</NavLink>}
          {canSell && <NavLink to="/app/sell">테더 판매</NavLink>}
          <NavLink to="/app/transfer">테더 전송</NavLink>
          <NavLink to="/app/trades">내 거래</NavLink>
          <NavLink to="/app/transactions">거래 내역</NavLink>
        </nav>
        <div style={{ marginTop: 'auto', color: 'var(--muted)', fontSize: '0.85rem' }}>
          <div>{user?.displayName}</div>
          <div className={`badge ${user?.status === 'active' ? 'ok' : 'warn'}`}>{user?.status}</div>
          <button className="secondary" style={{ marginTop: '0.75rem', width: '100%' }} onClick={() => logout('user')}>
            로그아웃
          </button>
        </div>
      </aside>
      <main className="main">
        {user?.status === 'pending_approval' && (
          <div className="banner">관리자 승인 대기 중입니다. 승인 전까지 거래·게시가 제한됩니다.</div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
