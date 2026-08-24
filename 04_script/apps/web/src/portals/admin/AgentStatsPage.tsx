import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, formatKrw, formatNum } from '../../lib/api';
import {
  ColumnFilterRow,
  TableCount,
  TableHeaderRow,
  filterCols,
  useMultiFilters,
  type FilterFieldDef,
} from '../../lib/tableFilters';

function kstDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+09:00`);
}
function kstDayEndExclusive(ymd: string): Date {
  return new Date(kstDayStart(ymd).getTime() + 86400000);
}
function todayYmdKst() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function AdminAgentStatsPage() {
  const [fromYmd, setFromYmd] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  });
  const [toYmd, setToYmd] = useState(todayYmdKst);
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const statRows = data?.rows || [];
  const fields = useMemo<FilterFieldDef<any>[]>(
    () => [
      { key: 'name', label: '솔루션', get: (r) => `${r.name ?? ''} ${r.code ?? ''}` },
      { key: 'agentLoginId', label: '에이전트', get: (r) => String(r.agentLoginId ?? '') },
      { key: 'feePercent', label: '수수료%', align: 'right', get: (r) => String(r.feePercent ?? '') },
      { key: 'grossKrw', label: '총입금', align: 'right', get: (r) => String(r.grossKrw ?? '') },
      { key: 'tradeCount', label: '건수', align: 'right', get: (r) => String(r.tradeCount ?? '') },
      { key: 'agentDueKrw', label: '에이전트 지급', align: 'right', get: (r) => String(r.agentDueKrw ?? '') },
      { key: 'totalFeeKrw', label: '수수료 풀', align: 'right', get: (r) => String(r.totalFeeKrw ?? '') },
      { key: 'adminFeeKrw', label: '관리자 몫', align: 'right', get: (r) => String(r.adminFeeKrw ?? '') },
      {
        key: 'parentShares',
        label: '상부 차등',
        get: (r) =>
          (r.parentShares || [])
            .map((s: any) => `${s.name ?? ''} ${s.ratePercent ?? ''} ${s.dueKrw ?? ''}`)
            .join(' '),
      },
    ],
    [],
  );
  const { values, setValue, filtered, totalCount, shownCount } = useMultiFilters(fields, statRows);
  const statCols = filterCols(fields, [
    'name',
    'agentLoginId',
    'feePercent',
    'grossKrw',
    'tradeCount',
    'agentDueKrw',
    'totalFeeKrw',
    'adminFeeKrw',
    'parentShares',
  ]);

  async function load(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const from = kstDayStart(fromYmd);
      const to = kstDayEndExclusive(toYmd);
      const d = await api<any>(
        `/api/admin/agent-stats?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
      );
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : '로드 실패');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <h1 className="page-title">에이전트 통계</h1>
      <p className="page-sub">
        기간 내 솔루션별 OTC 구매 실적과 수수료 분배(에이전트 지급 · 상부 차등 · 관리자 몫)를 봅니다.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="panel">
        <form className="row" onSubmit={load} style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label>
            시작일 (KST)
            <input type="date" value={fromYmd} onChange={(e) => setFromYmd(e.target.value)} required />
          </label>
          <label>
            종료일 (KST)
            <input type="date" value={toYmd} onChange={(e) => setToYmd(e.target.value)} required />
          </label>
          <button type="submit" disabled={busy}>
            조회
          </button>
        </form>
      </div>
      {data && (
        <>
          <div className="panel agent-stats-totals">
            <div className="agent-stats-total">
              <span className="agent-stats-total-label">총 입금</span>
              <span className="rate-num">{formatKrw(data.totals.grossKrw)}</span>
            </div>
            <div className="agent-stats-total">
              <span className="agent-stats-total-label">에이전트 지급 합</span>
              <span className="rate-num">{formatKrw(data.totals.agentDueKrw)}</span>
            </div>
            <div className="agent-stats-total">
              <span className="agent-stats-total-label">관리자 수수료 합</span>
              <span className="rate-num">{formatKrw(data.totals.adminFeeKrw)}</span>
            </div>
          </div>
          <div className="panel table-scroll">
            <TableCount shown={shownCount} total={totalCount} />
            <table>
              <thead>
                <ColumnFilterRow
                  columns={statCols}
                  values={values}
                  onChange={setValue}
                />
                <TableHeaderRow columns={statCols} />
                </thead>
              <tbody>
                {filtered.map((r: any) => (
                  <tr key={r.partnerId}>
                    <td>
                      {r.name} ({r.code})
                    </td>
                    <td>{r.agentLoginId || '—'}</td>
                    <td className="col-amount">{formatNum(r.feePercent)}</td>
                    <td className="col-amount">{formatKrw(r.grossKrw)}</td>
                    <td className="col-amount">{r.tradeCount}</td>
                    <td className="col-amount">{formatKrw(r.agentDueKrw)}</td>
                    <td className="col-amount">{formatKrw(r.totalFeeKrw)}</td>
                    <td className="col-amount">{formatKrw(r.adminFeeKrw)}</td>
                    <td>
                      {r.parentShares?.length
                        ? r.parentShares
                            .map(
                              (s: any) =>
                                `${s.name} ${formatNum(s.ratePercent)}% → ${formatKrw(s.dueKrw)}`,
                            )
                            .join(' · ')
                        : '—'}
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr>
                    <td colSpan={9}>
                      {statRows.length ? '필터 조건에 맞는 데이터가 없습니다.' : '데이터가 없습니다.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
