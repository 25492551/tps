import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, estimateUsdtKrw, floor2, formatKst, formatKrw, formatNum, round2, statusBadge } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { usePortalBase } from '../../lib/portalBase';
import {
  TableCount,
  ColumnFilterRow,
  TableHeaderRow,
  filterCols,
  useMultiFilters,
  type FilterFieldDef,
} from '../../lib/tableFilters';

export function WalletsPage() {
  const base = usePortalBase();
  const [balances, setBalances] = useState<{ usdt: number } | null>(null);
  const [hasWallet, setHasWallet] = useState(false);
  const [error, setError] = useState('');
  const { rate } = useSpotRate('sell');
  async function load() {
    const data = await api<{
      wallets: any[];
      balances: { usdt: number; ledgerUsdt?: number };
    }>('/api/wallets');
    setHasWallet(data.wallets.length > 0);
    setBalances({
      usdt: data.balances.usdt ?? data.balances.ledgerUsdt ?? 0,
    });
  }
  useEffect(() => {
    void load().catch((e) => setError(String(e.message)));
  }, []);
  const krwEst =
    balances != null && rate != null && rate > 0
      ? Math.floor(balances.usdt * rate + 1e-9)
      : null;
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">테더지갑</h1>
        <div className="page-header-actions">
          <button className="secondary" type="button" onClick={() => void load()}>
            잔고 새로고침
          </button>
        </div>
      </div>
      <p className="page-sub">
        USDT 잔고를 확인합니다. 외부 주소·회원 전송은{' '}
        <Link to={`${base}/transfer`}>테더 전송</Link>을 이용하세요.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>내 잔고</h3>
        {!hasWallet && (
          <p className="error">지갑이 아직 준비되지 않았습니다. 관리자 승인 후 이용하세요.</p>
        )}
        <div className="rate-grid wallet-balance">
          <div className="rate-card active">
            <strong>USDT</strong>
            <div className="rate-value" style={{ marginTop: '0.5rem' }}>
              <span className="rate-num">{balances ? formatNum(balances.usdt) : '—'}</span>
              <span className="rate-unit">USDT</span>
              {krwEst != null && (
                <span className="rate-unit num" style={{ marginLeft: '0.35rem' }}>
                  ({formatKrw(krwEst)} KRW)
                </span>
              )}
            </div>
            {rate != null && (
              <p className="setting-desc" style={{ marginBottom: 0 }}>
                참고 환율(판매) {formatNum(rate)} KRW/USDT
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** @deprecated Use ProfilePage — kept for old bookmarks. */
export function BanksPage() {
  const base = usePortalBase();
  return <Navigate to={`${base}/me`} replace />;
}

/** Profile + KRW bank list / add-request / soft-delete. */
export function ProfilePage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [pending, setPending] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [requestBusy, setRequestBusy] = useState(false);

  async function load() {
    const data = await api<{ bankAccounts: any[]; pendingRequest: any | null }>('/api/bank-accounts');
    setRows(data.bankAccounts || []);
    setPending(data.pendingRequest);
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : '불러오기 실패'));
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setRequestError('');
    setError('');
    setOk('');
    setRequestBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api('/api/bank-accounts', {
        method: 'POST',
        json: {
          bankName: fd.get('bankName'),
          accountNo: fd.get('accountNo'),
          holderName: fd.get('holderName'),
        },
      });
      e.currentTarget.reset();
      setRequestOpen(false);
      setOk('등록 요청이 접수되었습니다. 관리자 승인 후 반영됩니다.');
      await load();
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : '요청 실패');
    } finally {
      setRequestBusy(false);
    }
  }

  async function cancelPending() {
    if (!pending?.id) return;
    setError('');
    setOk('');
    try {
      await api(`/api/bank-accounts/requests/${pending.id}/cancel`, { method: 'POST' });
      setOk('등록 요청을 취소했습니다.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '취소 실패');
    }
  }

  async function softDelete(id: string) {
    if (!window.confirm('이 원화 계좌를 삭제할까요? (목록에서만 숨기고, 기록은 보관됩니다)')) return;
    setError('');
    setOk('');
    try {
      await api(`/api/bank-accounts/${id}/delete`, { method: 'POST' });
      setOk('계좌를 삭제 처리했습니다.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패');
    }
  }

  const active = rows.filter((r) => r.status === 'active');
  const shown = active.length ? active : rows;
  const fields = useMemo<FilterFieldDef<any>[]>(
    () => [
      { key: 'bank_name', label: '은행', get: (r) => String(r.bank_name ?? '') },
      { key: 'account_no', label: '계좌', get: (r) => String(r.account_no ?? '') },
      { key: 'holder_name', label: '예금주', get: (r) => String(r.holder_name ?? '') },
      { key: 'status', label: '상태', get: (r) => String(r.status ?? '') },
    ],
    [],
  );
  const { values, setValue, filtered, totalCount, shownCount } = useMultiFilters(fields, shown);
  const bankCols = filterCols(fields, ['bank_name', 'account_no', 'holder_name', 'status', null]);

  return (
    <div>
      <h1 className="page-title">내 정보</h1>
      <p className="page-sub">계정과 등록된 원화 계좌를 관리합니다.</p>
      {error && <p className="error">{error}</p>}
      {ok && <p className="setting-desc">{ok}</p>}
      <div className="panel stack">
        <div>
          <div className="setting-title">계정</div>
          <dl className="member-dl profile-account">
            <div>
              <dt>아이디</dt>
              <dd>{user?.email || '—'}</dd>
            </div>
            <div>
              <dt>이름</dt>
              <dd>{user?.displayName || '—'}</dd>
            </div>
            <div>
              <dt>상태</dt>
              <dd>
                <span className={`badge ${statusBadge(user?.status || '')}`}>{user?.status}</span>
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="panel">
        <div className="page-header" style={{ marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>원화 계좌</h3>
          <div className="page-header-actions">
            <button
              type="button"
              disabled={!!pending}
              title={pending ? '승인 대기 중인 요청이 있습니다' : undefined}
              onClick={() => {
                setRequestError('');
                setRequestOpen(true);
              }}
            >
              계좌추가요청
            </button>
          </div>
        </div>
        {pending && (
          <div className="banner" style={{ marginBottom: '0.85rem' }}>
            승인 대기: {pending.bank_name} {pending.account_no} ({pending.holder_name}){' '}
            <button
              className="secondary"
              type="button"
              style={{ marginLeft: '0.5rem' }}
              onClick={() => void cancelPending()}
            >
              요청 취소
            </button>
          </div>
        )}
        <TableCount shown={shownCount} total={totalCount} />
        <table>
          <thead>
            <ColumnFilterRow
              columns={bankCols}
              values={values}
              onChange={setValue}
            />
            <TableHeaderRow columns={bankCols} />
            </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.bank_name}
                </td>
                <td>{r.account_no}</td>
                <td>{r.holder_name}</td>
                <td>
                  <span className={`badge ${statusBadge(r.status)}`}>{r.status}</span>
                </td>
                <td>
                  {r.status === 'active' && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void softDelete(r.id)}
                    >
                      삭제
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={5}>
                  {shown.length
                    ? '필터 조건에 맞는 계좌가 없습니다.'
                    : '등록된 계좌가 없습니다. 계좌추가요청으로 등록하세요.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {requestOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="bank-request-title">
            <div className="modal-header">
              <h2 id="bank-request-title">계좌 추가 요청</h2>
              <button
                className="secondary modal-close"
                type="button"
                onClick={() => setRequestOpen(false)}
              >
                닫기
              </button>
            </div>
            <p className="modal-desc">관리자 승인 후 등록된 계좌에 반영됩니다.</p>
            {requestError && <p className="error">{requestError}</p>}
            <form className="stack" onSubmit={onSubmit}>
              <label>
                은행명
                <input name="bankName" required defaultValue="KB국민" autoFocus />
              </label>
              <label>
                계좌번호
                <input name="accountNo" required />
              </label>
              <label>
                예금주
                <input name="holderName" required />
              </label>
              <div className="modal-actions">
                <button type="submit" disabled={requestBusy || !!pending}>
                  등록 요청
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function useSpotRate(side: 'buy' | 'sell') {
  const [rate, setRate] = useState<number | null>(null);
  const [feePercent, setFeePercent] = useState(0);
  const [rateError, setRateError] = useState('');
  const [providerName, setProviderName] = useState('');
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [refreshLabel, setRefreshLabel] = useState('');
  useEffect(() => {
    void api<{
      rateKrwPerUsdt: number | null;
      fxFeePercent?: number;
      providerName?: string;
      providerId?: string;
      fetchedAt?: string;
      fxRateRefreshIntervalLabel?: string;
      fxRateRefreshInterval?: string;
      error?: string;
    }>(`/api/orders/rate?side=${side}`)
      .then((d) => {
        setRate(d.rateKrwPerUsdt);
        setFeePercent(d.fxFeePercent ?? 0);
        setProviderName(d.providerName || d.providerId || '');
        setFetchedAt(d.fetchedAt ?? null);
        setRefreshLabel(d.fxRateRefreshIntervalLabel || d.fxRateRefreshInterval || '');
        if (d.error) setRateError(d.error);
      })
      .catch((e) => setRateError(e instanceof Error ? e.message : '환율 조회 실패'));
  }, [side]);
  return { rate, feePercent, rateError, providerName, fetchedAt, refreshLabel };
}

function parseAmountInput(display: string): number {
  const cleaned = display.replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function formatIntegerCommas(digits: string): string {
  if (!digits) return '';
  const n = Number(digits);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('en-US');
}

function formatUsdtCommas(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  if (!cleaned) return '';
  const parts = cleaned.split('.');
  const intPart = parts[0] ?? '';
  const frac = (parts[1] ?? '').slice(0, 2);
  const intFmt = intPart ? Number(intPart).toLocaleString('en-US') : '0';
  if (cleaned.includes('.')) return `${intFmt}.${frac}`;
  return intFmt;
}

const KRW_QUICK = [
  { label: '+1만', add: 10_000 },
  { label: '+5만', add: 50_000 },
  { label: '+10만', add: 100_000 },
  { label: '+50만', add: 500_000 },
] as const;

const USDT_QUICK = [
  { label: '+10', add: 10 },
  { label: '+50', add: 50 },
  { label: '+100', add: 100 },
  { label: '+500', add: 500 },
] as const;

function OtcOrderForm({ kind }: { kind: 'buy' | 'sell' }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const base = usePortalBase();
  const { rate, feePercent, rateError, providerName, fetchedAt, refreshLabel } = useSpotRate(kind);
  const isBuy = kind === 'buy';
  const [sourceUnit, setSourceUnit] = useState<'krw' | 'usdt'>(isBuy ? 'krw' : 'usdt');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sellUsdtBal, setSellUsdtBal] = useState<number | null>(null);
  const allowed = isBuy ? !!user?.canBuyTether : !!user?.canSellTether;
  const raw = parseAmountInput(amount);

  useEffect(() => {
    if (kind !== 'sell') return;
    let cancelled = false;
    void api<{ balances: { usdt: number; ledgerUsdt?: number } }>('/api/wallets')
      .then((d) => {
        if (cancelled) return;
        setSellUsdtBal(d.balances.usdt ?? d.balances.ledgerUsdt ?? 0);
      })
      .catch(() => {
        if (!cancelled) setSellUsdtBal(null);
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const amountUsdt = (() => {
    if (!(raw > 0) || rate == null) return 0;
    if (isBuy) {
      const krw = sourceUnit === 'krw' ? Math.round(raw) : Math.round(raw * rate);
      if (!(krw >= 1)) return 0;
      return floor2(krw / rate);
    }
    if (sourceUnit === 'usdt') return round2(raw);
    const krwWanted = Math.round(raw);
    if (!(krwWanted >= 1)) return 0;
    return round2(krwWanted / rate);
  })();
  const amountKrw = (() => {
    if (!(raw > 0) || rate == null || !(amountUsdt > 0)) return 0;
    if (isBuy) {
      return sourceUnit === 'krw' ? Math.round(raw) : Math.round(raw * rate);
    }
    return Math.floor(amountUsdt * rate + 1e-9);
  })();

  const krwText =
    sourceUnit === 'krw' ? amount : amountKrw >= 1 ? formatIntegerCommas(String(amountKrw)) : '';
  const usdtText =
    sourceUnit === 'usdt' ? amount : amountUsdt > 0 ? formatUsdtCommas(String(amountUsdt)) : '';

  function setAmountFromNumber(n: number, unit: 'krw' | 'usdt') {
    setSourceUnit(unit);
    if (!(n > 0)) {
      setAmount('');
      return;
    }
    if (unit === 'krw') setAmount(formatIntegerCommas(String(Math.round(n))));
    else setAmount(formatUsdtCommas(String(round2(n))));
  }

  function sourceRawFor(unit: 'krw' | 'usdt'): number {
    if (sourceUnit === unit) return raw || 0;
    return unit === 'krw' ? amountKrw : amountUsdt;
  }

  function addQuick(unit: 'krw' | 'usdt', add: number) {
    setAmountFromNumber(sourceRawFor(unit) + add, unit);
  }

  function adoptSource(next: 'krw' | 'usdt') {
    if (next === sourceUnit) return;
    if (raw > 0 && rate != null && amountUsdt > 0 && amountKrw >= 1) {
      if (next === 'krw') setAmount(formatIntegerCommas(String(amountKrw)));
      else setAmount(formatUsdtCommas(String(amountUsdt)));
    }
    setSourceUnit(next);
  }

  function setSellAll() {
    if (!(sellUsdtBal != null && sellUsdtBal > 0)) return;
    setAmountFromNumber(round2(sellUsdtBal), 'usdt');
  }

  function onKrwChange(v: string) {
    setSourceUnit('krw');
    const digits = v.replace(/[^\d]/g, '');
    setAmount(formatIntegerCommas(digits));
  }

  function onUsdtChange(v: string) {
    const compact = v.replace(/,/g, '');
    if (v !== '' && !/^[\d,]*\.?\d{0,2}$/.test(compact) && !/^[\d,]*\.?$/.test(v)) return;
    setSourceUnit('usdt');
    if (v === '') {
      setAmount('');
      return;
    }
    setAmount(formatUsdtCommas(v));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!allowed || !(amountUsdt > 0) || !(amountKrw >= 1)) return;
    setBusy(true);
    setError('');
    try {
      const data = await api<{ trade: { id: string } }>(
        isBuy ? '/api/orders/buy' : '/api/orders/sell',
        {
          method: 'POST',
          json: isBuy
            ? { amountKrw: Math.round(amountKrw) }
            : { amountUsdt: round2(amountUsdt) },
        },
      );
      nav(`${base}/trades/${data.trade.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '주문 실패');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = allowed && !busy && amountUsdt > 0 && rate != null && amountKrw >= 1;
  const submitLabel = !canSubmit
    ? isBuy
      ? '테더 받기'
      : '원화 받기'
    : isBuy
      ? `원화 ${formatKrw(amountKrw)}원으로 테더 받기`
      : `테더 ${formatNum(amountUsdt)}개로 원화 받기`;

  const payUnit: 'krw' | 'usdt' = isBuy ? 'krw' : 'usdt';
  const recvUnit: 'krw' | 'usdt' = isBuy ? 'usdt' : 'krw';

  return (
    <div>
      <h1 className="page-title">{isBuy ? '테더 구매' : '테더 판매'}</h1>
      <p className="page-sub">
        {isBuy
          ? '위칸에 입금할 원화를 넣으면 받을 테더가 계산됩니다. 아래칸을 직접 고쳐도 됩니다.'
          : '위칸에 팔 테더를 넣으면 받을 원화가 계산됩니다. 승인 후 등록 통장으로 오프라인 지급됩니다.'}
      </p>
      {!allowed && (
        <div className="banner">
          {isBuy ? '구매' : '판매'} 권한이 없습니다. 관리자에게 권한을 요청하세요.
        </div>
      )}
      {(rateError || error) && <p className="error">{rateError || error}</p>}
      <div className="panel">
        <form className="stack" onSubmit={onSubmit}>
          <div className="fx-pair">
            <FxLeg
              role="pay"
              unit={payUnit}
              title={isBuy ? '원화 입금' : '테더 매도'}
              isSource={sourceUnit === payUnit}
              value={payUnit === 'krw' ? krwText : usdtText}
              disabled={!allowed}
              hint={
                isBuy
                  ? '원 단위(정수)만 입력됩니다.'
                  : sellUsdtBal != null
                    ? `보유 ${formatNum(sellUsdtBal)} USDT`
                    : '잔고 불러오는 중'
              }
              onFocus={() => adoptSource(payUnit)}
              onChange={payUnit === 'krw' ? onKrwChange : onUsdtChange}
              chips={payUnit === 'krw' ? KRW_QUICK : USDT_QUICK}
              onAdd={(add) => addQuick(payUnit, add)}
              allAction={
                !isBuy
                  ? {
                      disabled: !allowed || !(sellUsdtBal != null && sellUsdtBal > 0),
                      onClick: setSellAll,
                    }
                  : undefined
              }
            />
            <div className="fx-arrow" aria-hidden>
              <span className="fx-arrow-icon">↓</span>
              <span className="fx-arrow-rate">
                {rate != null ? `1 테더 ≈ ${formatNum(rate)}원` : '환율 불러오는 중…'}
                {feePercent > 0 ? ` · 수수료 ${formatNum(feePercent)}%` : ''}
              </span>
            </div>
            <p className="setting-desc fx-rate-meta">
              기준 <strong>{providerName || '—'}</strong>
              {' · '}
              {fetchedAt ? formatKst(fetchedAt) : '—'}
              {' · '}
              {refreshLabel || '—'}
            </p>
            <FxLeg
              role="recv"
              unit={recvUnit}
              title={isBuy ? '테더 수령' : '원화 수령'}
              isSource={sourceUnit === recvUnit}
              value={recvUnit === 'krw' ? krwText : usdtText}
              disabled={!allowed}
              hint={isBuy ? '테더는 소수 둘째 자리 내림입니다.' : '원화는 원 단위로 내림됩니다.'}
              onFocus={() => adoptSource(recvUnit)}
              onChange={recvUnit === 'krw' ? onKrwChange : onUsdtChange}
              chips={recvUnit === 'krw' ? KRW_QUICK : USDT_QUICK}
              onAdd={(add) => addQuick(recvUnit, add)}
            />
          </div>
          <button type="submit" disabled={!canSubmit}>
            {submitLabel}
          </button>
        </form>
      </div>
    </div>
  );
}

function FxLeg({
  role,
  unit,
  title,
  isSource,
  value,
  disabled,
  hint,
  onFocus,
  onChange,
  chips,
  onAdd,
  allAction,
}: {
  role: 'pay' | 'recv';
  unit: 'krw' | 'usdt';
  title: string;
  isSource: boolean;
  value: string;
  disabled: boolean;
  hint: string;
  onFocus: () => void;
  onChange: (v: string) => void;
  chips: readonly { label: string; add: number }[];
  onAdd: (add: number) => void;
  allAction?: { disabled: boolean; onClick: () => void };
}) {
  const isKrw = unit === 'krw';
  return (
    <div
      className={`fx-leg fx-leg--${unit} fx-leg--${role}${isSource ? ' is-source' : ' is-derived'}`}
    >
      <div className="fx-leg-head">
        <span className="fx-leg-badge">{role === 'pay' ? '낼 금액' : '받을 금액'}</span>
        <span className="fx-leg-currency">{isKrw ? '원화' : '테더'}</span>
      </div>
      <div className="fx-leg-row">
        <input
          className="fx-leg-input"
          type="text"
          inputMode={isKrw ? 'numeric' : 'decimal'}
          disabled={disabled}
          value={value}
          placeholder={isKrw ? '0' : '0.00'}
          aria-label={title}
          onFocus={onFocus}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="fx-leg-unit">{isKrw ? '원' : 'USDT'}</span>
      </div>
      <div className={`quick-amounts fx-chips fx-chips--${unit}`} role="group" aria-label={`${title} 금액 추가`}>
        {chips.map((q) => (
          <button key={q.label} type="button" disabled={disabled} onClick={() => onAdd(q.add)}>
            {q.label}
          </button>
        ))}
        {allAction && (
          <button
            type="button"
            className="fx-chip-all"
            disabled={allAction.disabled}
            onClick={allAction.onClick}
          >
            전액
          </button>
        )}
      </div>
      <p className="fx-leg-hint">{hint}</p>
    </div>
  );
}

export function BuyBoard() {
  return <OtcOrderForm kind="buy" />;
}
export function SellBoard() {
  return <OtcOrderForm kind="sell" />;
}

export function TransferPage() {
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [partnerCode, setPartnerCode] = useState('');
  const [virtualAddr, setVirtualAddr] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState('');
  const { rate } = useSpotRate('sell');
  const amountUsdt = round2(amount);
  const krwEst = estimateUsdtKrw(amountUsdt > 0 ? amountUsdt : null, rate);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const partner = params.get('partner') || '';
    if (!partner) {
      setReady(true);
      return;
    }
    setPartnerCode(partner);
    void api<{ virtualDepositAddress: string }>(`/api/auth/partner/${encodeURIComponent(partner)}`)
      .then((p) => setVirtualAddr(p.virtualDepositAddress))
      .catch((e) => setError(e instanceof Error ? e.message : '파트너 조회 실패'))
      .finally(() => setReady(true));
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setOk('');
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const amountUsdt = round2(fd.get('amount'));
    try {
      if (partnerCode && virtualAddr) {
        const data = await api<{
          transfer: { kind?: string; gameAmount?: number };
        }>('/api/transfers', {
          method: 'POST',
          json: { amountUsdt, toAddress: virtualAddr },
        });
        if (data.transfer?.kind === 'partner_credit') {
          setOk(
            `게임 충전이 완료되었습니다.${
              data.transfer.gameAmount != null
                ? ` 게임머니 +${formatNum(data.transfer.gameAmount)}`
                : ''
            }`,
          );
        } else {
          setOk('전송이 완료되었습니다.');
        }
        e.currentTarget.reset();
        setAmount('');
        return;
      }

      const dest = String(fd.get('destination') || '').trim();
      const payload: Record<string, unknown> = { amountUsdt };
      if (dest.startsWith('T') && dest.length >= 30) payload.toAddress = dest;
      else if (dest) payload.toEmail = dest.toLowerCase();
      else {
        setError('회원 아이디 또는 TRC-20 주소(T…)를 입력하세요.');
        return;
      }
      const data = await api<{ transfer: { kind?: string; onchainTxId?: string } }>('/api/transfers', {
        method: 'POST',
        json: payload,
      });
      if (data.transfer?.kind === 'external' && data.transfer.onchainTxId) {
        setOk(`외부 출금이 완료되었습니다. 거래 ID: ${data.transfer.onchainTxId.slice(0, 16)}…`);
      } else {
        setOk('전송이 완료되었습니다.');
      }
      e.currentTarget.reset();
      setAmount('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '전송 실패');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <p>불러오는 중…</p>;

  const isPartner = !!(partnerCode && virtualAddr);

  return (
    <div>
      <h1 className="page-title">{isPartner ? '게임 충전' : '테더 전송'}</h1>
      <p className="page-sub">
        {isPartner
          ? '아래 충전 지갑으로 USDT를 보내면 게임머니가 지급됩니다.'
          : '회원 아이디면 즉시 전송되고, 외부 TRC-20 주소면 온체인 출금됩니다.'}
      </p>
      {error && <p className="error">{error}</p>}
      {ok && <p className="setting-desc">{ok}</p>}
      <div className="panel">
        <form className="stack" onSubmit={onSubmit}>
          {isPartner ? (
            <label>
              수신 지갑 (TRC-20)
              <input value={virtualAddr} readOnly />
            </label>
          ) : (
            <label>
              수신자 (아이디 또는 TRC-20 주소)
              <input name="destination" required placeholder="user@example.com 또는 T..." />
            </label>
          )}
          <label>
            수량 (USDT)
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {krwEst != null && (
              <span className="fx-leg-hint">≈ {formatKrw(krwEst)}원</span>
            )}
          </label>
          <button type="submit" disabled={busy}>
            {isPartner ? '충전 전송' : '전송'}
          </button>
        </form>
      </div>
    </div>
  );
}

export function TradesListPage() {
  const [trades, setTrades] = useState<any[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void api<{ trades: any[] }>('/api/trades')
      .then((d) => setTrades(d.trades))
      .catch((e) => setError(e instanceof Error ? e.message : '불러오기 실패'));
  }, []);
  function kindLabel(t: any) {
    if (t.kind === 'buy_from_admin') return '구매(관리자 판매)';
    if (t.kind === 'sell_to_admin') return '판매(관리자 매입)';
    return t.kind || 'P2P';
  }
  const fields = useMemo<FilterFieldDef<any>[]>(
    () => [
      {
        key: 'kind',
        label: '유형',
        type: 'select',
        options: [
          { value: 'buy_from_admin', label: '구매' },
          { value: 'sell_to_admin', label: '판매' },
        ],
        get: (r) => String(r.kind ?? ''),
      },
      { key: 'id', label: 'ID', get: (r) => String(r.id ?? '') },
      { key: 'amount_usdt', label: 'USDT', align: 'right', get: (r) => String(r.amount_usdt ?? '') },
      { key: 'amount_krw', label: 'KRW', align: 'right', get: (r) => String(r.amount_krw ?? '') },
      {
        key: 'status',
        label: '상태',
        type: 'select',
        options: [
          { value: 'awaiting_user_deposit', label: '입금 대기' },
          { value: 'awaiting_admin_payout', label: '관리자 확인 대기' },
          { value: 'settling_onchain', label: '온체인 정산 중' },
          { value: 'krw_confirmed', label: '원화 확인' },
          { value: 'usdt_confirmed', label: 'USDT 확인' },
          { value: 'both_held', label: '양쪽 보류' },
          { value: 'completed', label: '완료' },
          { value: 'cancelled', label: '취소' },
          { value: 'disputed', label: '분쟁' },
          { value: 'awaiting_dual_deposit', label: '양쪽 입금 대기' },
        ],
        get: (r) => String(r.status ?? ''),
      },
      { key: 'created_at', label: '시각', get: (r) => formatKst(r.created_at) },
    ],
    [],
  );
  const { values, setValue, filtered, totalCount, shownCount } = useMultiFilters(fields, trades);
  const tradeCols = filterCols(fields, [
    'kind',
    'id',
    'amount_usdt',
    'amount_krw',
    'status',
    'created_at',
  ]);
  return (
    <div>
      <h1 className="page-title">내 거래</h1>
      <p className="page-sub">관리자 OTC 주문 및 진행 상태를 확인합니다.</p>
      {error && <p className="error">{error}</p>}
      <div className="panel">
        <TableCount shown={shownCount} total={totalCount} />
        <table>
          <thead>
            <ColumnFilterRow
              columns={tradeCols}
              values={values}
              onChange={setValue}
            />
            <TableHeaderRow columns={tradeCols} />
            </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id}>
                <td>{kindLabel(t)}</td>
                <td>{t.id.slice(0, 8)}…</td>
                <td className="col-amount">{formatNum(t.amount_usdt)}</td>
                <td className="col-amount">{formatKrw(t.amount_krw)}</td>
                <td>
                  <span className={`badge ${statusBadge(t.status)}`}>{t.status}</span>
                </td>
                <td>{formatKst(t.created_at)}</td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={6} style={{ color: 'var(--muted)' }}>
                  {trades.length ? '필터 조건에 맞는 거래가 없습니다.' : '거래가 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TradeDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const base = usePortalBase();
  const [bundle, setBundle] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void api(`/api/trades/${id}`)
      .then(setBundle)
      .catch((e) => setError(String(e.message)));
  }, [id]);

  const roleLabel = useMemo(() => {
    if (!bundle || !user) return '';
    if (user.id === bundle.trade.buyer_user_id) return '구매자';
    if (user.id === bundle.trade.seller_user_id) return '판매자';
    return '';
  }, [bundle, user]);

  if (!bundle) {
    return <p>{error || '불러오는 중…'}</p>;
  }
  const { trade, deposits, custody } = bundle;
  const isBuyOtc = trade.kind === 'buy_from_admin';
  const isSellOtc = trade.kind === 'sell_to_admin';
  return (
    <div>
      <h1 className="page-title">거래 {trade.id.slice(0, 8)}</h1>
      <p className="page-sub">
        {isBuyOtc ? '테더 구매(관리자 판매)' : isSellOtc ? '테더 판매(관리자 매입)' : `역할: ${roleLabel}`}{' '}
        · 상태 <span className={`badge ${statusBadge(trade.status)}`}>{trade.status}</span>
        {trade.price_krw_per_usdt != null && (
          <> · 환율 {formatNum(trade.price_krw_per_usdt)} KRW/USDT</>
        )}
      </p>
      {error && <p className="error">{error}</p>}
      <div className="panel stack">
        <div>
          USDT {formatNum(trade.amount_usdt)} ↔ KRW {formatKrw(trade.amount_krw)}
        </div>
        {(isBuyOtc || !trade.kind || trade.kind === 'legacy_p2p') && (
          <div>
            <strong>관리자 원화 입금 계좌</strong>
            <div>
              {custody.bank
                ? `${custody.bank.bank_name} ${custody.bank.account_no} (${custody.bank.holder_name})`
                : '미설정'}
            </div>
            {isBuyOtc && (
              <p className="setting-desc">
                위 계좌로 KRW를 입금해 주세요. 관리자 확인 후 USDT 잔고에 반영됩니다.
              </p>
            )}
          </div>
        )}
        {isSellOtc && (
          <div>
            <strong>환전 안내</strong>
            <p className="setting-desc">
              USDT가 확보되었습니다. 관리자 승인 후 정산이 진행되며, 원화는 등록된 통장으로
              지급됩니다(이 솔루션은 KRW 잔고를 두지 않습니다).
            </p>
            {trade.status === 'awaiting_admin_payout' && (
              <p className="setting-desc">관리자 정산 대기 중입니다.</p>
            )}
            {trade.status === 'settling_onchain' && (
              <p className="setting-desc">정산 처리 중입니다.</p>
            )}
            {trade.status === 'completed' && (
              <p className="setting-desc">환전 정산이 완료되었습니다. 원화는 등록 통장으로 지급됩니다.</p>
            )}
          </div>
        )}
        <div>
          <strong>진행 상태</strong>
          <ul>
            {deposits.map((d: any) => (
              <li key={d.id}>
                {d.side === 'buyer_krw' ? 'KRW 입금' : 'USDT'}:{' '}
                <span className={`badge ${statusBadge(d.status)}`}>{d.status}</span> / 예정{' '}
                {d.side === 'buyer_krw' ? formatKrw(d.expected_amount) : formatNum(d.expected_amount)}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="setting-desc">
        <Link to={`${base}/trades`}>← 내 거래 목록</Link>
      </p>
    </div>
  );
}

export function TransactionsPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    void api('/api/transactions').then(setData);
  }, []);
  const usdtTx = useMemo(
    () => ((data?.transactions || []) as any[]).filter((t) => t.asset === 'usdt'),
    [data],
  );
  const fields = useMemo<FilterFieldDef<any>[]>(
    () => [
      { key: 'created_at', label: '시각', get: (r) => formatKst(r.created_at) },
      { key: 'ref_type', label: '거래', get: (r) => String(r.title ?? r.note ?? r.ref_type ?? '') },
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
      { key: 'amount', label: '금액', align: 'right', get: (r) => String(r.amount ?? '') },
      { key: 'balance_after', label: '잔액', align: 'right', get: (r) => String(r.balance_after ?? '') },
      { key: 'ref_id', label: '거래 ID', get: (r) => String(r.displayTxId ?? r.ref_id ?? r.id ?? '') },
    ],
    [],
  );
  const { values, setValue, filtered, totalCount, shownCount } = useMultiFilters(fields, usdtTx);
  const txCols = filterCols(fields, [
    'created_at',
    'ref_type',
    'direction',
    'amount',
    'balance_after',
    'ref_id',
  ]);
  if (!data) return <p>불러오는 중…</p>;
  return (
    <div>
      <h1 className="page-title">거래 내역</h1>
      <div className="panel">
        <TableCount shown={shownCount} total={totalCount} />
        <table>
          <thead>
            <ColumnFilterRow
              columns={txCols}
              values={values}
              onChange={setValue}
            />
            <TableHeaderRow columns={txCols} />
            </thead>
          <tbody>
            {filtered.map((t: any) => (
              <tr key={t.id}>
                <td>{formatKst(t.created_at)}</td>
                <td>{t.title || t.note || t.ref_type}</td>
                <td>{t.direction === 'credit' ? '입금' : '출금'}</td>
                <td className="col-amount">{formatNum(t.amount)}</td>
                <td className="col-amount">{formatNum(t.balance_after)}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.85em' }}>
                  {t.displayTxId || t.id.slice(0, 8)}
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={6}>
                  {usdtTx.length ? '필터 조건에 맞는 내역이 없습니다.' : '내역이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
