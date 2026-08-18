import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, setToken } from '../lib/api';
import { useAuth } from '../lib/auth';

/** Public: exchange partner handoff token → user JWT → /app/transfer. */
export function HandoffPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = params.get('token');
    const partner = params.get('partner') || 's01';
    if (!token) {
      setError('핸드오프 토큰이 없습니다.');
      return;
    }
    void (async () => {
      try {
        const data = await api<{ token: string }>('/api/auth/handoff', {
          method: 'POST',
          json: { token },
          portal: 'user',
        });
        setToken(data.token, 'user');
        await refresh();
        nav(`/app/transfer?partner=${encodeURIComponent(partner)}`, { replace: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : '연동 로그인 실패');
      }
    })();
  }, [params, nav, refresh]);

  return (
    <div style={{ padding: '2rem', maxWidth: 480, margin: '0 auto' }}>
      <h1>연동 로그인</h1>
      {error ? (
        <>
          <p className="error">{error}</p>
          <p>
            <Link to="/login">로그인</Link>
          </p>
        </>
      ) : (
        <p>솔루션에서 테더 마켓으로 연결 중…</p>
      )}
    </div>
  );
}
