import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api, estimateUsdtKrw, formatKrw, formatNum } from '../../lib/api';
import {
  loadAdminNotifyPrefs,
  playAdminNotifyAlert,
  unlockAdminNotifyAudio,
} from '../../lib/adminNotify';
import { useAuth } from '../../lib/auth';
import { ShellLayout } from '../shared/ShellLayout';

const POLL_MS = 8000;

const AGENT_MGMT_PATHS = [
  '/admin/agent-fees',
  '/admin/agent-tree',
  '/admin/agent-stats',
  '/admin/agent-settlements',
];

export function AdminShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const agentSectionActive = AGENT_MGMT_PATHS.some(
    (p) => location.pathname === p || location.pathname.startsWith(`${p}/`),
  );
  const [agentNavOpen, setAgentNavOpen] = useState(agentSectionActive);
  const [pendingCount, setPendingCount] = useState(0);
  const [custodyUsdt, setCustodyUsdt] = useState<number | null>(null);
  const [sellRate, setSellRate] = useState<number | null>(null);
  const [todayDepositKrw, setTodayDepositKrw] = useState<number | null>(null);
  const [todayPlatformFeeKrw, setTodayPlatformFeeKrw] = useState<number | null>(null);
  const [pulse, setPulse] = useState(false);
  const baselineRef = useRef<{ newest: string | null; count: number; ready: boolean }>({
    newest: null,
    count: 0,
    ready: false,
  });
  const pulseTimer = useRef<number | null>(null);

  useEffect(() => {
    if (agentSectionActive) setAgentNavOpen(true);
  }, [agentSectionActive]);

  useEffect(() => {
    const prev = document.title;
    document.title = 'TPS-admin';
    return () => {
      document.title = prev || 'TPS';
    };
  }, []);

  useEffect(() => {
    const unlock = () => unlockAdminNotifyAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const onNewRequest = useCallback(() => {
    setPulse(true);
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setPulse(false), 4000);
    if (loadAdminNotifyPrefs().enabled) {
      void playAdminNotifyAlert();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const [d, rate] = await Promise.all([
          api<{
            pendingCount: number;
            newestCreatedAt: string | null;
            custodyUsdtTotal?: number | null;
            todayDepositKrw?: number | null;
            todayPlatformFeeKrw?: number | null;
          }>('/api/admin/holds/pending'),
          api<{ rateKrwPerUsdt: number | null }>('/api/orders/rate?side=sell'),
        ]);
        if (cancelled) return;
        setPendingCount(d.pendingCount);
        if (typeof d.custodyUsdtTotal === 'number' && Number.isFinite(d.custodyUsdtTotal)) {
          setCustodyUsdt(d.custodyUsdtTotal);
        }
        setSellRate(
          typeof rate.rateKrwPerUsdt === 'number' && rate.rateKrwPerUsdt > 0
            ? rate.rateKrwPerUsdt
            : null,
        );
        if (typeof d.todayDepositKrw === 'number' && Number.isFinite(d.todayDepositKrw)) {
          setTodayDepositKrw(d.todayDepositKrw);
        }
        if (typeof d.todayPlatformFeeKrw === 'number' && Number.isFinite(d.todayPlatformFeeKrw)) {
          setTodayPlatformFeeKrw(d.todayPlatformFeeKrw);
        }
        const newest =
          d.newestCreatedAt != null ? new Date(d.newestCreatedAt).toISOString() : null;
        if (!baselineRef.current.ready) {
          baselineRef.current = { newest, count: d.pendingCount, ready: true };
          return;
        }
        const isNewer =
          !!newest && (!baselineRef.current.newest || newest > baselineRef.current.newest);
        const countUp = d.pendingCount > baselineRef.current.count;
        baselineRef.current = {
          newest: newest ?? baselineRef.current.newest,
          count: d.pendingCount,
          ready: true,
        };
        if (isNewer || countUp) onNewRequest();
      } catch {
        /* ignore transient poll errors */
      }
    }
    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    };
  }, [onNewRequest]);

  const custodyKrw = estimateUsdtKrw(custodyUsdt, sellRate);

  return (
    <ShellLayout
      brand={
        <>
          Admin<span>·TM</span>
        </>
      }
      nav={
        <>
          <NavLink to="/admin" end>
            대시보드
          </NavLink>
          <NavLink to="/admin/users">유저 관리</NavLink>
          <NavLink to="/admin/bank-requests">계좌 변경 승인</NavLink>
          <NavLink to="/admin/wallets">테더지갑</NavLink>
          <NavLink to="/admin/holds">
            OTC 입금·지급
            {pendingCount > 0 ? (
              <span className="nav-badge" aria-hidden>
                {pendingCount}
              </span>
            ) : null}
          </NavLink>
          <NavLink to="/admin/transactions">트랜잭션</NavLink>
          <div className={`nav-group${agentSectionActive ? ' active' : ''}${agentNavOpen ? ' open' : ''}`}>
            <button
              type="button"
              className="nav-group-toggle"
              aria-expanded={agentNavOpen}
              onClick={() => setAgentNavOpen((v) => !v)}
            >
              <span>에이전트 관리</span>
              <span className="nav-group-caret" aria-hidden>
                {agentNavOpen ? '▾' : '▸'}
              </span>
            </button>
            {agentNavOpen && (
              <div className="nav-sub">
                <NavLink to="/admin/agent-fees">수수료</NavLink>
                <NavLink to="/admin/agent-tree">트리</NavLink>
                <NavLink to="/admin/agent-stats">통계</NavLink>
                <NavLink to="/admin/agent-settlements">정산</NavLink>
              </div>
            )}
          </div>
          <NavLink to="/admin/rates">환율</NavLink>
          <NavLink to="/admin/api-guide">API 안내</NavLink>
          <NavLink to="/admin/solution-keys">API 키 관리</NavLink>
          <NavLink to="/admin/settings">사이트 설정</NavLink>
        </>
      }
      footer={
        <>
          <div>{user?.email}</div>
          <button
            className="secondary"
            style={{ width: '100%' }}
            onClick={() => logout('admin')}
          >
            로그아웃
          </button>
        </>
      }
      topbar={
        <div className={`admin-topbar${pulse ? ' admin-topbar--pulse' : ''}`}>
          <div className="admin-topbar-left">
            <div className="admin-topbar-stat">
              <span className="admin-topbar-label">승인 대기</span>
              <Link
                to="/admin/holds"
                className={`admin-holds-chip${pendingCount > 0 ? ' has-pending' : ''}`}
              >
                <strong>{pendingCount}</strong>
                <span>건</span>
              </Link>
            </div>
            <div className="admin-topbar-stat">
              <span className="admin-topbar-label">보유 테더</span>
              <Link to="/admin/wallets" className="admin-holds-chip admin-usdt-chip">
                <strong>{custodyUsdt != null ? formatNum(custodyUsdt) : '—'}</strong>
                <span>
                  USDT
                  {custodyKrw != null ? ` (${formatKrw(custodyKrw)} KRW)` : ''}
                </span>
              </Link>
            </div>
            <div className="admin-topbar-stat">
              <span className="admin-topbar-label">금일 입금</span>
              <Link
                to="/admin/holds"
                className="admin-holds-chip admin-krw-chip"
                title="오늘(KST) 완료된 OTC 구매 KRW 합계"
              >
                <strong>{todayDepositKrw != null ? formatKrw(todayDepositKrw) : '—'}</strong>
                <span>KRW</span>
              </Link>
            </div>
            <div className="admin-topbar-stat">
              <span className="admin-topbar-label">수익</span>
              <Link
                to="/admin/agent-fees"
                className="admin-holds-chip admin-fee-chip"
                title="오늘(KST) 솔루션별 플랫폼 수수료 합계"
              >
                <strong>{todayPlatformFeeKrw != null ? formatKrw(todayPlatformFeeKrw) : '—'}</strong>
                <span>KRW</span>
              </Link>
            </div>
          </div>
        </div>
      }
    >
      <Outlet />
    </ShellLayout>
  );
}
