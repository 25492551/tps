import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, formatKst, formatKrw, formatNum, statusBadge } from '../../lib/api';
import { openMemberWindow } from '../../lib/memberWindow';
import { PeriodRange, periodRangeText } from '../../lib/PeriodRange';
import {
  ColumnFilterRow,
  TableCount,
  TableHeaderRow,
  filterCols,
  useMultiFilters,
  type FilterFieldDef,
} from '../../lib/tableFilters';
import { DepositSeriesChart } from '../shared/DepositSeriesChart';

export function AgentHome() {
  const [partner, setPartner] = useState<{ code: string; name: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void api<{ partner: { code: string; name: string } }>('/api/agent/me', { portal: 'agent' })
      .then((d) => setPartner(d.partner))
      .catch((e) => setError(e instanceof Error ? e.message : '로드 실패'));
  }, []);
  return (
    <div>
      <h1 className="page-title">에이전트</h1>
      <p className="page-sub">본인 거래와 담당 솔루션 회원을 관리합니다.</p>
      {error && <p className="error">{error}</p>}
      <div className="panel" style={{ marginBottom: '1rem' }}>
        <p className="setting-desc" style={{ marginTop: 0 }}>
          내 거래
        </p>
        <div className="row">
          <Link className="btn" to="/agent/buy">
            테더 구매
          </Link>
          <Link className="btn secondary" to="/agent/sell">
            테더 판매
          </Link>
          <Link className="btn secondary" to="/agent/transfer">
            테더 전송
          </Link>
          <Link className="btn secondary" to="/agent/wallets">
            테더지갑
          </Link>
        </div>
      </div>
      {partner && (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <p>
            솔루션: <strong>{partner.name}</strong> ({partner.code})
          </p>
          <div className="row">
            <Link className="btn" to="/agent/transactions">
              솔루션 트랜잭션
            </Link>
            <Link className="btn secondary" to="/agent/members">
              회원 목록
            </Link>
            <Link className="btn secondary" to="/agent/settlements">
              정산
            </Link>
          </div>
        </div>
      )}
      <DepositSeriesChart
        endpoint="/api/agent/deposit-series"
        portal="agent"
        title="솔루션 유저 입금"
        subtitle={
          partner
            ? `${partner.name} (${partner.code}) · 완료된 테더 구매(KRW) · 일별 · KST`
            : '완료된 테더 구매(KRW) · 일별 · KST'
        }
      />
    </div>
  );
}

export function AgentTransactionsPage() {
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<any[]>([]);
  const [partnerName, setPartnerName] = useState('');
  const [error, setError] = useState('');
  const urlLoginId = searchParams.get('loginId') || '';
  const fields = useMemo<FilterFieldDef<any>[]>(
    () => [
      { key: 'createdAt', label: '시각', get: (r) => formatKst(r.createdAt) },
      { key: 'loginId', label: '아이디', get: (r) => String(r.loginId ?? '') },
      { key: 'displayName', label: '이름', get: (r) => String(r.displayName ?? '') },
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
      { key: 'amountUsdt', label: 'USDT', align: 'right', get: (r) => String(r.amountUsdt ?? '') },
      { key: 'amountKrw', label: 'KRW', align: 'right', get: (r) => String(r.amountKrw ?? '') },
      { key: 'balanceAfter', label: '잔액', align: 'right', get: (r) => String(r.balanceAfter ?? '') },
      { key: 'refType', label: 'ref', get: (r) => String(r.refType ?? '') },
    ],
    [],
  );
  const { values, setValue, filtered, totalCount, shownCount } = useMultiFilters(fields, rows);
  const txCols = filterCols(fields, [
    'createdAt',
    'loginId',
    'displayName',
    'direction',
    'amountUsdt',
    'amountKrw',
    'balanceAfter',
    'refType',
  ]);

  async function load() {
    const data = await api<{
      partner: { name: string };
      transactions: any[];
    }>('/api/agent/transactions', { portal: 'agent' });
    setRows(data.transactions);
    setPartnerName(data.partner.name);
  }
  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : '로드 실패'));
  }, []);
  useEffect(() => {
    if (urlLoginId) setValue('loginId', urlLoginId);
  }, [urlLoginId, setValue]);

  return (
    <div>
      <h1 className="page-title">트랜잭션</h1>
      <p className="page-sub">
        {partnerName ? `${partnerName} 솔루션 회원 USDT·KRW 내역` : '솔루션 회원 USDT·KRW 내역'}
      </p>
      {error && <p className="error">{error}</p>}
      <div className="panel table-scroll">
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
            {filtered.map((t) => (
              <tr key={t.id}>
                <td>{formatKst(t.createdAt)}</td>
                <td>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => openMemberWindow('agent', t.loginId)}
                  >
                    {t.loginId}
                  </button>
                </td>
                <td>{t.displayName}</td>
                <td>
                  {t.direction === 'credit' ? '입금' : '출금'}
                  {t.asset ? ` · ${String(t.asset).toUpperCase()}` : ''}
                </td>
                <td className="col-amount">{t.amountUsdt != null ? formatNum(t.amountUsdt) : '—'}</td>
                <td className="col-amount">{t.amountKrw != null ? formatKrw(t.amountKrw) : '—'}</td>
                <td className="col-amount">
                  {t.asset === 'krw' ? formatKrw(t.balanceAfter) : formatNum(t.balanceAfter)}
                  {t.asset ? ` ${String(t.asset).toUpperCase()}` : ''}
                </td>
                <td>{t.refType}</td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={8}>
                  {rows.length ? '필터 조건에 맞는 내역이 없습니다.' : '내역이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AgentMembersPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const fields = useMemo<FilterFieldDef<any>[]>(
    () => [
      { key: 'loginId', label: '아이디', get: (r) => String(r.loginId ?? '') },
      { key: 'displayName', label: '이름', get: (r) => String(r.displayName ?? '') },
      { key: 'role', label: '역할', get: (r) => String(r.role ?? '') },
      { key: 'status', label: '상태', get: (r) => String(r.status ?? '') },
    ],
    [],
  );
  const { values, setValue, filtered, totalCount, shownCount } = useMultiFilters(fields, rows);
  const memberCols = filterCols(fields, ['loginId', 'displayName', 'role', 'status', null]);
  async function load() {
    const data = await api<{ members: any[] }>('/api/agent/members', { portal: 'agent' });
    setRows(data.members);
  }
  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : '로드 실패'));
  }, []);
  return (
    <div>
      <h1 className="page-title">회원</h1>
      <p className="page-sub">담당 솔루션에 매핑된 회원 목록입니다.</p>
      {error && <p className="error">{error}</p>}
      <div className="panel table-scroll">
        <TableCount shown={shownCount} total={totalCount} />
        <table>
          <thead>
            <ColumnFilterRow
              columns={memberCols}
              values={values}
              onChange={setValue}
            />
            <TableHeaderRow columns={memberCols} />
            </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id}>
                <td>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => openMemberWindow('agent', m.loginId)}
                  >
                    {m.loginId}
                  </button>
                </td>
                <td>{m.displayName}</td>
                <td>{m.role}</td>
                <td>
                  <span className={`badge ${statusBadge(m.status)}`}>{m.status}</span>
                </td>
                <td>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => openMemberWindow('agent', m.loginId, 'tx')}
                  >
                    트랜잭션
                  </button>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={5}>
                  {rows.length ? '필터 조건에 맞는 회원이 없습니다.' : '회원이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AgentSettlementsPage() {
  const [summary, setSummary] = useState<any | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [parentShares, setParentShares] = useState<any[]>([]);
  const [error, setError] = useState('');
  const fields = useMemo<FilterFieldDef<any>[]>(
    () => [
      { key: 'completedAt', label: '완료', get: (r) => formatKst(r.completedAt) },
      {
        key: 'period',
        label: '기간',
        get: (r) => periodRangeText(r.periodStart, r.periodEnd),
      },
      { key: 'grossKrw', label: '총입금', align: 'right', get: (r) => String(r.grossKrw ?? '') },
      { key: 'feePercent', label: '수수료%', align: 'right', get: (r) => String(r.feePercent ?? '') },
      { key: 'agentDueKrw', label: '지급액', align: 'right', get: (r) => String(r.agentDueKrw ?? '') },
    ],
    [],
  );
  const { values, setValue, filtered, totalCount, shownCount } = useMultiFilters(fields, rows);
  const shareFields = useMemo<FilterFieldDef<any>[]>(
    () => [
      { key: 'completedAt', label: '완료', get: (r) => formatKst(r.completedAt) },
      {
        key: 'source',
        label: '하부 솔루션',
        get: (r) => `${r.sourceName ?? ''} ${r.sourceCode ?? ''}`,
      },
      { key: 'ratePercent', label: '차등%', align: 'right', get: (r) => String(r.ratePercent ?? '') },
      { key: 'dueKrw', label: '금액', align: 'right', get: (r) => String(r.dueKrw ?? '') },
    ],
    [],
  );
  const shareFilter = useMultiFilters(shareFields, parentShares);
  const settlementCols = filterCols(fields, [
    'completedAt',
    'period',
    'grossKrw',
    'feePercent',
    'agentDueKrw',
  ]);
  const shareCols = filterCols(shareFields, ['completedAt', 'source', 'ratePercent', 'dueKrw']);
  useEffect(() => {
    void (async () => {
      try {
        const [s, h] = await Promise.all([
          api<any>('/api/agent/settlements/summary', { portal: 'agent' }),
          api<{ settlements: any[]; parentSharesReceived: any[] }>('/api/agent/settlements', {
            portal: 'agent',
          }),
        ]);
        setSummary(s);
        setRows(h.settlements);
        setParentShares(h.parentSharesReceived || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : '로드 실패');
      }
    })();
  }, []);
  return (
    <div>
      <h1 className="page-title">정산</h1>
      <p className="page-sub">
        담당 솔루션 회원 OTC 구매 기준 미정산·지급 예정액과, 하부 에이전트 수수료에서 받을 차등분을
        표시합니다. 실제 지급은 관리자 정산 완료 후 오프라인입니다.
      </p>
      {error && <p className="error">{error}</p>}
      {summary && (
        <div className="panel">
          <p className="setting-desc">
            {summary.partner?.name} ({summary.partner?.code}) · 플랫폼 수수료 {formatNum(summary.feePercent)}%
          </p>
          <div className="rate-grid">
            <div className="rate-card">
              <strong>미정산 입금</strong>
              <div className="rate-value" style={{ marginTop: '0.5rem' }}>
                <span className="rate-num">{formatKrw(summary.grossKrw)}</span>
                <span className="rate-unit">KRW · {summary.tradeCount}건</span>
              </div>
            </div>
            <div className="rate-card">
              <strong>본인 솔루션 받을 금액</strong>
              <div className="rate-value" style={{ marginTop: '0.5rem' }}>
                <span className="rate-num">{formatKrw(summary.agentDueKrw)}</span>
                <span className="rate-unit">KRW</span>
              </div>
            </div>
            <div className="rate-card active">
              <strong>하부에서 받을 금액</strong>
              <div className="rate-value" style={{ marginTop: '0.5rem' }}>
                <span className="rate-num">{formatKrw(summary.fromSubAgentsKrw ?? 0)}</span>
                <span className="rate-unit">KRW</span>
              </div>
            </div>
            <div className="rate-card">
              <strong>합계 받을 금액</strong>
              <div className="rate-value" style={{ marginTop: '0.5rem' }}>
                <span className="rate-num">{formatKrw(summary.totalReceivableKrw ?? summary.agentDueKrw)}</span>
                <span className="rate-unit">KRW</span>
              </div>
            </div>
          </div>
          {!!summary.fromSubAgents?.length && (
            <div className="table-scroll" style={{ marginTop: '1rem' }}>
              <h3 style={{ marginTop: 0 }}>하부 미정산 차등</h3>
              <table>
                <thead>
                  <tr>
                    <th>하부 솔루션</th>
                    <th className="col-amount">총입금</th>
                    <th className="col-amount">받을 차등</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.fromSubAgents.map((r: any) => (
                    <tr key={r.partnerId}>
                      <td>
                        {r.name} ({r.code})
                      </td>
                      <td className="col-amount">{formatKrw(r.grossKrw)}</td>
                      <td className="col-amount">{formatKrw(r.dueKrw)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <div className="panel table-scroll">
        <h3 style={{ marginTop: 0 }}>정산 이력 (본인 솔루션)</h3>
        <TableCount shown={shownCount} total={totalCount} />
        <table>
          <thead>
            <ColumnFilterRow
              columns={settlementCols}
              values={values}
              onChange={setValue}
            />
            <TableHeaderRow columns={settlementCols} />
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td>{formatKst(s.completedAt)}</td>
                <td>
                  <PeriodRange start={s.periodStart} end={s.periodEnd} />
                </td>
                <td className="col-amount">{formatKrw(s.grossKrw)}</td>
                <td className="col-amount">{formatNum(s.feePercent)}</td>
                <td className="col-amount">{formatKrw(s.agentDueKrw)}</td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={5}>
                  {rows.length ? '필터 조건에 맞는 이력이 없습니다.' : '이력이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="panel table-scroll">
        <h3 style={{ marginTop: 0 }}>하부 차등 수령 이력</h3>
        <TableCount shown={shareFilter.shownCount} total={shareFilter.totalCount} />
        <table>
          <thead>
            <ColumnFilterRow
              columns={shareCols}
              values={shareFilter.values}
              onChange={shareFilter.setValue}
            />
            <TableHeaderRow columns={shareCols} />
            </thead>
          <tbody>
            {shareFilter.filtered.map((s) => (
              <tr key={s.id}>
                <td>{formatKst(s.completedAt)}</td>
                <td>
                  {s.sourceName} ({s.sourceCode})
                </td>
                <td className="col-amount">{formatNum(s.ratePercent)}</td>
                <td className="col-amount">{formatKrw(s.dueKrw)}</td>
              </tr>
            ))}
            {!shareFilter.filtered.length && (
              <tr>
                <td colSpan={4}>
                  {parentShares.length
                    ? '필터 조건에 맞는 이력이 없습니다.'
                    : '하부 차등 수령 이력이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
