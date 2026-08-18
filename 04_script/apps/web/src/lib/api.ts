export type User = {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  status: string;
  canBuyTether: boolean;
  canSellTether: boolean;
  createdAt: string;
};

/** Portal session slot — admin and user tokens coexist in one browser. */
export type AuthPortal = 'user' | 'admin';

const TOKEN_USER_KEY = 'tps_token_user';
const TOKEN_ADMIN_KEY = 'tps_token_admin';
const LEGACY_TOKEN_KEY = 'tps_token';
const BROWSER_USER_KEY = 'tps_browser_user_id';

function tokenKey(portal: AuthPortal) {
  return portal === 'admin' ? TOKEN_ADMIN_KEY : TOKEN_USER_KEY;
}

/** Infer portal from current URL (admin routes vs everything else). */
export function resolvePortal(pathname = typeof location !== 'undefined' ? location.pathname : '/'): AuthPortal {
  return pathname.startsWith('/admin') ? 'admin' : 'user';
}

/** One-time migrate legacy single `tps_token` into the matching portal slot. */
export function migrateLegacyToken() {
  const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (!legacy) return;
  // Prefer leaving it in user slot; /me refresh will clear if role mismatches.
  if (!localStorage.getItem(TOKEN_USER_KEY) && !localStorage.getItem(TOKEN_ADMIN_KEY)) {
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
  return role === 'admin' ? 'admin' : 'user';
}

/** Sticky browser-account lock for the **user** portal (admins never locked). */
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

/** Round to 2 decimal places for amounts sent to the API. */
export function round2(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function statusBadge(status: string) {
  if (['active', 'completed', 'received', 'open', 'exchanged', 'both_held'].includes(status)) {
    return 'ok';
  }
  if (
    [
      'pending_approval',
      'awaiting',
      'awaiting_dual_deposit',
      'awaiting_user_deposit',
      'awaiting_admin_payout',
      'settling_onchain',
      'pending',
      'krw_confirmed',
      'usdt_confirmed',
    ].includes(status)
  ) {
    return 'warn';
  }
  return 'bad';
}

/** WebSocket URL for the given portal (separate sockets). */
export function wsUrl(portal: AuthPortal = resolvePortal()) {
  const token = getToken(portal);
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const path = portal === 'admin' ? '/api/ws/admin' : '/api/ws/user';
  return `${proto}://${location.host}${path}?token=${encodeURIComponent(token || '')}`;
}
