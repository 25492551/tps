import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, estimateUsdtKrw, formatKst, formatKrw, formatNum, round2, statusBadge } from '../../lib/api';
import {
  ColumnFilterRow,
  TableCount,
  TableHeaderRow,
  filterCols,
  useMultiFilters,
  type FilterFieldDef,
} from '../../lib/tableFilters';

type Portal = 'admin' | 'agent';
type Tab = 'basic' | 'tx' | 'access';

type BankDraft = {
  key: string;
  id?: string;
  bankName: string;
  accountNo: string;
  holderName: string;
  status: 'pending' | 'active' | 'disabled';
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'basic', label: '기본정보' },
  { id: 'tx', label: '머니트랜잭션' },
  { id: 'access', label: '접속기록' },
];

function roleKo(role: string) {
  if (role === 'admin') return '관리자';
  if (role === 'agent') return '에이전트';
  return '회원';
}

function accessEventKo(event: string) {
  if (event === 'handoff') return '솔루션 핸드오프';
  return '로그인';
}

function parseTab(raw: string | null): Tab {
  if (raw === 'tx' || raw === 'access') return raw;
  return 'basic';
}

function banksToDraft(banks: any[]): BankDraft[] {
  return (banks || []).map((b, i) => ({
    key: b.id || `tmp-${i}`,
    id: b.id,
    bankName: String(b.bankName ?? ''),
    accountNo: String(b.accountNo ?? ''),
    holderName: String(b.holderName ?? ''),
    status: (b.status as BankDraft['status']) || 'active',
  }));
}

export function MemberDetailPage({ portal }: { portal: Portal }) {
  const { loginId: rawLoginId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const loginId = decodeURIComponent(rawLoginId || '');
  const tab = parseTab(searchParams.get('tab'));
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<any | null>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [basicMsg, setBasicMsg] = useState('');
  const [basicErr, setBasicErr] = useState('');
  const [basicBusy, setBasicBusy] = useState(false);
  const [bankMsg, setBankMsg] = useState('');
  const [bankErr, setBankErr] = useState('');
  const [bankBusy, setBankBusy] = useState(false);
  const [bankDrafts, setBankDrafts] = useState<BankDraft[]>([]);
  const [ledgerBusy, setLedgerBusy] = useState(false);
  const [ledgerMsg, setLedgerMsg] = useState('');
  const [ledgerErr, setLedgerErr] = useState('');
  const [ledgerForm, setLedgerForm] = useState<null | {
    direction: 'credit' | 'debit';
  }>(null);
  const [ledgerAmount, setLedgerAmount] = useState('');
  const [ledgerNote, setLedgerNote] = useState('');
  const [sellRate, setSellRate] = useState<number | null>(null);

  const canEdit = portal === 'admin';
  const apiBase = portal === 'admin' ? '/api/admin' : '/api/agent';
  const apiOpts = { portal } as const;

  const txFields = useMemo<FilterFieldDef<any>[]>(
    () => [
      { key: 'createdAt', label: '시각', get: (r) => formatKst(r.createdAt) },
      {
        key: 'direction',
        label: '구분',
        type: 'select',
        options: [
          { value: 'credit', label: '입금' },
          { value: 'debit', label: '출금' },
        ],
        get: (r) => String(r.direction ?? ''),
      },
      {
        key: 'amountUsdt',
        label: 'USDT',
        align: 'right',
        get: (r) =>
          String(
            r.amountUsdt != null ? r.amountUsdt : r.asset === 'usdt' ? r.amount ?? '' : '',
          ),
      },
      {
        key: 'amountKrw',
        label: 'KRW',
        align: 'right',
        get: (r) =>
          String(r.amountKrw != null ? r.amountKrw : r.asset === 'krw' ? r.amount ?? '' : ''),
      },
      { key: 'balanceAfter', label: '잔액', align: 'right', get: (r) => String(r.balanceAfter ?? '') },
      { key: 'refType', label: 'ref', get: (r) => String(r.refType ?? '') },
    ],
    [],
  );
  const txFilter = useMultiFilters(txFields, txs);
  const logFields = useMemo<FilterFieldDef<any>[]>(
    () => [
      { key: 'createdAt', label: '시각', get: (r) => formatKst(r.createdAt) },
      { key: 'event', label: '유형', get: (r) => accessEventKo(String(r.event ?? '')) },
      { key: 'ip', label: 'IP', get: (r) => String(r.ip ?? '') },
      { key: 'userAgent', label: 'User-Agent', get: (r) => String(r.userAgent ?? '') },
    ],
    [],
  );
  const logFilter = useMultiFilters(logFields, logs);
  const txCols = filterCols(txFields, [
    'createdAt',
    'direction',
    'amountUsdt',
    'amountKrw',
    'balanceAfter',
    'refType',
  ]);
  const logCols = filterCols(logFields, ['createdAt', 'event', 'ip', 'userAgent']);

  useEffect(() => {
    const prev = document.title;
    document.title = loginId ? `회원 · ${loginId}` : '회원정보';
    return () => {
      document.title = prev || 'TPS';
    };
  }, [loginId]);

  useEffect(() => {
    let cancelled = false;
    void api<{ rateKrwPerUsdt: number | null }>('/api/orders/rate?side=sell')
      .then((rate) => {
        if (cancelled) return;
        setSellRate(
          typeof rate.rateKrwPerUsdt === 'number' && rate.rateKrwPerUsdt > 0
            ? rate.rateKrwPerUsdt
            : null,
        );
      })
      .catch(() => {
        if (!cancelled) setSellRate(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loginId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const enc = encodeURIComponent(loginId);
        if (tab === 'basic') {
          const d = await api<any>(`${apiBase}/members/${enc}`, apiOpts);
          if (!cancelled) {
            setProfile(d);
            setBankDrafts(banksToDraft(d.banks));
            setBasicMsg('');
            setBasicErr('');
            setBankMsg('');
            setBankErr('');
            setLedgerMsg('');
            setLedgerErr('');
            setLedgerForm(null);
          }
        } else if (tab === 'tx') {
          const d = await api<{ transactions: any[] }>(
            `${apiBase}/members/${enc}/transactions`,
            apiOpts,
          );
          if (!cancelled) setTxs(d.transactions);
        } else {
          const d = await api<{ accessLogs: any[] }>(
            `${apiBase}/members/${enc}/access-logs`,
            apiOpts,
          );
          if (!cancelled) setLogs(d.accessLogs);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '로드 실패');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loginId, tab, apiBase, portal]);

  function setTab(next: Tab) {
    if (next === 'basic') setSearchParams({});
    else setSearchParams({ tab: next });
  }

  async function saveBasic(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit || !profile?.user) return;
    setBasicBusy(true);
    setBasicMsg('');
    setBasicErr('');
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get('password') || '').trim();
    const nextLoginId = String(fd.get('loginId') || '').trim();
    try {
      const d = await api<any>(`${apiBase}/members/${encodeURIComponent(loginId)}`, {
        ...apiOpts,
        method: 'PATCH',
        json: {
          loginId: nextLoginId,
          displayName: String(fd.get('displayName') || '').trim(),
          status: String(fd.get('status') || ''),
          canBuyTether: fd.get('canBuyTether') === 'on',
          canSellTether: fd.get('canSellTether') === 'on',
          ...(password ? { password } : {}),
        },
      });
      setProfile(d);
      setBankDrafts(banksToDraft(d.banks));
      setBasicMsg('저장했습니다.');
      if (d.user?.email && d.user.email !== loginId) {
        navigate(`/admin/member/${encodeURIComponent(d.user.email)}`, { replace: true });
      }
    } catch (err) {
      setBasicErr(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setBasicBusy(false);
    }
  }

  async function saveBanks(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit || !profile?.user) return;
    setBankBusy(true);
    setBankMsg('');
    setBankErr('');
    try {
      const d = await api<any>(`${apiBase}/members/${encodeURIComponent(loginId)}/banks`, {
        ...apiOpts,
        method: 'PUT',
        json: {
          banks: bankDrafts.map((b) => ({
            ...(b.id ? { id: b.id } : {}),
            bankName: b.bankName.trim(),
            accountNo: b.accountNo.trim(),
            holderName: b.holderName.trim(),
            status: b.status,
          })),
        },
      });
      setProfile(d);
      setBankDrafts(banksToDraft(d.banks));
      setBankMsg('저장했습니다.');
    } catch (err) {
      setBankErr(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setBankBusy(false);
    }
  }

  function updateBank(key: string, patch: Partial<BankDraft>) {
    setBankDrafts((rows) =>
      rows.map((r) => {
        if (r.key === key) return { ...r, ...patch };
        if (patch.status === 'active' && r.status === 'active') {
          return { ...r, status: 'disabled' };
        }
        return r;
      }),
    );
  }

  function addBank() {
    setBankDrafts((rows) => [
      ...rows.map((r) => (r.status === 'active' ? { ...r, status: 'disabled' as const } : r)),
      {
        key: `new-${Date.now()}`,
        bankName: '',
        accountNo: '',
        holderName: '',
        status: 'active',
      },
    ]);
  }

  function removeBank(key: string) {
    setBankDrafts((rows) => rows.filter((r) => r.key !== key));
  }

  function openLedger(direction: 'credit' | 'debit') {
    setLedgerErr('');
    setLedgerMsg('');
    setLedgerAmount('');
    setLedgerNote('');
    setLedgerForm({ direction });
  }

  async function submitLedger(e: FormEvent) {
    e.preventDefault();
    if (!canEdit || !ledgerForm || !loginId) return;
    const amount = round2(ledgerAmount);
    if (!(amount > 0)) {
      setLedgerErr('금액을 입력하세요.');
      return;
    }
    setLedgerBusy(true);
    setLedgerErr('');
    setLedgerMsg('');
    try {
      await api('/api/admin/ledger-adjust', {
        ...apiOpts,
        method: 'POST',
        json: {
          loginId,
          asset: 'usdt',
          direction: ledgerForm.direction,
          amount,
          note: ledgerNote.trim() || undefined,
        },
      });
      const d = await api<any>(`${apiBase}/members/${encodeURIComponent(loginId)}`, apiOpts);
      setProfile(d);
      setBankDrafts(banksToDraft(d.banks));
      setLedgerForm(null);
      setLedgerMsg(
        `${ledgerForm.direction === 'credit' ? '지급' : '회수'} 완료 · ${formatNum(amount)} USDT`,
      );
    } catch (err) {
      setLedgerErr(err instanceof Error ? err.message : '처리 실패');
    } finally {
      setLedgerBusy(false);
    }
  }

  const u = profile?.user;
  const usdtKrw = estimateUsdtKrw(profile?.balanceUsdt, sellRate);

  return (
    <div className="member-popup">
      <header className="member-popup-head">
        <div>
          <p className="member-popup-kicker">{portal === 'admin' ? '관리자' : '에이전트'} · 회원정보</p>
          <h1 className="member-popup-title">{loginId || '—'}</h1>
          {u?.displayName && <p className="member-popup-sub">{u.displayName}</p>}
        </div>
        <nav className="member-popup-tabs" aria-label="회원 정보 탭">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="member-popup-body">
        {error && <p className="error">{error}</p>}
        {loading && !error && <p className="page-sub">로딩…</p>}

        {!loading && !error && tab === 'basic' && profile && canEdit && (
          <div className="stack">
            <form className="panel" onSubmit={saveBasic}>
              <div className="member-section-head">
                <h2 className="member-section-title">기본</h2>
                <button type="submit" disabled={basicBusy || u.role === 'admin'}>
                  {basicBusy ? '저장 중…' : '저장'}
                </button>
              </div>
              {basicErr && <p className="error">{basicErr}</p>}
              {basicMsg && <p className="ok-msg">{basicMsg}</p>}
              <div className="member-edit-grid">
                <label>
                  아이디
                  <input name="loginId" required defaultValue={u.email} key={`login-${u.email}`} />
                </label>
                <label>
                  이름
                  <input
                    name="displayName"
                    required
                    defaultValue={u.displayName || ''}
                    key={`name-${u.id}-${u.displayName}`}
                  />
                </label>
                <label>
                  상태
                  <select name="status" defaultValue={u.status} key={`status-${u.id}-${u.status}`}>
                    <option value="pending_approval">pending_approval</option>
                    <option value="active">active</option>
                    <option value="suspended">suspended</option>
                    <option value="rejected">rejected</option>
                  </select>
                </label>
                <label>
                  새 비밀번호
                  <input name="password" type="password" minLength={6} placeholder="변경 시에만 입력" />
                </label>
                <label className="member-check">
                  <input
                    name="canBuyTether"
                    type="checkbox"
                    defaultChecked={!!u.canBuyTether}
                    key={`buy-${u.id}-${u.canBuyTether}`}
                  />
                  구매 권한
                </label>
                <label className="member-check">
                  <input
                    name="canSellTether"
                    type="checkbox"
                    defaultChecked={!!u.canSellTether}
                    key={`sell-${u.id}-${u.canSellTether}`}
                  />
                  판매 권한
                </label>
              </div>
              <dl className="member-dl member-dl-readonly">
                <div>
                  <dt>역할</dt>
                  <dd>{roleKo(u.role)}</dd>
                </div>
                <div>
                  <dt>솔루션</dt>
                  <dd>
                    {u.solutionName
                      ? `${u.solutionName}${u.solutionCode ? ` (${u.solutionCode})` : ''}`
                      : '—'}
                  </dd>
                </div>
                {u.externalLoginId != null && String(u.externalLoginId).length > 0 && (
                  <div>
                    <dt>솔루션 아이디</dt>
                    <dd>{u.externalLoginId}</dd>
                  </div>
                )}
                <div>
                  <dt>가입</dt>
                  <dd>{formatKst(u.createdAt)}</dd>
                </div>
                <div>
                  <dt>관리 지갑</dt>
                  <dd style={{ wordBreak: 'break-all' }}>{u.managedWalletAddress || '—'}</dd>
                </div>
              </dl>
            </form>

            <div className="panel">
              <h2 className="member-section-title">잔고</h2>
              {ledgerErr && <p className="error">{ledgerErr}</p>}
              {ledgerMsg && <p className="ok-msg">{ledgerMsg}</p>}
              <div className="stack member-balances">
                <div className="member-balance-row">
                  <div>
                    <strong>{formatNum(profile.balanceUsdt)}</strong>
                    <span>
                      {' '}
                      USDT
                      {usdtKrw != null ? ` (${formatKrw(usdtKrw)} KRW)` : ''}
                    </span>
                  </div>
                  <div className="row member-balance-actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={ledgerBusy}
                      onClick={() => openLedger('credit')}
                    >
                      지급
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={ledgerBusy}
                      onClick={() => openLedger('debit')}
                    >
                      회수
                    </button>
                  </div>
                </div>
              </div>
              {ledgerForm && (
                <form className="stack member-ledger-form" onSubmit={submitLedger}>
                  <p className="setting-desc" style={{ margin: 0 }}>
                    USDT <strong>{ledgerForm.direction === 'credit' ? '지급' : '회수'}</strong>
                  </p>
                  <label>
                    금액
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      autoFocus
                      value={ledgerAmount}
                      onChange={(e) => setLedgerAmount(e.target.value)}
                    />
                  </label>
                  <label>
                    메모
                    <input
                      value={ledgerNote}
                      onChange={(e) => setLedgerNote(e.target.value)}
                      placeholder="선택"
                    />
                  </label>
                  <div className="row" style={{ gap: '0.5rem' }}>
                    <button type="submit" disabled={ledgerBusy}>
                      {ledgerBusy ? '처리 중…' : '확인'}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={ledgerBusy}
                      onClick={() => setLedgerForm(null)}
                    >
                      취소
                    </button>
                  </div>
                </form>
              )}
            </div>

            <form className="panel" onSubmit={saveBanks}>
              <div className="member-section-head">
                <h2 className="member-section-title">원화 계좌</h2>
                <div className="row" style={{ gap: '0.5rem' }}>
                  <button type="button" className="secondary" onClick={addBank}>
                    계좌 추가
                  </button>
                  <button type="submit" disabled={bankBusy}>
                    {bankBusy ? '저장 중…' : '저장'}
                  </button>
                </div>
              </div>
              {bankErr && <p className="error">{bankErr}</p>}
              {bankMsg && <p className="ok-msg">{bankMsg}</p>}
              <p className="page-sub" style={{ marginTop: 0 }}>
                목록에서 뺀 기존 계좌는 저장 시 비활성(disabled) 처리됩니다.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>은행명</th>
                      <th>계좌번호</th>
                      <th>예금주</th>
                      <th>상태</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bankDrafts.map((b) => (
                      <tr key={b.key}>
                        <td>
                          <input
                            value={b.bankName}
                            onChange={(e) => updateBank(b.key, { bankName: e.target.value })}
                            required
                            placeholder="국민은행"
                          />
                        </td>
                        <td>
                          <input
                            value={b.accountNo}
                            onChange={(e) => updateBank(b.key, { accountNo: e.target.value })}
                            required
                          />
                        </td>
                        <td>
                          <input
                            value={b.holderName}
                            onChange={(e) => updateBank(b.key, { holderName: e.target.value })}
                            required
                          />
                        </td>
                        <td>
                          <select
                            value={b.status}
                            onChange={(e) =>
                              updateBank(b.key, {
                                status: e.target.value as BankDraft['status'],
                              })
                            }
                          >
                            <option value="active">active</option>
                            <option value="pending">pending</option>
                            <option value="disabled">disabled</option>
                          </select>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => removeBank(b.key)}
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!bankDrafts.length && (
                      <tr>
                        <td colSpan={5}>등록된 계좌가 없습니다. 「계좌 추가」로 등록하세요.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </form>
          </div>
        )}

        {!loading && !error && tab === 'basic' && profile && !canEdit && (
          <div className="stack">
            <div className="panel">
              <h2 className="member-section-title">기본</h2>
              <dl className="member-dl">
                <div>
                  <dt>아이디</dt>
                  <dd>{u.email}</dd>
                </div>
                <div>
                  <dt>이름</dt>
                  <dd>{u.displayName || '—'}</dd>
                </div>
                <div>
                  <dt>역할</dt>
                  <dd>{roleKo(u.role)}</dd>
                </div>
                <div>
                  <dt>상태</dt>
                  <dd>
                    <span className={`badge ${statusBadge(u.status)}`}>{u.status}</span>
                  </dd>
                </div>
                <div>
                  <dt>솔루션</dt>
                  <dd>
                    {u.solutionName
                      ? `${u.solutionName}${u.solutionCode ? ` (${u.solutionCode})` : ''}`
                      : '—'}
                  </dd>
                </div>
                {u.externalLoginId != null && String(u.externalLoginId).length > 0 && (
                  <div>
                    <dt>솔루션 아이디</dt>
                    <dd>{u.externalLoginId}</dd>
                  </div>
                )}
                <div>
                  <dt>가입</dt>
                  <dd>{formatKst(u.createdAt)}</dd>
                </div>
                <div>
                  <dt>구매 권한</dt>
                  <dd>{u.canBuyTether ? 'ON' : 'OFF'}</dd>
                </div>
                <div>
                  <dt>판매 권한</dt>
                  <dd>{u.canSellTether ? 'ON' : 'OFF'}</dd>
                </div>
              </dl>
            </div>
            <div className="panel">
              <h2 className="member-section-title">잔고</h2>
              <div className="row member-balances">
                <div>
                  <strong>{formatNum(profile.balanceUsdt)}</strong>
                  <span>
                    {' '}
                    USDT
                    {usdtKrw != null ? ` (${formatKrw(usdtKrw)} KRW)` : ''}
                  </span>
                </div>
              </div>
            </div>
            <div className="panel">
              <h2 className="member-section-title">원화 계좌</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>은행</th>
                      <th>계좌번호</th>
                      <th>예금주</th>
                      <th>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(profile.banks || []).map((b: any) => (
                      <tr key={b.id}>
                        <td>
                          {b.bankName}
                        </td>
                        <td>{b.accountNo}</td>
                        <td>{b.holderName}</td>
                        <td>
                          <span className={`badge ${statusBadge(b.status)}`}>{b.status}</span>
                        </td>
                      </tr>
                    ))}
                    {!(profile.banks || []).length && (
                      <tr>
                        <td colSpan={4}>등록된 계좌가 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && tab === 'tx' && (
          <div className="panel table-scroll">
            <TableCount shown={txFilter.shownCount} total={txFilter.totalCount} />
            <table>
              <thead>
                <ColumnFilterRow
                  columns={txCols}
                  values={txFilter.values}
                  onChange={txFilter.setValue}
                />
                <TableHeaderRow columns={txCols} />
              </thead>
              <tbody>
                {txFilter.filtered.map((t) => {
                  const amountUsdt =
                    t.amountUsdt != null
                      ? t.amountUsdt
                      : t.asset === 'usdt'
                        ? t.amount
                        : null;
                  const amountKrw =
                    t.amountKrw != null
                      ? t.amountKrw
                      : t.asset === 'krw'
                        ? t.amount
                        : null;
                  return (
                    <tr key={t.id}>
                      <td>{formatKst(t.createdAt)}</td>
                      <td>
                        {t.direction === 'credit' ? '입금' : '출금'}
                        {t.asset ? ` · ${String(t.asset).toUpperCase()}` : ''}
                      </td>
                      <td className="col-amount">{amountUsdt != null ? formatNum(amountUsdt) : '—'}</td>
                      <td className="col-amount">{amountKrw != null ? formatKrw(amountKrw) : '—'}</td>
                      <td className="col-amount">
                        {t.asset === 'krw' ? formatKrw(t.balanceAfter) : formatNum(t.balanceAfter)}
                        {t.asset ? ` ${String(t.asset).toUpperCase()}` : ''}
                      </td>
                      <td>{t.refType || '—'}</td>
                    </tr>
                  );
                })}
                {!txFilter.filtered.length && (
                  <tr>
                    <td colSpan={6}>
                      {txs.length ? '필터 조건에 맞는 내역이 없습니다.' : '내역이 없습니다.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && tab === 'access' && (
          <div className="panel table-scroll">
            <TableCount shown={logFilter.shownCount} total={logFilter.totalCount} />
            <table>
              <thead>
                <ColumnFilterRow
                  columns={logCols}
                  values={logFilter.values}
                  onChange={logFilter.setValue}
                />
                <TableHeaderRow columns={logCols} />
                </thead>
              <tbody>
                {logFilter.filtered.map((r) => (
                  <tr key={r.id}>
                    <td>{formatKst(r.createdAt)}</td>
                    <td>{accessEventKo(r.event)}</td>
                    <td>{r.ip || '—'}</td>
                    <td style={{ maxWidth: 360, wordBreak: 'break-all', fontSize: '0.85rem' }}>
                      {r.userAgent || '—'}
                    </td>
                  </tr>
                ))}
                {!logFilter.filtered.length && (
                  <tr>
                    <td colSpan={4}>
                      {logs.length
                        ? '필터 조건에 맞는 기록이 없습니다.'
                        : '접속 기록이 없습니다. (이 기능 적용 이후 로그인부터 쌓입니다)'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
