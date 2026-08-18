import type { PoolClient } from 'pg';
import { query } from './db.js';

type Asset = 'krw' | 'usdt';
type Direction = 'credit' | 'debit';

export async function getBalance(userId: string, asset: Asset, client?: PoolClient) {
  const r = client
    ? await client.query<{ balance: string }>(
        `SELECT COALESCE(
           (SELECT balance_after FROM ledger_entries
            WHERE user_id = $1 AND asset = $2
            ORDER BY seq DESC LIMIT 1),
           0
         ) AS balance`,
        [userId, asset],
      )
    : await query<{ balance: string }>(
        `SELECT COALESCE(
           (SELECT balance_after FROM ledger_entries
            WHERE user_id = $1 AND asset = $2
            ORDER BY seq DESC LIMIT 1),
           0
         ) AS balance`,
        [userId, asset],
      );
  return Number(r.rows[0]?.balance ?? 0);
}

export async function appendLedger(
  client: PoolClient,
  opts: {
    userId: string;
    asset: Asset;
    direction: Direction;
    amount: number;
    refType: string;
    refId?: string | null;
    note?: string;
  },
) {
  const balR = await client.query<{ balance: string }>(
    `SELECT COALESCE(
       (SELECT balance_after FROM ledger_entries
        WHERE user_id = $1 AND asset = $2
        ORDER BY seq DESC LIMIT 1),
       0
     ) AS balance`,
    [opts.userId, opts.asset],
  );
  const current = Number(balR.rows[0]?.balance ?? 0);
  const next =
    opts.direction === 'credit' ? current + opts.amount : current - opts.amount;
  if (next < -0.0000001) {
    throw new Error(`Insufficient ${opts.asset} balance`);
  }
  const r = await client.query(
    `INSERT INTO ledger_entries
      (user_id, asset, direction, amount, balance_after, ref_type, ref_id, note, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, clock_timestamp())
     RETURNING *`,
    [
      opts.userId,
      opts.asset,
      opts.direction,
      opts.amount,
      next,
      opts.refType,
      opts.refId ?? null,
      opts.note ?? '',
    ],
  );
  return r.rows[0];
}

export async function audit(
  actorUserId: string | null,
  action: string,
  payload: Record<string, unknown> = {},
) {
  await query(
    `INSERT INTO admin_audit_logs (actor_user_id, action, payload) VALUES ($1,$2,$3)`,
    [actorUserId, action, JSON.stringify(payload)],
  );
}
