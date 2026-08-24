import type pg from 'pg';
import fs from 'node:fs';
import { query, withTransaction } from './db.js';
import { appendLedger } from './ledger.js';
import { loadDefaultCustodyHotWallet } from './otcWallets.js';
import { transferTronUsdt } from './tronTransfer.js';

// #region agent log
function dbg(hypothesisId: string, location: string, message: string, data: Record<string, unknown> = {}) {
  const line = JSON.stringify({
    sessionId: '307f1d',
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  });
  try {
    fs.appendFileSync('/tmp/debug-307f1d.log', `${line}\n`);
  } catch {
    /* ignore */
  }
  fetch('http://127.0.0.1:7603/ingest/16484438-b468-4662-a4bc-8cd4b1e4f72a', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '307f1d' },
    body: line,
  }).catch(() => {});
}
// #endregion

type TradeRow = {
  id: string;
  kind: string | null;
  buyer_user_id: string;
  seller_user_id: string;
  amount_usdt: string;
  amount_krw: string;
  status: string;
};

async function markDepositReceived(
  client: pg.PoolClient,
  trade: TradeRow,
  side: 'buyer_krw' | 'seller_usdt',
  adminId: string,
  opts: { txRef?: string; proofNote?: string },
) {
  const depR = await client.query(
    `SELECT * FROM deposit_intents WHERE trade_id = $1 AND side = $2 FOR UPDATE`,
    [trade.id, side],
  );
  const dep = depR.rows[0];
  if (!dep) throw new Error('Deposit intent missing');
  if (dep.status !== 'received') {
    await client.query(
      `UPDATE deposit_intents SET status = 'received', tx_ref = COALESCE(NULLIF($2,''), tx_ref),
         proof_note = COALESCE(NULLIF($3,''), proof_note),
         confirmed_by = $4, confirmed_at = now()
       WHERE id = $1`,
      [dep.id, opts.txRef ?? '', opts.proofNote ?? '', adminId],
    );
    const asset = side === 'buyer_krw' ? 'krw' : 'usdt';
    const depositor = side === 'buyer_krw' ? trade.buyer_user_id : trade.seller_user_id;
    await client.query(
      `INSERT INTO holds (trade_id, asset, amount, depositor_user_id, status)
       VALUES ($1,$2,$3,$4,'held')
       ON CONFLICT (trade_id, asset) DO UPDATE SET status = 'held', amount = EXCLUDED.amount`,
      [trade.id, asset, Number(dep.expected_amount), depositor],
    );
  }
}

/** Resolve on-chain destination for sell inventory sweep (hot custody → cold). */
export async function loadSellSweepAddress(): Promise<string | null> {
  const fromEnv = (process.env.OTC_SELL_SWEEP_ADDRESS || '').trim();
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(fromEnv)) return fromEnv;
  const r = await query<{ address: string }>(
    `SELECT address FROM tether_wallets
     WHERE is_custody = true AND status = 'active' AND is_default = false
       AND private_key_enc IS NOT NULL
     ORDER BY created_at ASC
     LIMIT 1`,
  );
  return r.rows[0]?.address ?? null;
}

/** Admin confirmed KRW → credit USDT on internal ledger (no on-chain). */
export async function settleOtcBuyLedger(
  tradeId: string,
  adminId: string,
  opts: { txRef?: string; proofNote?: string } = {},
) {
  return withTransaction(async (client) => {
    const tradeR = await client.query(`SELECT * FROM trades WHERE id = $1 FOR UPDATE`, [tradeId]);
    const trade = tradeR.rows[0] as TradeRow | undefined;
    if (!trade) throw new Error('Trade not found');
    if (trade.kind !== 'buy_from_admin') throw new Error('Trade kind mismatch');
    if (trade.status === 'completed') throw new Error('Trade is closed');
    if (trade.status === 'cancelled') throw new Error('Trade is closed');
    if (!['awaiting_user_deposit', 'awaiting_admin_payout', 'krw_confirmed'].includes(trade.status)) {
      throw new Error(`Cannot settle buy from status ${trade.status}`);
    }

    await markDepositReceived(client, trade, 'buyer_krw', adminId, opts);
    await appendLedger(client, {
      userId: trade.buyer_user_id,
      asset: 'usdt',
      direction: 'credit',
      amount: Number(trade.amount_usdt),
      refType: 'otc_buy',
      refId: trade.id,
      note: 'USDT 구매 완료',
    });
    await client.query(
      `UPDATE holds SET status = 'exchanged', updated_at = now() WHERE trade_id = $1 AND status = 'held'`,
      [trade.id],
    );
    await client.query(
      `UPDATE trades SET status = 'completed', updated_at = now() WHERE id = $1`,
      [trade.id],
    );
    return { tradeId: trade.id, status: 'completed' as const };
  });
}

async function beginSellSettle(
  tradeId: string,
  adminId: string,
  opts: { txRef?: string; proofNote?: string },
): Promise<TradeRow> {
  return withTransaction(async (client) => {
    const tradeR = await client.query(`SELECT * FROM trades WHERE id = $1 FOR UPDATE`, [tradeId]);
    const trade = tradeR.rows[0] as TradeRow | undefined;
    if (!trade) throw new Error('Trade not found');
    if (trade.kind !== 'sell_to_admin') throw new Error('Trade kind mismatch');
    if (trade.status === 'completed') throw new Error('Trade is closed');
    if (trade.status === 'cancelled') throw new Error('Trade is closed');
    if (trade.status === 'settling_onchain') return trade;

    if (
      !['awaiting_user_deposit', 'awaiting_admin_payout', 'usdt_confirmed'].includes(trade.status)
    ) {
      throw new Error(`Cannot settle sell from status ${trade.status}`);
    }
    await markDepositReceived(client, trade, 'seller_usdt', adminId, opts);
    await client.query(
      `UPDATE trades SET status = 'settling_onchain', updated_at = now() WHERE id = $1`,
      [trade.id],
    );
    return { ...trade, status: 'settling_onchain' };
  });
}

async function failSellSettle(tradeId: string) {
  await query(
    `UPDATE trades SET status = 'awaiting_admin_payout', updated_at = now()
     WHERE id = $1 AND status = 'settling_onchain'`,
    [tradeId],
  );
}

/**
 * Sell (USDT→KRW): ledger already holds USDT from order create.
 * If a cold/sweep custody wallet (or OTC_SELL_SWEEP_ADDRESS) exists, attempt hot→cold on-chain.
 * Otherwise complete as **ledger-only** (KRW still paid off-platform by admin).
 */
export async function settleOtcSellOnChain(
  tradeId: string,
  adminId: string,
  opts: { txRef?: string; proofNote?: string } = {},
) {
  // #region agent log
  dbg('A', 'otcSettle.ts:settleOtcSellOnChain:entry', 'sell settle start', {
    tradeId,
    adminIdPrefix: adminId.slice(0, 8),
  });
  // #endregion
  const trade = await beginSellSettle(tradeId, adminId, opts);
  // #region agent log
  dbg('C', 'otcSettle.ts:afterBeginSellSettle', 'trade after begin', {
    tradeId: trade.id,
    status: trade.status,
    amountUsdt: trade.amount_usdt,
  });
  // #endregion
  const sweepTo = await loadSellSweepAddress();
  // #region agent log
  dbg('A', 'otcSettle.ts:loadSellSweepAddress', 'sweep target resolved', {
    hasSweepTo: !!sweepTo,
    sweepToPrefix: sweepTo ? sweepTo.slice(0, 8) : null,
  });
  // #endregion

  async function completeLedgerOnly(note: string) {
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE holds SET status = 'exchanged', updated_at = now() WHERE trade_id = $1 AND status = 'held'`,
        [trade.id],
      );
      await client.query(
        `UPDATE deposit_intents SET proof_note = COALESCE(NULLIF(proof_note,''), $2)
         WHERE trade_id = $1 AND side = 'seller_usdt'`,
        [trade.id, note],
      );
      await client.query(
        `UPDATE trades SET status = 'completed', updated_at = now()
         WHERE id = $1 AND status = 'settling_onchain'`,
        [trade.id],
      );
    });
    // #region agent log
    dbg('A', 'otcSettle.ts:ledgerOnlyComplete', 'sell completed ledger-only', {
      tradeId: trade.id,
      note,
    });
    // #endregion
    return {
      tradeId: trade.id,
      status: 'completed' as const,
      onchainTxId: null as string | null,
      fromAddress: null as string | null,
      toAddress: null as string | null,
      ledgerOnly: true as const,
    };
  }

  if (!sweepTo) {
    return completeLedgerOnly('ledger-only settle (no cold/sweep wallet)');
  }

  try {
    const custody = await loadDefaultCustodyHotWallet();
    if (custody.address === sweepTo) {
      // #region agent log
      dbg('A', 'otcSettle.ts:sweepEqualsHot', 'fallback ledger-only', { tradeId: trade.id });
      // #endregion
      return completeLedgerOnly('ledger-only settle (sweep equals hot wallet)');
    }
    // #region agent log
    dbg('E', 'otcSettle.ts:beforeTransfer', 'about to transferTronUsdt', {
      fromPrefix: custody.address.slice(0, 8),
      toPrefix: sweepTo.slice(0, 8),
      amountUsdt: Number(trade.amount_usdt),
    });
    // #endregion
    const sent = await transferTronUsdt({
      fromPrivateKeyHex: custody.privateKeyHex,
      toAddress: sweepTo,
      amountUsdt: Number(trade.amount_usdt),
    });

    await withTransaction(async (client) => {
      // Platform manages USDT only — KRW payout is off-platform (admin bank transfer).
      await client.query(
        `UPDATE holds SET status = 'exchanged', updated_at = now() WHERE trade_id = $1 AND status = 'held'`,
        [trade.id],
      );
      await client.query(
        `UPDATE deposit_intents SET tx_ref = COALESCE(NULLIF(tx_ref,''), $2)
         WHERE trade_id = $1 AND side = 'seller_usdt'`,
        [trade.id, sent.txId],
      );
      await client.query(
        `UPDATE trades SET status = 'completed', onchain_txid = $2, updated_at = now()
         WHERE id = $1 AND status = 'settling_onchain'`,
        [trade.id, sent.txId],
      );
    });

    return {
      tradeId: trade.id,
      status: 'completed' as const,
      onchainTxId: sent.txId,
      fromAddress: sent.fromAddress,
      toAddress: sent.toAddress,
      ledgerOnly: false as const,
    };
  } catch (e) {
    await failSellSettle(tradeId);
    // #region agent log
    dbg('E', 'otcSettle.ts:transferCatch', 'sell settle failed', {
      tradeId,
      err: e instanceof Error ? e.message : String(e),
    });
    // #endregion
    throw e;
  }
}

/** @deprecated name kept for imports — buy is ledger-only now */
export async function settleOtcBuyOnChain(
  tradeId: string,
  adminId: string,
  opts: { txRef?: string; proofNote?: string } = {},
) {
  return settleOtcBuyLedger(tradeId, adminId, opts);
}
