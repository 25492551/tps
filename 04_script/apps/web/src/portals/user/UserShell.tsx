import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { api, estimateUsdtKrw, formatKrw, formatNum } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ShellLayout } from '../shared/ShellLayout';

const BALANCE_POLL_MS = 15000;

export function UserShell() {
  const { user, logout } = useAuth();
  const [usdt, setUsdt] = useState<number | null>(null);
  const [sellRate, setSellRate] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadBal() {
      try {
        const [data, rate] = await Promise.all([
          api<{ balances: { usdt: number; ledgerUsdt?: number } }>('/api/wallets'),
          api<{ rateKrwPerUsdt: number | null }>('/api/orders/rate?side=sell'),
        ]);
        if (cancelled) return;
        setUsdt(data.balances.usdt ?? data.balances.ledgerUsdt ?? 0);
        setSellRate(
          typeof rate.rateKrwPerUsdt === 'number' && rate.rateKrwPerUsdt > 0
            ? rate.rateKrwPerUsdt
            : null,
        );
      } catch {
        /* ignore */
      }
    }
    void loadBal();
    const id = window.setInterval(() => void loadBal(), BALANCE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const usdtKrw = estimateUsdtKrw(usdt, sellRate);

  return (
    <ShellLayout
      brand={
        <>
          Tether<span>Market</span>
        </>
      }
      nav={
        <>
          <NavLink to="/app/wallets">테더지갑</NavLink>
          <NavLink to="/app/buy">테더 구매</NavLink>
          <NavLink to="/app/sell">테더 판매</NavLink>
          <NavLink to="/app/transfer">테더 전송</NavLink>
          <NavLink to="/app/trades">내 거래</NavLink>
          <NavLink to="/app/transactions">거래 내역</NavLink>
          <NavLink to="/app/me">내 정보</NavLink>
        </>
      }
      footer={
        <>
          <div className="side-footer-identity">
            <span className="side-footer-id">{user?.email}</span>
            {user?.status ? (
              <span className={`badge ${user.status === 'active' ? 'ok' : 'warn'}`}>
                {user.status}
              </span>
            ) : null}
          </div>
          <button
            className="secondary"
            style={{ width: '100%' }}
            onClick={() => logout('user')}
          >
            로그아웃
          </button>
        </>
      }
      topbar={
        <div className="user-topbar">
          <div className="admin-topbar-left">
            <div className="admin-topbar-stat">
              <span className="admin-topbar-label">보유 테더</span>
              <Link to="/app/wallets" className="admin-holds-chip admin-usdt-chip">
                <strong>{usdt != null ? formatNum(usdt) : '—'}</strong>
                <span>
                  USDT
                  {usdtKrw != null ? ` (${formatKrw(usdtKrw)} KRW)` : ''}
                </span>
              </Link>
            </div>
          </div>
        </div>
      }
    >
      {user?.status === 'pending_approval' && (
        <div className="banner">관리자 승인 대기 중입니다. 승인 전까지 거래·게시가 제한됩니다.</div>
      )}
      <Outlet />
    </ShellLayout>
  );
}
