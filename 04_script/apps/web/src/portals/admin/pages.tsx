import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatKst, formatNum, round2, statusBadge } from '../../lib/api';

export function AdminHome() {
  return (
    <div>
      <h1 className="page-title">관리자</h1>
      <p className="page-sub">가입 승인, OTC 입금 확인·지급, 환율·사이트 설정을 처리합니다.</p>
      <div className="row">
        <Link className="btn" to="/admin/users">
          유저 관리
        </Link>
        <Link className="btn secondary" to="/admin/wallets">
          테더지갑
        </Link>
        <Link className="btn secondary" to="/admin/holds">
          OTC 입금·지급
        </Link>
      </div>
    </div>
  );
}

export function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [createError, setCreateError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [revealed, setRevealed] = useState<{ userId: string; address: string; privateKey: string } | null>(
    null,
  );
  async function load() {
    const data = await api<{ users: any[] }>('/api/admin/users');
    setUsers(data.users);
  }
  useEffect(() => {
    void load().catch((e) => setError(String(e.message)));
  }, []);
  async function act(id: string, action: 'approve' | 'reject' | 'suspend') {
    setError('');
    try {
      await api(`/api/admin/users/${id}/${action}`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '처리 실패');
    }
  }
  async function setPerm(id: string, patch: { canBuyTether?: boolean; canSellTether?: boolean }) {
    setBusyId(id);
    setError('');
    try {
      await api(`/api/admin/users/${id}`, { method: 'PATCH', json: patch });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '권한 변경 실패');
    } finally {
      setBusyId('');
    }
  }
  async function revealKey(id: string) {
    setError('');
    try {
      const data = await api<{ wallet: { address: string; privateKey: string | null } }>(
        `/api/admin/users/${id}/managed-wallet`,
      );
      if (!data.wallet.privateKey) {
        setError('프라이빗 키가 없습니다.');
        return;
      }
      setRevealed({ userId: id, address: data.wallet.address, privateKey: data.wallet.privateKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : '키 조회 실패');
    }
  }
  async function ensureWallet(id: string) {
    setError('');
    try {
      await api(`/api/admin/users/${id}/ensure-managed-wallet`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '지갑 생성 실패');
    }
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setCreateError('');
    try {
      await api('/api/admin/users', {
        method: 'POST',
        json: {
          email: fd.get('email'),
          password: fd.get('password'),
          displayName: fd.get('displayName'),
          status: 'active',
        },
      });
      e.currentTarget.reset();
      setCreateOpen(false);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '생성 실패');
    }
  }
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">유저 관리</h1>
        <div className="page-header-actions">
          <button
            type="button"
            onClick={() => {
              setCreateError('');
              setCreateOpen(true);
            }}
          >
            회원 추가
          </button>
        </div>
      </div>
      <p className="page-sub">
        승인 시 기본 테더 지갑이 발급되며, 프라이빗 키는 관리자만 조회할 수 있습니다. 승인 후에는 거절할 수 없고 정지만 가능합니다.
      </p>
      {error && <p className="error">{error}</p>}
      {revealed && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>관리 지갑 키 공개</h3>
          <p className="setting-desc">화면을 닫으면 다시 숨깁니다. 외부에 공유하지 마세요.</p>
          <div>
            <strong>주소</strong>
            <div>{revealed.address}</div>
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <strong>Private key</strong>
            <div style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>{revealed.privateKey}</div>
          </div>
          <button className="secondary" type="button" style={{ marginTop: '0.75rem' }} onClick={() => setRevealed(null)}>
            숨기기
          </button>
        </div>
      )}
      {createOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-user-title">
            <div className="modal-header">
              <h2 id="create-user-title">회원 추가</h2>
              <button className="secondary modal-close" type="button" onClick={() => setCreateOpen(false)}>
                닫기
              </button>
            </div>
            <p className="modal-desc">즉시 active 상태로 등록됩니다.</p>
            {createError && <p className="error">{createError}</p>}
            <form className="stack" onSubmit={create}>
              <label>
                이름
                <input name="displayName" required autoFocus />
              </label>
              <label>
                이메일
                <input name="email" type="email" required />
              </label>
              <label>
                비밀번호
                <input name="password" required minLength={6} />
              </label>
              <div className="modal-actions">
                <button type="submit">추가</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className="panel table-scroll">
        <table>
          <thead>
            <tr>
              <th>이름</th>
              <th>이메일</th>
              <th>기본 지갑</th>
              <th>상태</th>
              <th>구매</th>
              <th>판매</th>
              <th>액션</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.displayName}</td>
                <td>{u.email}</td>
                <td style={{ maxWidth: 180, wordBreak: 'break-all', fontSize: '0.85rem' }}>
                  {u.role === 'user' ? (
                    u.managedWalletAddress ? (
                      <>
                        <div>{u.managedWalletAddress}</div>
                        <button className="secondary" type="button" onClick={() => void revealKey(u.id)}>
                          키 보기
                        </button>
                      </>
                    ) : (
                      <button className="secondary" type="button" onClick={() => void ensureWallet(u.id)}>
                        지갑 생성
                      </button>
                    )
                  ) : (
                    '-'
                  )}
                </td>
                <td>
                  <span className={`badge ${statusBadge(u.status)}`}>{u.status}</span>
                </td>
                <td>
                  {u.role === 'user' ? (
                    <button
                      type="button"
                      className={`toggle ${u.canBuyTether ? 'on' : ''}`}
                      role="switch"
                      aria-checked={!!u.canBuyTether}
                      disabled={busyId === u.id}
                      onClick={() => void setPerm(u.id, { canBuyTether: !u.canBuyTether })}
                      title="테더 구매 권한"
                    >
                      <span className="toggle-knob" />
                      <span className="toggle-label">{u.canBuyTether ? 'ON' : 'OFF'}</span>
                    </button>
                  ) : (
                    <span className="badge ok">전체</span>
                  )}
                </td>
                <td>
                  {u.role === 'user' ? (
                    <button
                      type="button"
                      className={`toggle ${u.canSellTether ? 'on' : ''}`}
                      role="switch"
                      aria-checked={!!u.canSellTether}
                      disabled={busyId === u.id}
                      onClick={() => void setPerm(u.id, { canSellTether: !u.canSellTether })}
                      title="테더 판매 권한"
                    >
                      <span className="toggle-knob" />
                      <span className="toggle-label">{u.canSellTether ? 'ON' : 'OFF'}</span>
                    </button>
                  ) : (
                    <span className="badge ok">전체</span>
                  )}
                </td>
                <td className="actions-cell">
                  {u.role === 'user' && (
                    <div className="table-actions">
                      {u.status !== 'active' && (
                        <button type="button" onClick={() => act(u.id, 'approve')}>
                          승인
                        </button>
                      )}
                      {u.status === 'pending_approval' && (
                        <button className="secondary" type="button" onClick={() => act(u.id, 'reject')}>
                          거절
                        </button>
                      )}
                      {u.status === 'active' && (
                        <button className="danger" type="button" onClick={() => act(u.id, 'suspend')}>
                          정지
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminHoldsPage() {
  const [data, setData] = useState<{ trades: any[]; holds: any[] }>({ trades: [], holds: [] });
  const [error, setError] = useState('');
  async function load() {
    setData(await api('/api/admin/holds'));
  }
  useEffect(() => {
    void load().catch((e) => setError(String(e.message)));
  }, []);
  async function confirm(id: string, side: 'krw' | 'usdt') {
    try {
      await api(`/api/trades/${id}/deposits/${side}/confirm`, {
        method: 'POST',
        json: { proofNote: 'admin confirmed' },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '확인 실패');
    }
  }
  async function settle(id: string) {
    try {
      await api(`/api/trades/${id}/settle`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '지급 실패');
    }
  }
  async function cancel(id: string) {
    try {
      await api(`/api/trades/${id}/cancel`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '취소 실패');
    }
  }
  function kindLabel(t: any) {
    if (t.kind === 'buy_from_admin') return '구매';
    if (t.kind === 'sell_to_admin') return '판매';
    return t.kind || 'P2P';
  }
  return (
    <div>
      <h1 className="page-title">OTC 입금·지급</h1>
      <p className="page-sub">KRW 확인 시 USDT 잔고 지급. 환전(판매) 확인 시 온체인 정산 후 KRW 지급. 외부 출금만 온체인 전송.</p>
      {error && <p className="error">{error}</p>}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>요청 시각</th>
              <th>유형</th>
              <th>거래</th>
              <th>금액</th>
              <th>KRW</th>
              <th>USDT</th>
              <th>상태</th>
              <th>액션</th>
            </tr>
          </thead>
          <tbody>
            {data.trades.map((t) => (
              <tr key={t.id}>
                <td>{t.created_at ? formatKst(t.created_at) : '—'}</td>
                <td>{kindLabel(t)}</td>
                <td>
                  <Link to={`/app/trades/${t.id}`}>{t.id.slice(0, 8)}…</Link>
                </td>
                <td>
                  {formatNum(t.amount_usdt)} USDT / {formatNum(t.amount_krw)} KRW
                </td>
                <td>
                  <span className={`badge ${statusBadge(t.krw_deposit_status || '-')}`}>
                    {t.krw_deposit_status || '-'}
                  </span>
                </td>
                <td>
                  <span className={`badge ${statusBadge(t.usdt_deposit_status || '-')}`}>
                    {t.usdt_deposit_status || '-'}
                  </span>
                </td>
                <td>
                  <span className={`badge ${statusBadge(t.status)}`}>{t.status}</span>
                </td>
                <td className="actions-cell">
                  <div className="table-actions">
                    {(t.kind === 'buy_from_admin' || !t.kind || t.kind === 'legacy_p2p') &&
                      !['completed', 'cancelled', 'settling_onchain'].includes(t.status) && (
                      <button type="button" onClick={() => confirm(t.id, 'krw')}>
                        KRW 확인·USDT 지급
                      </button>
                    )}
                    {(t.kind === 'sell_to_admin' || !t.kind || t.kind === 'legacy_p2p') &&
                      !['completed', 'cancelled', 'settling_onchain'].includes(t.status) && (
                      <button type="button" onClick={() => confirm(t.id, 'usdt')}>
                        환전 정산·KRW 지급
                      </button>
                    )}
                    {t.kind === 'sell_to_admin' &&
                      (t.status === 'awaiting_admin_payout' || t.status === 'settling_onchain') && (
                      <button type="button" onClick={() => settle(t.id)}>
                        온체인 재시도
                      </button>
                    )}
                    <button className="danger" type="button" onClick={() => cancel(t.id)}>
                      취소/환불
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type RateProvider = {
  id: string;
  name: string;
  siteUrl: string;
  description: string;
  pair: string;
};

type RateQuote = {
  providerId: string;
  rateKrwPerUsdt: number | null;
  fetchedAt: string;
  error?: string;
  rawNote?: string;
};

export function AdminRatesPage() {
  const [providers, setProviders] = useState<RateProvider[]>([]);
  const [quotes, setQuotes] = useState<RateQuote[]>([]);
  const [selected, setSelected] = useState('');
  const [buyFeePercent, setBuyFeePercent] = useState(0);
  const [sellFeePercent, setSellFeePercent] = useState(0);
  const [buyFeeDraft, setBuyFeeDraft] = useState('0');
  const [sellFeeDraft, setSellFeeDraft] = useState('0');
  const [refreshInterval, setRefreshInterval] = useState('1h');
  const [refreshDraft, setRefreshDraft] = useState('1h');
  const [refreshOptions, setRefreshOptions] = useState<
    { id: string; labelKo: string; seconds: number }[]
  >([]);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [feeBusy, setFeeBusy] = useState(false);
  const [intervalBusy, setIntervalBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const d = await api<{
        selectedProviderId: string;
        fxBuyFeePercent: number;
        fxSellFeePercent: number;
        fxRateRefreshInterval: string;
        fxRateSnapshot: { fetchedAt: string } | null;
        refreshIntervals: { id: string; labelKo: string; seconds: number }[];
        providers: RateProvider[];
        quotes: RateQuote[];
      }>('/api/admin/rates');
      setProviders(d.providers);
      setQuotes(d.quotes);
      setSelected(d.selectedProviderId);
      setBuyFeePercent(d.fxBuyFeePercent ?? 0);
      setSellFeePercent(d.fxSellFeePercent ?? 0);
      setBuyFeeDraft(String(d.fxBuyFeePercent ?? 0));
      setSellFeeDraft(String(d.fxSellFeePercent ?? 0));
      setRefreshInterval(d.fxRateRefreshInterval || '1h');
      setRefreshDraft(d.fxRateRefreshInterval || '1h');
      setRefreshOptions(d.refreshIntervals || []);
      setSnapshotAt(d.fxRateSnapshot?.fetchedAt ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function quoteFor(id: string) {
    return quotes.find((q) => q.providerId === id);
  }

  async function refreshOne(id: string) {
    setBusyId(id);
    setError('');
    try {
      const d = await api<{ quote: RateQuote }>(`/api/admin/rates/${id}`);
      setQuotes((prev) => {
        const rest = prev.filter((q) => q.providerId !== id);
        return [...rest, d.quote];
      });
      if (id === selected && d.quote.rateKrwPerUsdt != null) {
        setSnapshotAt(d.quote.fetchedAt);
        setMsg(`선택 소스 현재가 갱신 · ${formatNum(d.quote.rateKrwPerUsdt)} KRW/USDT`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패');
    } finally {
      setBusyId('');
    }
  }

  async function selectProvider(id: string) {
    setBusyId(id);
    setError('');
    setMsg('');
    try {
      const d = await api<{
        selectedProviderId: string;
        fxRateSnapshot: { fetchedAt: string } | null;
        quote: RateQuote;
      }>('/api/admin/rates/select', {
        method: 'POST',
        json: { providerId: id },
      });
      setSelected(d.selectedProviderId);
      setSnapshotAt(d.fxRateSnapshot?.fetchedAt ?? d.quote.fetchedAt);
      setQuotes((prev) => {
        const rest = prev.filter((q) => q.providerId !== id);
        return [...rest, d.quote];
      });
      setMsg(
        `${providers.find((p) => p.id === id)?.name || id} 선택됨 · 현재 ${formatNum(
          d.quote.rateKrwPerUsdt,
        )} KRW/USDT`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '선택 실패');
    } finally {
      setBusyId('');
    }
  }

  async function saveFee(e: FormEvent) {
    e.preventDefault();
    setFeeBusy(true);
    setError('');
    setMsg('');
    try {
      const d = await api<{ fxBuyFeePercent: number; fxSellFeePercent: number }>('/api/admin/rates/fee', {
        method: 'POST',
        json: {
          fxBuyFeePercent: Number(buyFeeDraft),
          fxSellFeePercent: Number(sellFeeDraft),
        },
      });
      setBuyFeePercent(d.fxBuyFeePercent);
      setSellFeePercent(d.fxSellFeePercent);
      setBuyFeeDraft(String(d.fxBuyFeePercent));
      setSellFeeDraft(String(d.fxSellFeePercent));
      setMsg(
        `구매 수수료 ${formatNum(d.fxBuyFeePercent)}% / 판매 수수료 ${formatNum(d.fxSellFeePercent)}% 로 저장되었습니다.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '수수료 저장 실패');
    } finally {
      setFeeBusy(false);
    }
  }

  async function saveInterval(e: FormEvent) {
    e.preventDefault();
    setIntervalBusy(true);
    setError('');
    setMsg('');
    try {
      const d = await api<{ fxRateRefreshInterval: string }>('/api/admin/rates/refresh-interval', {
        method: 'POST',
        json: { interval: refreshDraft },
      });
      setRefreshInterval(d.fxRateRefreshInterval);
      setRefreshDraft(d.fxRateRefreshInterval);
      const label =
        refreshOptions.find((o) => o.id === d.fxRateRefreshInterval)?.labelKo || d.fxRateRefreshInterval;
      setMsg(`업데이트 주기 ${label} 로 저장되었습니다.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '주기 저장 실패');
    } finally {
      setIntervalBusy(false);
    }
  }

  const spot = quoteFor(selected)?.rateKrwPerUsdt;
  const buyRate =
    spot != null ? Math.round(spot * (1 + buyFeePercent / 100) * 100) / 100 : null;
  const sellRate =
    spot != null ? Math.round(spot * (1 - sellFeePercent / 100) * 100) / 100 : null;
  const intervalLabel =
    refreshOptions.find((o) => o.id === refreshInterval)?.labelKo || refreshInterval;

  return (
    <div>
      <h1 className="page-title">환율</h1>
      <p className="page-sub">
        USDT↔KRW 참고 환율 소스와 테더 구매·판매 수수료(%)를 각각 설정합니다. 선택 소스 시세는
        업데이트 주기 동안 재사용됩니다.
      </p>
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>업데이트 주기</h3>
        <form className="row" onSubmit={saveInterval} style={{ alignItems: 'flex-end' }}>
          <label style={{ flex: '0 0 200px' }}>
            OTC 시세 갱신
            <select value={refreshDraft} onChange={(ev) => setRefreshDraft(ev.target.value)}>
              {(refreshOptions.length
                ? refreshOptions
                : [
                    { id: '1h', labelKo: '1시간' },
                    { id: '6h', labelKo: '6시간' },
                    { id: '1d', labelKo: '1일' },
                    { id: '3d', labelKo: '3일' },
                    { id: '1w', labelKo: '1주' },
                  ]
              ).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.labelKo}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={intervalBusy}>
            저장
          </button>
        </form>
        <p className="setting-desc" style={{ marginBottom: 0 }}>
          현재 {intervalLabel}
          {snapshotAt ? ` · 마지막 시세 ${formatKst(snapshotAt)}` : ''}
        </p>
      </div>
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>수수료 (%)</h3>
        <form className="row" onSubmit={saveFee} style={{ alignItems: 'flex-end' }}>
          <label style={{ flex: '0 0 160px' }}>
            테더 구매 수수료
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={buyFeeDraft}
              onChange={(ev) => setBuyFeeDraft(ev.target.value)}
              required
            />
          </label>
          <label style={{ flex: '0 0 160px' }}>
            테더 판매 수수료
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={sellFeeDraft}
              onChange={(ev) => setSellFeeDraft(ev.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={feeBusy}>
            저장
          </button>
        </form>
        <p className="setting-desc" style={{ marginBottom: 0 }}>
          현재 구매 {formatNum(buyFeePercent)}% / 판매 {formatNum(sellFeePercent)}%
          {spot != null && buyRate != null && sellRate != null && (
            <>
              {' '}
              · 선택 소스 기준 구매 {formatNum(buyRate)} / 판매 {formatNum(sellRate)} KRW/USDT
            </>
          )}
        </p>
      </div>
      <div className="row" style={{ marginBottom: '1rem' }}>
        <button type="button" className="secondary" disabled={loading} onClick={() => void load()}>
          전체 새로고침
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {msg && (
        <p className="banner" style={{ color: 'var(--ok)', borderColor: 'rgba(61,207,154,0.35)' }}>
          {msg}
        </p>
      )}
      {loading ? (
        <p>환율을 불러오는 중…</p>
      ) : (
        <div className="rate-grid">
          {providers.map((p) => {
            const q = quoteFor(p.id);
            const active = selected === p.id;
            return (
              <div key={p.id} className={`rate-card ${active ? 'active' : ''}`}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{p.name}</strong>
                  {active && <span className="badge ok">선택됨</span>}
                </div>
                <p className="setting-desc">{p.description}</p>
                <div className="rate-value">
                  {q?.rateKrwPerUsdt != null ? (
                    <>
                      <span className="rate-num">{formatNum(q.rateKrwPerUsdt)}</span>
                      <span className="rate-unit">KRW / USDT</span>
                    </>
                  ) : (
                    <span className="error" style={{ margin: 0 }}>
                      {q?.error || '환율 없음'}
                    </span>
                  )}
                </div>
                {q?.rawNote && <p className="setting-desc">{q.rawNote}</p>}
                <p className="setting-desc">
                  {q?.fetchedAt ? `조회 ${formatKst(q.fetchedAt)} · ${p.pair}` : p.pair}
                </p>
                <div className="row">
                  <a className="btn secondary" href={p.siteUrl} target="_blank" rel="noreferrer">
                    사이트
                  </a>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busyId === p.id}
                    onClick={() => void refreshOne(p.id)}
                  >
                    현재가
                  </button>
                  {!active && (
                    <button
                      type="button"
                      disabled={busyId === p.id || q?.rateKrwPerUsdt == null}
                      onClick={() => void selectProvider(p.id)}
                    >
                      이 소스 선택
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AdminSettingsPage() {
  const [allowMulti, setAllowMulti] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    void api<{ settings: { allowMultiAccountBrowser: boolean } }>('/api/admin/settings')
      .then((d) => {
        setAllowMulti(d.settings.allowMultiAccountBrowser);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e.message));
        setLoading(false);
      });
  }, []);

  async function toggle() {
    const next = !allowMulti;
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const d = await api<{ settings: { allowMultiAccountBrowser: boolean } }>(
        '/api/admin/settings',
        { method: 'PATCH', json: { allowMultiAccountBrowser: next } },
      );
      setAllowMulti(d.settings.allowMultiAccountBrowser);
      setSaved(next ? '중복 로그인이 켜졌습니다.' : '중복 로그인이 꺼졌습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">사이트 설정</h1>
      <p className="page-sub">전체 사이트에 적용되는 운영 옵션입니다.</p>
      {error && <p className="error">{error}</p>}
      {saved && <p className="banner" style={{ color: 'var(--ok)', borderColor: 'rgba(61,207,154,0.35)' }}>{saved}</p>}
      <div className="panel">
        <div className="setting-row">
          <div>
            <div className="setting-title">중복 로그인</div>
            <p className="setting-desc">
              같은 브라우저에서 여러 아이디로 로그인하는 것을 허용합니다. 끄면 한 브라우저에
              하나의 유저 계정만 로그인할 수 있으며, 다른 계정은 로그아웃 후에만 가능합니다.
              (관리자 계정은 예외)
            </p>
          </div>
          <button
            type="button"
            className={`toggle ${allowMulti ? 'on' : ''}`}
            role="switch"
            aria-checked={allowMulti}
            disabled={loading || saving}
            onClick={() => void toggle()}
          >
            <span className="toggle-knob" />
            <span className="toggle-label">{allowMulti ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminTransactionsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [userId, setUserId] = useState('');
  async function load(e?: FormEvent) {
    e?.preventDefault();
    const q = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const data = await api<{ transactions: any[] }>(`/api/admin/transactions${q}`);
    setRows(data.transactions);
  }
  useEffect(() => {
    void load();
  }, []);
  async function adjust(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api('/api/admin/ledger-adjust', {
      method: 'POST',
      json: {
        userId: fd.get('userId'),
        asset: fd.get('asset'),
        direction: fd.get('direction'),
        amount: round2(fd.get('amount')),
        note: fd.get('note'),
      },
    });
    await load();
  }
  return (
    <div>
      <h1 className="page-title">트랜잭션</h1>
      <div className="panel">
        <form className="row" onSubmit={load}>
          <label style={{ flex: 1 }}>
            유저 ID 필터
            <input value={userId} onChange={(e) => setUserId(e.target.value)} />
          </label>
          <button type="submit">조회</button>
        </form>
      </div>
      <div className="panel">
        <h3>수동 조정</h3>
        <form className="stack" onSubmit={adjust}>
          <label>
            유저 ID
            <input name="userId" required />
          </label>
          <div className="row">
            <label>
              자산
              <select name="asset">
                <option value="krw">krw</option>
                <option value="usdt">usdt</option>
              </select>
            </label>
            <label>
              방향
              <select name="direction">
                <option value="credit">credit</option>
                <option value="debit">debit</option>
              </select>
            </label>
            <label>
              금액
              <input name="amount" type="number" step="0.01" required />
            </label>
          </div>
          <label>
            메모
            <input name="note" />
          </label>
          <button type="submit">조정 반영</button>
        </form>
      </div>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>시각</th>
              <th>유저</th>
              <th>자산</th>
              <th>방향</th>
              <th>금액</th>
              <th>잔액</th>
              <th>ref</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>{formatKst(t.created_at)}</td>
                <td>{t.user_id.slice(0, 8)}…</td>
                <td>{t.asset}</td>
                <td>{t.direction}</td>
                <td>{formatNum(t.amount)}</td>
                <td>{formatNum(t.balance_after)}</td>
                <td>{t.ref_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type CustodyWallet = {
  id: string;
  address: string;
  label: string;
  status: string;
  isDefault: boolean;
  hasPrivateKey: boolean;
  createdAt: string;
  balanceUsdt?: number | null;
  balanceFetchedAt?: string | null;
  balanceError?: string | null;
};

type CustodyTransfer = {
  id: string;
  fromWalletId: string;
  toWalletId: string;
  fromAddress: string;
  fromLabel: string;
  toAddress: string;
  toLabel: string;
  amountUsdt: number;
  status: string;
  note: string;
  createdAt: string;
  completedAt: string | null;
};

export function AdminWalletsPage() {
  const [wallets, setWallets] = useState<CustodyWallet[]>([]);
  const [transfers, setTransfers] = useState<CustodyTransfer[]>([]);
  const [totalUsdt, setTotalUsdt] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [revealed, setRevealed] = useState<{ address: string; privateKey: string } | null>(null);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  async function load() {
    const d = await api<{
      wallets: CustodyWallet[];
      transfers: CustodyTransfer[];
      totalUsdt?: number;
    }>('/api/admin/wallets');
    setWallets(d.wallets);
    setTransfers(d.transfers);
    setTotalUsdt(typeof d.totalUsdt === 'number' ? d.totalUsdt : null);
    if (!fromId && d.wallets[0]) setFromId(d.wallets[0].id);
    if (!toId && d.wallets[1]) setToId(d.wallets[1].id);
  }

  useEffect(() => {
    void load().catch((e) => setError(String(e.message)));
  }, []);

  async function createWallet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await api('/api/admin/wallets/create', {
        method: 'POST',
        json: {
          label: fd.get('label') || '관리자 지갑',
          makeDefault: fd.get('makeDefault') === 'on',
        },
      });
      setCreateOpen(false);
      setMsg('지갑을 생성했습니다. 프라이빗 키가 저장되었습니다.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '생성 실패');
    } finally {
      setBusy(false);
    }
  }

  async function registerWallet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const pk = String(fd.get('privateKey') || '').trim();
      await api('/api/admin/wallets/register', {
        method: 'POST',
        json: {
          address: fd.get('address'),
          label: fd.get('label') || '등록 지갑',
          privateKey: pk || undefined,
          makeDefault: fd.get('makeDefault') === 'on',
        },
      });
      setRegisterOpen(false);
      setMsg('지갑을 등록했습니다.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록 실패');
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(id: string) {
    setError('');
    try {
      const d = await api<{ wallets: CustodyWallet[] }>(`/api/admin/wallets/${id}/set-default`, {
        method: 'POST',
      });
      setWallets(d.wallets);
      setMsg('OTC 입금용 기본 지갑으로 설정했습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '설정 실패');
    }
  }

  async function revealKey(id: string) {
    setError('');
    try {
      const d = await api<{ wallet: { address: string; privateKey: string } }>(
        `/api/admin/wallets/${id}/private-key`,
      );
      setRevealed({ address: d.wallet.address, privateKey: d.wallet.privateKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : '키 조회 실패');
    }
  }

  async function submitTransfer(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await api('/api/admin/wallets/transfer', {
        method: 'POST',
        json: {
          fromWalletId: fromId,
          toWalletId: toId,
          amountUsdt: round2(amount),
          note: note.trim() || undefined,
        },
      });
      setAmount('');
      setNote('');
      setMsg('이전 요청을 등록했습니다. 온체인 전송 후 완료 처리하세요.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '이전 실패');
    } finally {
      setBusy(false);
    }
  }

  async function completeTransfer(id: string) {
    try {
      await api(`/api/admin/wallets/transfers/${id}/complete`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '완료 실패');
    }
  }

  async function cancelTransfer(id: string) {
    try {
      await api(`/api/admin/wallets/transfers/${id}/cancel`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '취소 실패');
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">테더지갑</h1>
        <div className="page-header-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setRegisterOpen(true);
            }}
          >
            지갑 등록
          </button>
          <button type="button" onClick={() => setCreateOpen(true)}>
            지갑 생성
          </button>
        </div>
      </div>
      <p className="page-sub">
        관리자 보관(커스터디) TRC-20 지갑입니다. 기본 지갑이 OTC 판매 입금 안내 주소로 사용됩니다. 지갑 간
        이전은 온체인 전송 기록용이며, 전송 후 완료 처리하세요.
      </p>
      {error && <p className="error">{error}</p>}
      {msg && (
        <p className="banner" style={{ color: 'var(--ok)', borderColor: 'rgba(61,207,154,0.35)' }}>
          {msg}
        </p>
      )}
      <div className="panel">
        <div className="page-header" style={{ marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>잔고 (온체인 USDT)</h3>
          <button className="secondary" type="button" disabled={busy} onClick={() => void load()}>
            잔고 새로고침
          </button>
        </div>
        <p className="setting-desc" style={{ marginTop: 0 }}>
          Tron 메인넷 USDT(TRC-20) 잔액입니다. 합계{' '}
          <strong>{totalUsdt != null ? `${formatNum(totalUsdt)} USDT` : '—'}</strong>
        </p>
        <div className="rate-grid">
          {wallets.map((w) => (
            <div key={w.id} className={`rate-card ${w.isDefault ? 'active' : ''}`}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{w.label}</strong>
                {w.isDefault && <span className="badge ok">기본</span>}
              </div>
              <div className="rate-value" style={{ marginTop: '0.5rem' }}>
                {w.balanceUsdt != null ? (
                  <>
                    <span className="rate-num">{formatNum(w.balanceUsdt)}</span>
                    <span className="rate-unit">USDT</span>
                  </>
                ) : (
                  <span className="error" style={{ margin: 0 }}>
                    {w.balanceError || '조회 중…'}
                  </span>
                )}
              </div>
              <p className="setting-desc" style={{ wordBreak: 'break-all', marginBottom: 0 }}>
                {w.address}
                {w.balanceFetchedAt ? ` · ${formatKst(w.balanceFetchedAt)}` : ''}
              </p>
            </div>
          ))}
          {!wallets.length && <p className="setting-desc">등록된 지갑이 없습니다.</p>}
        </div>
      </div>
      {revealed && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>프라이빗 키</h3>
          <p className="setting-desc">외부에 공유하지 마세요.</p>
          <div>
            <strong>주소</strong>
            <div style={{ wordBreak: 'break-all' }}>{revealed.address}</div>
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <strong>Private key</strong>
            <div style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>{revealed.privateKey}</div>
          </div>
          <button className="secondary" type="button" style={{ marginTop: '0.75rem' }} onClick={() => setRevealed(null)}>
            숨기기
          </button>
        </div>
      )}
      <div className="panel table-scroll">
        <table>
          <thead>
            <tr>
              <th>라벨</th>
              <th>주소</th>
              <th>잔고</th>
              <th>키</th>
              <th>상태</th>
              <th>액션</th>
            </tr>
          </thead>
          <tbody>
            {wallets.map((w) => (
              <tr key={w.id}>
                <td>
                  {w.label}{' '}
                  {w.isDefault && <span className="badge ok">기본</span>}
                </td>
                <td style={{ wordBreak: 'break-all', fontSize: '0.85rem' }}>{w.address}</td>
                <td>
                  {w.balanceUsdt != null ? `${formatNum(w.balanceUsdt)} USDT` : w.balanceError || '—'}
                </td>
                <td>{w.hasPrivateKey ? '보관' : '없음'}</td>
                <td>
                  <span className={`badge ${statusBadge(w.status)}`}>{w.status}</span>
                </td>
                <td className="actions-cell">
                  <div className="table-actions">
                    {!w.isDefault && (
                      <button className="secondary" type="button" onClick={() => void setDefault(w.id)}>
                        기본 설정
                      </button>
                    )}
                    {w.hasPrivateKey && (
                      <button className="secondary" type="button" onClick={() => void revealKey(w.id)}>
                        키 보기
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!wallets.length && (
              <tr>
                <td colSpan={6}>등록된 커스터디 지갑이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>지갑 간 이전</h3>
        <p className="setting-desc">
          온체인 USDT 이동을 기록합니다. 실제 전송은 출금 지갑 키로 별도 실행한 뒤 완료 처리하세요.
        </p>
        <form className="stack" onSubmit={submitTransfer}>
          <div className="row">
            <label style={{ flex: 1 }}>
              출금
              <select value={fromId} onChange={(e) => setFromId(e.target.value)} required>
                <option value="">선택</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label} ({w.address.slice(0, 8)}…)
                  </option>
                ))}
              </select>
            </label>
            <label style={{ flex: 1 }}>
              입금
              <select value={toId} onChange={(e) => setToId(e.target.value)} required>
                <option value="">선택</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label} ({w.address.slice(0, 8)}…)
                  </option>
                ))}
              </select>
            </label>
            <label style={{ flex: '0 0 140px' }}>
              수량 (USDT)
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
          </div>
          <label>
            메모
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="선택" />
          </label>
          <button type="submit" disabled={busy || wallets.length < 2}>
            이전 등록
          </button>
        </form>
      </div>

      <div className="panel table-scroll">
        <h3 style={{ marginTop: 0 }}>이전 기록</h3>
        <table>
          <thead>
            <tr>
              <th>시각</th>
              <th>출금</th>
              <th>입금</th>
              <th>수량</th>
              <th>상태</th>
              <th>액션</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((t) => (
              <tr key={t.id}>
                <td>{formatKst(t.createdAt)}</td>
                <td>
                  {t.fromLabel}
                  <div className="setting-desc" style={{ margin: 0 }}>
                    {t.fromAddress.slice(0, 12)}…
                  </div>
                </td>
                <td>
                  {t.toLabel}
                  <div className="setting-desc" style={{ margin: 0 }}>
                    {t.toAddress.slice(0, 12)}…
                  </div>
                </td>
                <td>{formatNum(t.amountUsdt)}</td>
                <td>
                  <span className={`badge ${statusBadge(t.status)}`}>{t.status}</span>
                </td>
                <td className="actions-cell">
                  {t.status === 'pending' && (
                    <div className="table-actions">
                      <button type="button" onClick={() => void completeTransfer(t.id)}>
                        완료
                      </button>
                      <button className="danger" type="button" onClick={() => void cancelTransfer(t.id)}>
                        취소
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!transfers.length && (
              <tr>
                <td colSpan={6}>이전 기록이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <h2>지갑 생성</h2>
              <button className="secondary modal-close" type="button" onClick={() => setCreateOpen(false)}>
                닫기
              </button>
            </div>
            <p className="modal-desc">새 TRC-20 키페어를 만들고 프라이빗 키를 암호화 저장합니다.</p>
            <form className="stack" onSubmit={createWallet}>
              <label>
                라벨
                <input name="label" defaultValue="관리자 지갑" required />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input name="makeDefault" type="checkbox" />
                OTC 기본 입금 지갑으로 설정
              </label>
              <div className="modal-actions">
                <button type="submit" disabled={busy}>
                  생성
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {registerOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <h2>지갑 등록</h2>
              <button className="secondary modal-close" type="button" onClick={() => setRegisterOpen(false)}>
                닫기
              </button>
            </div>
            <p className="modal-desc">기존 TRC-20 주소를 등록합니다. 키가 있으면 함께 저장할 수 있습니다.</p>
            <form className="stack" onSubmit={registerWallet}>
              <label>
                라벨
                <input name="label" defaultValue="등록 지갑" required />
              </label>
              <label>
                주소
                <input name="address" required placeholder="T..." />
              </label>
              <label>
                프라이빗 키 (선택)
                <input name="privateKey" placeholder="hex" autoComplete="off" />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input name="makeDefault" type="checkbox" />
                OTC 기본 입금 지갑으로 설정
              </label>
              <div className="modal-actions">
                <button type="submit" disabled={busy}>
                  등록
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
