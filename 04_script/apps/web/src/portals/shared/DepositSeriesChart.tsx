import { useEffect, useMemo, useState } from 'react';
import { api, formatKrw } from '../../lib/api';

export type DepositSeriesPayload = {
  days: number;
  labels: string[];
  series: {
    partnerId: string;
    code: string;
    name: string;
    amounts: number[];
  }[];
};

const PERIOD_OPTIONS = [
  { days: 1, label: '1일' },
  { days: 7, label: '1주' },
  { days: 30, label: '1개월' },
  { days: 90, label: '3개월' },
] as const;

/** Achromatic strokes distinguishable on dark chrome. */
const STROKES = ['#ececec', '#b8b8b8', '#8f8f8f', '#6e6e6e', '#cfcfcf', '#9a9a9a', '#7a7a7a'];

type Props = {
  /** API path without query, e.g. `/api/admin/deposit-series` */
  endpoint: string;
  portal?: 'admin' | 'agent' | 'user';
  title?: string;
  subtitle?: string;
};

function shortLabel(ymd: string, days: number): string {
  const m = ymd.slice(5); // MM-DD
  if (days <= 7) return m;
  if (days <= 30) {
    const day = Number(ymd.slice(8));
    return day === 1 || day % 5 === 0 ? m : '';
  }
  const day = Number(ymd.slice(8));
  return day === 1 || day === 15 ? m : '';
}

export function DepositSeriesChart({
  endpoint,
  portal,
  title = '솔루션별 유저 입금',
  subtitle = '완료된 테더 구매(KRW) · 일별 · KST',
}: Props) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<DepositSeriesPayload | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setBusy(true);
      setError('');
      try {
        const d = await api<DepositSeriesPayload>(`${endpoint}?days=${days}`, {
          portal,
        });
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) {
          setData(null);
          setError(e instanceof Error ? e.message : '로드 실패');
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [endpoint, portal, days]);

  const chart = useMemo(() => {
    if (!data || data.labels.length === 0) return null;
    const w = 640;
    const h = 220;
    const pad = { t: 16, r: 16, b: 36, l: 56 };
    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;
    const maxVal = Math.max(1, ...data.series.flatMap((s) => s.amounts));
    const n = data.labels.length;
    const xAt = (i: number) => pad.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const yAt = (v: number) => pad.t + innerH - (v / maxVal) * innerH;
    const gridYs = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
      y: pad.t + innerH * (1 - t),
      label: formatKrw(Math.round(maxVal * t)),
    }));
    const paths = data.series.map((s, si) => {
      const pts = s.amounts.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`);
      return {
        ...s,
        d: pts.join(' '),
        stroke: STROKES[si % STROKES.length],
        dash: si % 3 === 1 ? '6 4' : si % 3 === 2 ? '2 3' : undefined,
      };
    });
    return { w, h, pad, innerW, innerH, maxVal, xAt, yAt, gridYs, paths, n };
  }, [data]);

  return (
    <div className="panel deposit-series">
      <div className="panel-head">
        <h2 className="section-title">{title}</h2>
        <div className="panel-head-actions">
          <label className="deposit-series-period">
            기간
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              disabled={busy}
              aria-label="조회 기간"
            >
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.days} value={o.days}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <p className="setting-desc" style={{ marginTop: '0.35rem' }}>
        {subtitle}
      </p>
      {error && <p className="error">{error}</p>}
      {!error && data && data.series.length === 0 && (
        <p className="muted">표시할 솔루션이 없습니다.</p>
      )}
      {!error && chart && data && data.series.length > 0 && (
        <>
          <div className="deposit-series-chart-wrap">
            <svg
              className="deposit-series-svg"
              viewBox={`0 0 ${chart.w} ${chart.h}`}
              role="img"
              aria-label={title}
              onMouseLeave={() => setHover(null)}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const sx = ((e.clientX - rect.left) / rect.width) * chart.w;
                let best = 0;
                let bestDist = Infinity;
                for (let i = 0; i < chart.n; i++) {
                  const dist = Math.abs(chart.xAt(i) - sx);
                  if (dist < bestDist) {
                    bestDist = dist;
                    best = i;
                  }
                }
                setHover({ i: best, x: chart.xAt(best), y: e.clientY - rect.top });
              }}
            >
              {chart.gridYs.map((g, i) => (
                <g key={i}>
                  <line
                    x1={chart.pad.l}
                    x2={chart.w - chart.pad.r}
                    y1={g.y}
                    y2={g.y}
                    className="deposit-series-grid"
                  />
                  <text x={chart.pad.l - 8} y={g.y + 3} textAnchor="end" className="deposit-series-axis">
                    {g.label}
                  </text>
                </g>
              ))}
              {chart.paths.map((p) => (
                <path
                  key={p.partnerId}
                  d={p.d}
                  fill="none"
                  stroke={p.stroke}
                  strokeWidth={2}
                  strokeDasharray={p.dash}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              {hover && (
                <line
                  x1={hover.x}
                  x2={hover.x}
                  y1={chart.pad.t}
                  y2={chart.h - chart.pad.b}
                  className="deposit-series-crosshair"
                />
              )}
              {data.labels.map((lab, i) => {
                const t = shortLabel(lab, data.days);
                if (!t) return null;
                return (
                  <text
                    key={lab}
                    x={chart.xAt(i)}
                    y={chart.h - 12}
                    textAnchor="middle"
                    className="deposit-series-axis"
                  >
                    {t}
                  </text>
                );
              })}
            </svg>
            {hover && data.labels[hover.i] && (
              <div
                className="deposit-series-tip"
                style={{
                  left: `${(hover.x / chart.w) * 100}%`,
                }}
              >
                <strong>{data.labels[hover.i]}</strong>
                <ul>
                  {data.series.map((s, si) => (
                    <li key={s.partnerId}>
                      <span
                        className="deposit-series-swatch"
                        style={{ background: STROKES[si % STROKES.length] }}
                      />
                      {s.name}: {formatKrw(s.amounts[hover.i] ?? 0)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <ul className="deposit-series-legend">
            {chart.paths.map((p) => {
              const sum = p.amounts.reduce((a, b) => a + b, 0);
              return (
                <li key={p.partnerId}>
                  <span className="deposit-series-swatch" style={{ background: p.stroke }} />
                  <span>
                    {p.name} ({p.code})
                  </span>
                  <span className="muted">{formatKrw(sum)}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {busy && !data && <p className="muted">불러오는 중…</p>}
    </div>
  );
}
