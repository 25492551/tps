import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api, estimateUsdtKrw, formatKrw, formatNum } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ShellLayout } from '../shared/ShellLayout';

const BALANCE_POLL_MS = 15000;

const PERSONAL_PATHS = [
  '/agent/wallets',
  '/agent/me',
  '/agent/buy',
  '/agent/sell',
  '/agent/transfer',
  '/agent/trades',
  '/agent/my-transactions',
];

const SOLUTION_PATHS = ['/agent/transactions', '/agent/members', '/agent/settlements'];

function pathInGroup(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function AgentShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const personalActive = pathInGroup(location.pathname, PERSONAL_PATHS);
  const solutionActive = pathInGroup(location.pathname, SOLUTION_PATHS);
  const [openGroup, setOpenGroup] = useState<'personal' | 'solution' | null>(() => {
    if (solutionActive) return 'solution';
    if (personalActive) return 'personal';
    return null;
  });
  const personalOpen = openGroup === 'personal';
  const solutionOpen = openGroup === 'solution';
  const [usdt, setUsdt] = useState<number | null>(null);
  const [todayDepositKrw, setTodayDepositKrw] = useState<number | null>(null);
  const [sellRate, setSellRate] = useState<number | null>(null);

  useEffect(() => {
    if (personalActive) setOpenGroup('personal');
    else if (solutionActive) setOpenGroup('solution');
  }, [personalActive, solutionActive]);

  useEffect(() => {
    const prev = document.title;
    document.title = 'TPS-agent';
    return () => {
      document.title = prev || 'TPS';
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadTop() {
      try {
        const [w, me, rate] = await Promise.all([
          api<{ balances: { usdt: number; ledgerUsdt?: number } }>('/api/wallets'),
          api<{ todayDepositKrw?: number }>('/api/agent/me', { portal: 'agent' }),
          api<{ rateKrwPerUsdt: number | null }>('/api/orders/rate?side=sell'),
        ]);
        if (cancelled) return;
        setUsdt(w.balances.usdt ?? w.balances.ledgerUsdt ?? 0);
        setTodayDepositKrw(
          typeof me.todayDepositKrw === 'number' && Number.isFinite(me.todayDepositKrw)
            ? me.todayDepositKrw
            : 0,
        );
        setSellRate(
          typeof rate.rateKrwPerUsdt === 'number' && rate.rateKrwPerUsdt > 0
            ? rate.rateKrwPerUsdt
            : null,
        );
      } catch {
        /* ignore */
      }
    }
    void loadTop();
    const id = window.setInterval(() => void loadTop(), BALANCE_POLL_MS);
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
          Agent<span>·TM</span>
        </>
      }
      nav={
        <>
          <NavLink to="/agent" end>
            홈
          </NavLink>
          <div
            className={`nav-group${personalActive ? ' active' : ''}${personalOpen ? ' open' : ''}`}
          >
            <button
              type="button"
              className="nav-group-toggle"
              aria-expanded={personalOpen}
              onClick={() => setOpenGroup((g) => (g === 'personal' ? null : 'personal'))}
            >
              <span>개인 거래</span>
              <span className="nav-group-caret" aria-hidden>
                {personalOpen ? '▾' : '▸'}
              </span>
            </button>
            {personalOpen && (
              <div className="nav-sub">
                <NavLink to="/agent/wallets">테더지갑</NavLink>
                <NavLink to="/agent/me">내 정보</NavLink>
                <NavLink to="/agent/buy">테더 구매</NavLink>
                <NavLink to="/agent/sell">테더 판매</NavLink>
                <NavLink to="/agent/transfer">테더 전송</NavLink>
                <NavLink to="/agent/trades">내 거래</NavLink>
                <NavLink to="/agent/my-transactions">거래 내역</NavLink>
              </div>
            )}
          </div>
          <div
            className={`nav-group${solutionActive ? ' active' : ''}${solutionOpen ? ' open' : ''}`}
          >
            <button
              type="button"
              className="nav-group-toggle"
              aria-expanded={solutionOpen}
              onClick={() => setOpenGroup((g) => (g === 'solution' ? null : 'solution'))}
            >
              <span>솔루션 관리</span>
              <span className="nav-group-caret" aria-hidden>
                {solutionOpen ? '▾' : '▸'}
              </span>
            </button>
            {solutionOpen && (
              <div className="nav-sub">
                <NavLink to="/agent/transactions">솔루션 트랜잭션</NavLink>
                <NavLink to="/agent/members">회원</NavLink>
                <NavLink to="/agent/settlements">정산</NavLink>
              </div>
            )}
          </div>
        </>
      }
      footer={
        <>
          <div>{user?.displayName}</div>
          <div>{user?.email}</div>
          <button
            className="secondary"
            style={{ width: '100%' }}
            onClick={() => logout('agent')}
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
              <Link to="/agent/wallets" className="admin-holds-chip admin-usdt-chip">
                <strong>{usdt != null ? formatNum(usdt) : '—'}</strong>
                <span>
                  USDT
                  {usdtKrw != null ? ` (${formatKrw(usdtKrw)} KRW)` : ''}
                </span>
              </Link>
            </div>
            <div className="admin-topbar-stat">
              <span className="admin-topbar-label">금일 입금</span>
              <Link
                to="/agent/settlements"
                className="admin-holds-chip admin-krw-chip"
                title="오늘(KST) 본인 솔루션 완료 OTC 구매 KRW 합계"
              >
                <strong>{todayDepositKrw != null ? formatKrw(todayDepositKrw) : '—'}</strong>
                <span>KRW</span>
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
