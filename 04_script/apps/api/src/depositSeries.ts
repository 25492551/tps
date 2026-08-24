import { query } from './db.js';

export type DepositSeriesPartner = {
  partnerId: string;
  code: string;
  name: string;
  amounts: number[];
};

export type DepositSeriesResult = {
  days: number;
  periodStart: string;
  periodEnd: string;
  labels: string[];
  series: DepositSeriesPartner[];
};

const ALLOWED_DAYS = new Set([1, 7, 30, 90]);

export function parseSeriesDays(raw: unknown, fallback = 7): number {
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  if (ALLOWED_DAYS.has(n)) return n;
  return fallback;
}

function ymdKst(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Inclusive KST calendar window ending today: [today-(days-1), today]. */
export function kstSeriesBounds(days: number): { from: Date; to: Date; labels: string[] } {
  const today = ymdKst(new Date());
  const todayStart = new Date(`${today}T00:00:00+09:00`);
  const from = new Date(todayStart.getTime() - (days - 1) * 86400000);
  const to = new Date(todayStart.getTime() + 86400000);
  const labels: string[] = [];
  for (let i = 0; i < days; i++) {
    labels.push(ymdKst(new Date(from.getTime() + i * 86400000)));
  }
  return { from, to, labels };
}

/**
 * Daily completed buy_from_admin KRW totals per solution (KST calendar days).
 * When partnerId is set, only that solution is returned.
 */
export async function loadDepositSeries(opts: {
  days: number;
  partnerId?: string | null;
}): Promise<DepositSeriesResult> {
  const days = ALLOWED_DAYS.has(opts.days) ? opts.days : 7;
  const { from, to, labels } = kstSeriesBounds(days);
  const partnerId = opts.partnerId ?? null;

  const partners = partnerId
    ? await query<{ id: string; code: string; name: string }>(
        `SELECT id, code, name FROM partners WHERE id = $1 AND status = 'active'`,
        [partnerId],
      )
    : await query<{ id: string; code: string; name: string }>(
        `SELECT id, code, name FROM partners WHERE status = 'active' ORDER BY code`,
      );

  const totals = await query<{ partner_id: string; day_kst: string; total: string }>(
    `SELECT pm.partner_id,
            to_char((t.updated_at AT TIME ZONE 'Asia/Seoul'), 'YYYY-MM-DD') AS day_kst,
            COALESCE(SUM(t.amount_krw), 0)::text AS total
     FROM trades t
     JOIN partner_members pm ON pm.user_id = t.buyer_user_id
     WHERE t.kind = 'buy_from_admin'
       AND t.status = 'completed'
       AND t.updated_at >= $1
       AND t.updated_at < $2
       AND ($3::uuid IS NULL OR pm.partner_id = $3)
     GROUP BY pm.partner_id, day_kst`,
    [from.toISOString(), to.toISOString(), partnerId],
  );

  const byPartner = new Map<string, Map<string, number>>();
  for (const row of totals.rows) {
    let dayMap = byPartner.get(row.partner_id);
    if (!dayMap) {
      dayMap = new Map();
      byPartner.set(row.partner_id, dayMap);
    }
    dayMap.set(row.day_kst, Math.round(Number(row.total) || 0));
  }

  const series: DepositSeriesPartner[] = partners.rows.map((p) => {
    const dayMap = byPartner.get(p.id) ?? new Map();
    return {
      partnerId: p.id,
      code: p.code,
      name: p.name,
      amounts: labels.map((d) => dayMap.get(d) ?? 0),
    };
  });

  return {
    days,
    periodStart: from.toISOString(),
    periodEnd: to.toISOString(),
    labels,
    series,
  };
}
