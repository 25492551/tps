import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api, homePathForRole } from '../lib/api';

function AuthShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="landing">
      <div className="hero" style={{ width: 'min(420px, 100%)' }}>
        <Link to="/" className="brand">
          Tether<span>Market</span>
        </Link>
        <h1 style={{ marginTop: '1.2rem' }}>{title}</h1>
        {children}
      </div>
    </div>
  );
}

function CaptchaFields({
  captchaSvg,
  captchaBusy,
  onRefresh,
}: {
  captchaSvg: string;
  captchaBusy: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="captcha-field">
      <span className="captcha-label">자동 접속 방지 문자</span>
      <div className="captcha-row">
        <div
          className="captcha-image"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: captchaSvg || '' }}
        />
        <button
          type="button"
          className="secondary"
          disabled={captchaBusy}
          onClick={onRefresh}
          title="새로고침"
        >
          새로고침
        </button>
      </div>
      <input
        name="captchaAnswer"
        type="text"
        autoComplete="off"
        inputMode="text"
        required
        maxLength={8}
        placeholder="위 문자 입력"
        aria-label="자동 접속 방지 문자 입력"
      />
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    try {
      const user = await login(String(fd.get('loginId')), String(fd.get('password')));
      nav(homePathForRole(user.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인 실패');
    }
  }
  return (
    <AuthShell title="로그인">
      <form className="stack" onSubmit={onSubmit}>
        <label>
          아이디
          <input name="loginId" type="text" autoComplete="username" required defaultValue="buyer" />
        </label>
        <label>
          비밀번호
          <input name="password" type="password" required defaultValue="demo1234" />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit">로그인</button>
      </form>
    </AuthShell>
  );
}

/** Admin login: credentials + captcha on one form. */
export function AdminLoginPage() {
  const { loginAdmin } = useAuth();
  const nav = useNavigate();
  const [error, setError] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaSvg, setCaptchaSvg] = useState('');
  const [captchaBusy, setCaptchaBusy] = useState(false);

  const loadCaptcha = useCallback(async () => {
    setCaptchaBusy(true);
    try {
      const d = await api<{ id: string; imageSvg: string }>('/api/auth/captcha');
      setCaptchaId(d.id);
      setCaptchaSvg(d.imageSvg);
    } catch (err) {
      setError(err instanceof Error ? err.message : '자동 접속 방지 문자를 불러오지 못했습니다.');
    } finally {
      setCaptchaBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadCaptcha();
  }, [loadCaptcha]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      const user = await loginAdmin(
        String(fd.get('loginId')),
        String(fd.get('password')),
        captchaId,
        String(fd.get('captchaAnswer') || ''),
      );
      nav(homePathForRole(user.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인 실패');
      const input = form.elements.namedItem('captchaAnswer');
      if (input instanceof HTMLInputElement) input.value = '';
      void loadCaptcha();
    }
  }

  return (
    <AuthShell title="관리자 로그인">
      <p className="page-sub" style={{ marginTop: 0 }}>
        관리자 계정은 자동 접속 방지 문자를 함께 입력해야 합니다.
      </p>
      <form className="stack" onSubmit={onSubmit}>
        <label>
          아이디
          <input name="loginId" type="text" autoComplete="username" required defaultValue="admin" />
        </label>
        <label>
          비밀번호
          <input name="password" type="password" required defaultValue="admin123" />
        </label>
        <CaptchaFields
          captchaSvg={captchaSvg}
          captchaBusy={captchaBusy}
          onRefresh={() => void loadCaptcha()}
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={!captchaId || captchaBusy}>
          로그인
        </button>
        <p>
          <Link to="/login">← 회원 로그인</Link>
        </p>
      </form>
    </AuthShell>
  );
}

/** Old two-step captcha URL. */
export function LoginCaptchaPage() {
  return <Navigate to="/admin-login" replace />;
}

export function RegisterPage() {
  return (
    <AuthShell title="회원가입">
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        공개 회원가입은 종료되었습니다. S01 등 연동 솔루션에서 이용해 주세요.
      </p>
      <p>
        <Link to="/login">로그인</Link>
      </p>
    </AuthShell>
  );
}
