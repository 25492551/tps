import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

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

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [error, setError] = useState('');
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    try {
      const user = await login(String(fd.get('email')), String(fd.get('password')));
      nav(user.role === 'admin' ? '/admin' : '/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인 실패');
    }
  }
  return (
    <AuthShell title="로그인">
      <form className="stack" onSubmit={onSubmit}>
        <label>
          이메일
          <input name="email" type="email" required defaultValue="buyer@tps.local" />
        </label>
        <label>
          비밀번호
          <input name="password" type="password" required defaultValue="demo1234" />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit">로그인</button>
        <p style={{ color: 'var(--muted)' }}>
          연동 솔루션 계정으로 이용하세요.
        </p>
      </form>
    </AuthShell>
  );
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
