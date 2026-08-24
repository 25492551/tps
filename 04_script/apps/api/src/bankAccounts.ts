import type pg from 'pg';
import { query } from './db.js';

/** Disable all active user bank accounts except optional keepId. */
export async function disableOtherActiveBanks(
  userId: string,
  keepId?: string | null,
  client?: pg.PoolClient,
) {
  const run = client
    ? (text: string, params?: unknown[]) => client.query(text, params)
    : query;
  if (keepId) {
    await run(
      `UPDATE bank_accounts SET status = 'disabled'
       WHERE user_id = $1 AND is_custody = false AND status = 'active' AND id <> $2`,
      [userId, keepId],
    );
  } else {
    await run(
      `UPDATE bank_accounts SET status = 'disabled'
       WHERE user_id = $1 AND is_custody = false AND status = 'active'`,
      [userId],
    );
  }
}
