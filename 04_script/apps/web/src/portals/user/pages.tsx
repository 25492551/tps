import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formatKst, formatNum, round2, statusBadge, wsUrl } from '../../lib/api';
import { useAuth } from '../../lib/auth';

export function UserHome() {
  const { user } = useAuth();
  return (
    <div>
      <h1 className="page-title">안녕하세요, {user?.displayName}</h1>
      <p className="page-sub">관리자와 테더를 사고팔거나, 다른 유저에게 USDT를 전송하세요.</p>
      <div className="row">
        {user?.canBuyTether && (
          <Link className="btn" to="/app/buy">
            테더 구매
          </Link>
        )}
        {user?.canSellTether && (
          <Link className="btn secondary" to="/app/sell">
            테더 판매
          </Link>
        )}
        <Link className="btn secondary" to="/app/transfer">
          테더 전송
        </Link>
        <Link className="btn secondary" to="/app/trades">
          내 거래
        </Link>
      </div>
    </div>
  );
}

export function WalletsPage() {
  const [balances, setBalances] = useState<{ usdt: number; krw: number } | null>(null);
  const [hasWallet, setHasWallet] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  async function load() {
    const data = await api<{
      wallets: any[];
      balances: { usdt: number; krw: number; ledgerUsdt?: number; ledgerKrw?: number };
    }>('/api/wallets');
    setHasWallet(data.wallets.length > 0);
    setBalances({
      usdt: data.balances.usdt ?? data.balances.ledgerUsdt ?? 0,
      krw: data.balances.krw ?? data.balances.ledgerKrw ?? 0,
    });
  }
  useEffect(() => {
    void load().catch((e) => setError(String(e.message)));
  }, []);
  async function onTransfer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setOk('');
    const fd = new FormData(e.currentTarget);
    try {
      const data = await api<{ withdrawal?: { onchainTxId?: string }; transfer?: { kind?: string } }>(
        '/api/wallets/transfer',
        {
          method: 'POST',
          json: { amount: round2(fd.get('amount')), destination: fd.get('destination') },
        },
      );
      if (data.withdrawal?.onchainTxId) {
        setOk(`출금이 완료되었습니다. 거래 ID: ${data.withdrawal.onchainTxId.slice(0, 16)}…`);
      } else {
        setOk('전송이 완료되었습니다.');
      }
      e.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '이체 실패');
    }
  }
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
      <p className="page-sub">잔고 확인 및 외부 주소로 USDT 출금.</p>
      {error && <p className="error">{error}</p>}
      {ok && <p className="setting-desc">{ok}</p>}
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>내 잔고</h3>
        {!hasWallet && <p className="error">지갑이 아직 준비되지 않았습니다. 관리자 승인 후 이용하세요.</p>}
        <div className="rate-grid">
          <div className="rate-card active">
            <strong>USDT</strong>
            <div className="rate-value" style={{ marginTop: '0.5rem' }}>
              <span className="rate-num">{balances ? formatNum(balances.usdt) : '—'}</span>
              <span className="rate-unit">USDT</span>
            </div>
          </div>
          <div className="rate-card">
            <strong>KRW</strong>
            <div className="rate-value" style={{ marginTop: '0.5rem' }}>
              <span className="rate-num">{balances ? formatNum(balances.krw) : '—'}</span>
              <span className="rate-unit">KRW</span>
            </div>
          </div>
        </div>
      </div>
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>USDT 외부 출금</h3>
        <p className="setting-desc">플랫폼에 없는 TRC-20 주소로 보내면 온체인 전송됩니다.</p>
        <form className="stack" onSubmit={onTransfer}>
          <label>
            금액
            <input name="amount" type="number" step="0.01" min="0.01" required />
          </label>
          <label>
            수신 주소 (TRC-20)
            <input name="destination" required placeholder="T..." />
          </label>
          <button type="submit">출금</button>
        </form>
      </div>
    </div>
  );
}

export function BanksPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  async function load() {
    const data = await api<{ bankAccounts: any[] }>('/api/bank-accounts');
    setRows(data.bankAccounts);
  }
  useEffect(() => {
    void load().catch((e) => setError(String(e.message)));
  }, []);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api('/api/bank-accounts', {
        method: 'POST',
        json: {
          bankCode: fd.get('bankCode'),
          bankName: fd.get('bankName'),
          accountNo: fd.get('accountNo'),
          holderName: fd.get('holderName'),
        },
      });
      e.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록 실패');
    }
  }
  return (
    <div>
      <h1 className="page-title">원화 계좌</h1>
      <p className="page-sub">본인 명의 한국 통장을 등록하세요.</p>
      {error && <p className="error">{error}</p>}
      <div className="panel">
        <form className="stack" onSubmit={onSubmit}>
          <label>
            은행코드
            <input name="bankCode" required defaultValue="004" />
          </label>
          <label>
            은행명
            <input name="bankName" required defaultValue="KB국민" />
          </label>
          <label>
            계좌번호
            <input name="accountNo" required />
          </label>
          <label>
            예금주
            <input name="holderName" required />
          </label>
          <button type="submit">등록</button>
        </form>
      </div>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>은행</th>
              <th>계좌</th>
              <th>예금주</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.bank_name} ({r.bank_code})
                </td>
                <td>{r.account_no}</td>
                <td>{r.holder_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function useSpotRate(side: 'buy' | 'sell') {
  const [rate, setRate] = useState<number | null>(null);
  const [feePercent, setFeePercent] = useState(0);
  const [rateError, setRateError] = useState('');
  useEffect(() => {
    void api<{ rateKrwPerUsdt: number | null; fxFeePercent?: number; error?: string }>(
      `/api/orders/rate?side=${side}`,
    )
      .then((d) => {
        setRate(d.rateKrwPerUsdt);
        setFeePercent(d.fxFeePercent ?? 0);
        if (d.error) setRateError(d.error);
      })
      .catch((e) => setRateError(e instanceof Error ? e.message : '환율 조회 실패'));
  }, [side]);
  return { rate, feePercent, rateError };
}

function OtcOrderForm({ kind }: { kind: 'buy' | 'sell' }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const { rate, feePercent, rateError } = useSpotRate(kind);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const allowed = kind === 'buy' ? !!user?.canBuyTether : !!user?.canSellTether;
  const amountUsdt = Number(amount) || 0;
  const estKrw = rate && amountUsdt > 0 ? Math.round(amountUsdt * rate * 100) / 100 : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!allowed) return;
    setBusy(true);
    setError('');
    try {
      const data = await api<{ trade: { id: string } }>(
        kind === 'buy' ? '/api/orders/buy' : '/api/orders/sell',
        { method: 'POST', json: { amountUsdt: round2(amountUsdt) } },
      );
      nav(`/app/trades/${data.trade.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '주문 실패');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">{kind === 'buy' ? '테더 구매' : '테더 판매'}</h1>
      <p className="page-sub">
        {kind === 'buy'
          ? '관리자로부터 USDT를 구매합니다. 원화 입금 확인 후 잔고에 USDT가 반영됩니다.'
          : '보유 USDT를 원화로 환전합니다. 승인 시 실제 정산이 진행되고 KRW가 지급됩니다.'}
      </p>
      {!allowed && (
        <div className="banner">
          {kind === 'buy' ? '구매' : '판매'} 권한이 없습니다. 관리자에게 문의하세요.
        </div>
      )}
      {(rateError || error) && <p className="error">{rateError || error}</p>}
      <div className="panel">
        <p className="setting-desc">
          적용 환율:{' '}
          {rate != null ? `${formatNum(rate)} KRW/USDT` : '불러오는 중…'}
          {feePercent > 0 ? ` (수수료 ${formatNum(feePercent)}% 포함)` : ''}
        </p>
        <form className="stack" onSubmit={onSubmit}>
          <label>
            수량 (USDT)
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              disabled={!allowed}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          {estKrw != null && (
            <p>
              예상 금액: <strong>{formatNum(estKrw)} KRW</strong>
            </p>
          )}
          <button type="submit" disabled={!allowed || busy || !(amountUsdt > 0)}>
            {kind === 'buy' ? '구매 주문' : '판매 주문'}
          </button>
        </form>
      </div>
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
        return;
      }

      const dest = String(fd.get('destination') || '').trim();
      const payload: Record<string, unknown> = { amountUsdt };
      if (dest.includes('@')) payload.toEmail = dest;
      else if (dest.startsWith('T')) payload.toAddress = dest;
      else {
        setError('이메일 또는 TRC-20 주소(T…)를 입력하세요.');
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
          : '회원 이메일이면 즉시 전송되고, 외부 TRC-20 주소면 온체인 출금됩니다.'}
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
              수신자 (이메일 또는 TRC-20 주소)
              <input name="destination" required placeholder="user@example.com 또는 T..." />
            </label>
          )}
          <label>
            수량 (USDT)
            <input name="amount" type="number" step="0.01" min="0.01" required />
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
  return (
    <div>
      <h1 className="page-title">내 거래</h1>
      <p className="page-sub">관리자 OTC 주문 및 진행 상태를 확인합니다.</p>
      {error && <p className="error">{error}</p>}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>유형</th>
              <th>ID</th>
              <th>USDT</th>
              <th>KRW</th>
              <th>상태</th>
              <th>시각</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id}>
                <td>{kindLabel(t)}</td>
                <td>
                  <Link to={`/app/trades/${t.id}`}>{t.id.slice(0, 8)}…</Link>
                </td>
                <td>{formatNum(t.amount_usdt)}</td>
                <td>{formatNum(t.amount_krw)}</td>
                <td>
                  <span className={`badge ${statusBadge(t.status)}`}>{t.status}</span>
                </td>
                <td>{formatKst(t.created_at)}</td>
              </tr>
            ))}
            {!trades.length && (
              <tr>
                <td colSpan={6} style={{ color: 'var(--muted)' }}>
                  거래가 없습니다.
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
  const [bundle, setBundle] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  async function load() {
    const data = await api(`/api/trades/${id}`);
    setBundle(data);
    const hist = await api<{ messages: any[] }>(`/api/trades/${id}/messages`);
    setMessages(hist.messages);
  }

  useEffect(() => {
    void load().catch((e) => setError(String(e.message)));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const ws = new WebSocket(wsUrl('user'));
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'join', tradeId: id }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'chat' && msg.message) {
        setMessages((prev) => [...prev, msg.message]);
      }
    };
    return () => ws.close();
  }, [id]);

  const roleLabel = useMemo(() => {
    if (!bundle || !user) return '';
    if (user.id === bundle.trade.buyer_user_id) return '구매자';
    if (user.id === bundle.trade.seller_user_id) return '판매자';
    return '';
  }, [bundle, user]);

  function sendChat(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: 'chat', tradeId: id, body: text }));
    setText('');
  }

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
          USDT {formatNum(trade.amount_usdt)} ↔ KRW {formatNum(trade.amount_krw)}
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
                위 계좌로 KRW를 입금한 뒤 채팅으로 알려주세요. 관리자 확인 후 USDT 잔고에 반영됩니다.
              </p>
            )}
          </div>
        )}
        {isSellOtc && (
          <div>
            <strong>환전 안내</strong>
            <p className="setting-desc">
              USDT 잔액이 확보되었습니다. 관리자 승인 후 원화(KRW)가 지급됩니다.
            </p>
            {trade.status === 'awaiting_admin_payout' && (
              <p className="setting-desc">관리자 정산 대기 중입니다.</p>
            )}
            {trade.status === 'settling_onchain' && (
              <p className="setting-desc">정산 처리 중입니다.</p>
            )}
            {trade.status === 'completed' && (
              <p className="setting-desc">환전이 완료되었습니다.</p>
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
                {formatNum(d.expected_amount)}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="panel">
        <h3>채팅 (관리자)</h3>
        <div className="chat-box">
          {messages.map((m) => (
            <div className="chat-msg" key={m.id}>
              <div className="meta">
                {m.sender_name || m.sender_user_id.slice(0, 8)} · {formatKst(m.created_at)}
              </div>
              <div>{m.body}</div>
            </div>
          ))}
        </div>
        <form className="row" onSubmit={sendChat}>
          <input
            style={{ flex: 1 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="메시지 입력"
          />
          <button type="submit">전송</button>
        </form>
      </div>
    </div>
  );
}

export function TransactionsPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    void api('/api/transactions').then(setData);
  }, []);
  if (!data) return <p>불러오는 중…</p>;
  return (
    <div>
      <h1 className="page-title">거래 내역</h1>
      <p className="page-sub">
        잔액 KRW {formatNum(data.balances.krw)} · USDT {formatNum(data.balances.usdt)}
      </p>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>시각</th>
              <th>거래</th>
              <th>자산</th>
              <th>구분</th>
              <th>금액</th>
              <th>잔액</th>
              <th>거래 ID</th>
            </tr>
          </thead>
          <tbody>
            {data.transactions.map((t: any) => (
              <tr key={t.id}>
                <td>{formatKst(t.created_at)}</td>
                <td>{t.title || t.note || t.ref_type}</td>
                <td>{t.asset.toUpperCase()}</td>
                <td>{t.direction === 'credit' ? '입금' : '출금'}</td>
                <td>{formatNum(t.amount)}</td>
                <td>{formatNum(t.balance_after)}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.85em' }}>
                  {t.displayTxId || t.id.slice(0, 8)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
