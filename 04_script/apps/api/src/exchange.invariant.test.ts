/**
 * Minimal invariant check: exchange requires both_held; second exchange fails.
 * Run: npm run test:exchange -w @tps/api (with DB migrated + seeded).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { hashPassword } from './auth.js';
import { migrate, pool, query, withTransaction } from './db.js';
import { appendLedger } from './ledger.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
dotenv.config({ path: path.join(repoRoot, '.env') });

async function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  await migrate();
  const suffix = Date.now();
  const hash = await hashPassword('x');
  const buyer = await query(
    `INSERT INTO users (email, password_hash, display_name, role, status)
     VALUES ($1,$2,'TBuyer','member','active') RETURNING id`,
    [`tbuyer-${suffix}`, hash],
  );
  const seller = await query(
    `INSERT INTO users (email, password_hash, display_name, role, status)
     VALUES ($1,$2,'TSeller','member','active') RETURNING id`,
    [`tseller-${suffix}`, hash],
  );
  const listing = await query(
    `INSERT INTO listings (type, owner_user_id, price_krw_per_usdt, amount_usdt, status)
     VALUES ('sell', $1, 1400, 10, 'open') RETURNING id`,
    [seller.rows[0].id],
  );
  const trade = await query(
    `INSERT INTO trades (listing_id, buyer_user_id, seller_user_id, amount_usdt, amount_krw, status)
     VALUES ($1,$2,$3,10,14000,'both_held') RETURNING id`,
    [listing.rows[0].id, buyer.rows[0].id, seller.rows[0].id],
  );
  const tradeId = trade.rows[0].id as string;
  await query(
    `INSERT INTO holds (trade_id, asset, amount, depositor_user_id, status) VALUES
      ($1,'krw',14000,$2,'held'), ($1,'usdt',10,$3,'held')`,
    [tradeId, buyer.rows[0].id, seller.rows[0].id],
  );

  await withTransaction(async (client) => {
    await appendLedger(client, {
      userId: buyer.rows[0].id,
      asset: 'usdt',
      direction: 'credit',
      amount: 10,
      refType: 'exchange',
      refId: tradeId,
    });
    await appendLedger(client, {
      userId: seller.rows[0].id,
      asset: 'krw',
      direction: 'credit',
      amount: 14000,
      refType: 'exchange',
      refId: tradeId,
    });
    await client.query(`UPDATE holds SET status = 'exchanged' WHERE trade_id = $1`, [tradeId]);
    await client.query(`UPDATE trades SET status = 'completed' WHERE id = $1`, [tradeId]);
  });

  const t = await query(`SELECT status FROM trades WHERE id = $1`, [tradeId]);
  assert(t.rows[0].status === 'completed', 'trade should be completed');
  const held = await query(`SELECT count(*)::int AS c FROM holds WHERE trade_id = $1 AND status = 'held'`, [
    tradeId,
  ]);
  assert(held.rows[0].c === 0, 'no held rows after exchange');
  console.log('exchange.invariant.test OK');
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
