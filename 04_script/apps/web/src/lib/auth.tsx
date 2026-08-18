import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import {
  api,
  getBrowserUserId,
  getToken,
  migrateLegacyToken,
  portalForRole,
  resolvePortal,
  setBrowserUserId,
  setToken,
  type AuthPortal,
  type User,
} from './api';

type AuthCtx = {
  /** Session for the current URL portal (`/admin` → admin, else user). */
  user: User | null;
  userSession: User | null;
  adminSession: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string, displayName?: string) => Promise<User>;
  /** Clears only the current portal session (or the given portal). */
  logout: (portal?: AuthPortal) => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

async function loadPortalSession(portal: AuthPortal): Promise<User | null> {
  if (!getToken(portal)) return null;
  try {
    const data = await api<{ user: User }>('/api/auth/me', { portal });
    if (portalForRole(data.user.role) !== portal) {
      setToken(null, portal);
      return null;
    }
    return data.user;
  } catch {
    setToken(null, portal);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [userSession, setUserSession] = useState<User | null>(null);
  const [adminSession, setAdminSession] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    migrateLegacyToken();
    const [u, a] = await Promise.all([loadPortalSession('user'), loadPortalSession('admin')]);
    setUserSession(u);
    setAdminSession(a);
    if (u) setBrowserUserId(u.id);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function login(email: string, password: string) {
    const data = await api<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      portal: 'user',
      json: { email, password, browserUserId: getBrowserUserId() || undefined },
    });
    const portal = portalForRole(data.user.role);
    setToken(data.token, portal);
    if (portal === 'admin') {
      setAdminSession(data.user);
    } else {
      setUserSession(data.user);
      setBrowserUserId(data.user.id);
    }
    return data.user;
  }

  async function register(email: string, password: string, displayName?: string) {
    const data = await api<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      portal: 'user',
      json: {
        email,
        password,
        displayName,
        browserUserId: getBrowserUserId() || undefined,
      },
    });
    setToken(data.token, 'user');
    setUserSession(data.user);
    setBrowserUserId(data.user.id);
    return data.user;
  }

  function logout(portal?: AuthPortal) {
    const p = portal ?? resolvePortal(location.pathname);
    setToken(null, p);
    if (p === 'admin') {
      setAdminSession(null);
    } else {
      setUserSession(null);
      setBrowserUserId(null);
    }
  }

  const portal = resolvePortal(location.pathname);
  const user = portal === 'admin' ? adminSession : userSession;

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      userSession,
      adminSession,
      loading,
      login,
      register,
      logout,
      refresh,
    }),
    [user, userSession, adminSession, loading, refresh, location.pathname],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
