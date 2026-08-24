export type User = {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'agent' | 'member';
  status: string;
  canBuyTether: boolean;
  canSellTether: boolean;
  createdAt: string;
  partnerId?: string | null;
  partnerCode?: string | null;
  partnerName?: string | null;
};

/** Portal session slots — admin / agent / member can coexist in one browser. */
export type AuthPortal = 'user' | 'admin' | 'agent';

const TOKEN_USER_KEY = 'tps_token_user';
const TOKEN_ADMIN_KEY = 'tps_token_admin';
const TOKEN_AGENT_KEY = 'tps_token_agent';
const LEGACY_TOKEN_KEY = 'tps_token';
const BROWSER_USER_KEY = 'tps_browser_user_id';

function tokenKey(portal: AuthPortal) {
  if (portal === 'admin') return TOKEN_ADMIN_KEY;
  if (portal === 'agent') return TOKEN_AGENT_KEY;
  return TOKEN_USER_KEY;
}

/** Infer portal from current URL. */
export function resolvePortal(pathname = typeof location !== 'undefined' ? location.pathname : '/'): AuthPortal {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin';
  if (pathname === '/agent' || pathname.startsWith('/agent/')) return 'agent';
  return 'user';
}

/** One-time migrate legacy single `tps_token` into the matching portal slot. */
export function migrateLegacyToken() {
  const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (!legacy) return;
  if (
    !localStorage.getItem(TOKEN_USER_KEY) &&
    !localStorage.getItem(TOKEN_ADMIN_KEY) &&
    !localStorage.getItem(TOKEN_AGENT_KEY)
  ) {
    localStorage.setItem(TOKEN_USER_KEY, legacy);
  }
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export function getToken(portal?: AuthPortal) {
  const p = portal ?? resolvePortal();
  return localStorage.getItem(tokenKey(p));
}

export function setToken(token: string | null, portal: AuthPortal) {
  const key = tokenKey(portal);
  if (token) localStorage.setItem(key, token);
  else localStorage.removeItem(key);
}

export function portalForRole(role: User['role']): AuthPortal {
  if (role === 'admin') return 'admin';
  if (role === 'agent') return 'agent';
  return 'user';
}

export function homePathForRole(role: User['role']): string {
  if (role === 'admin') return '/admin';
  if (role === 'agent') return '/agent';
  return '/app/wallets';
}

/** Sticky browser-account lock for the **user** portal (admins/agents never locked). */
export function getBrowserUserId() {
  return localStorage.getItem(BROWSER_USER_KEY);
}

export function setBrowserUserId(userId: string | null) {
  if (userId) localStorage.setItem(BROWSER_USER_KEY, userId);
  else localStorage.removeItem(BROWSER_USER_KEY);
}

export async function api<T = unknown>(
  path: string,
  opts: RequestInit & { json?: unknown; portal?: AuthPortal } = {},
): Promise<T> {
  const { json, portal, ...rest } = opts;
  const headers = new Headers(rest.headers);
  if (json !== undefined) headers.set('Content-Type', 'application/json');
  const token = getToken(portal);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(path, {
    ...rest,
    headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: unknown }).error;
    const msg =
      typeof err === 'string'
        ? err
        : err && typeof err === 'object' && 'formErrors' in err
          ? String((err as { formErrors?: string[] }).formErrors?.[0] || res.statusText)
          : res.statusText;
    throw new Error(msg);
  }
  return data as T;
}

export function formatKst(iso: string | Date) {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

/** Site-wide numeric display: up to / exactly 2 decimal places (ko-KR). */
export function formatNum(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Whole-won KRW display (no fraction). */
export function formatKrw(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('ko-KR');
}

/** Whole-won KRW estimate from USDT × sell-side spot (floor). */
export function estimateUsdtKrw(usdt: number | null | undefined, rateKrwPerUsdt: number | null | undefined): number | null {
  if (usdt == null || !Number.isFinite(usdt)) return null;
  if (rateKrwPerUsdt == null || !(rateKrwPerUsdt > 0)) return null;
  return Math.floor(usdt * rateKrwPerUsdt + 1e-9);
}

/** Round to 2 decimal places for amounts sent to the API. */
export function round2(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Floor to 2 decimal places (OTC buy USDT). */
export function floor2(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n * 100 + 1e-9) / 100;
}

export function statusBadge(status: string) {
  if (['active', 'completed', 'received', 'open', 'exchanged', 'both_held', 'approved', 'member'].includes(status)) {
    return 'ok';
  }
  if (
    [
      'pending',
      'pending_approval',
      'awaiting_user_deposit',
      'awaiting_admin_payout',
      'settling_onchain',
      'agent',
    ].includes(status)
  ) {
    return 'warn';
  }
  return 'danger';
}

export function wsUrl(portal: AuthPortal = resolvePortal()) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const path = portal === 'admin' ? '/api/ws/admin' : '/api/ws/user';
  const token = getToken(portal);
  return `${proto}://${location.host}${path}?token=${encodeURIComponent(token || '')}`;
}
