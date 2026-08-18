import type pg from 'pg';
import { query, withTransaction } from './db.js';
import { appendLedger } from './ledger.js';
import { loadDefaultCustodyHotWallet } from './otcWallets.js';
import { transferTronUsdt } from './tronTransfer.js';

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
 * Real on-chain: sweep amount from default custody hot → cold/sweep address.
 * Then credit KRW ledger.
 */
export async function settleOtcSellOnChain(
  tradeId: string,
  adminId: string,
  opts: { txRef?: string; proofNote?: string } = {},
) {
  const trade = await beginSellSettle(tradeId, adminId, opts);
  const sweepTo = await loadSellSweepAddress();
  if (!sweepTo) {
    await failSellSettle(tradeId);
    throw new Error(
      '판매 온체인 정산 대상(콜드) 지갑이 없습니다. OTC_SELL_SWEEP_ADDRESS 또는 기본이 아닌 커스터디 지갑을 추가하세요.',
    );
  }

  try {
    const custody = await loadDefaultCustodyHotWallet();
    if (custody.address === sweepTo) {
      throw new Error('Sell sweep address must differ from default custody wallet');
    }
    const sent = await transferTronUsdt({
      fromPrivateKeyHex: custody.privateKeyHex,
      toAddress: sweepTo,
      amountUsdt: Number(trade.amount_usdt),
    });

    await withTransaction(async (client) => {
      await appendLedger(client, {
        userId: trade.seller_user_id,
        asset: 'krw',
        direction: 'credit',
        amount: Number(trade.amount_krw),
        refType: 'otc_sell',
        refId: trade.id,
        note: 'USDT→KRW 환전 완료',
      });
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
    };
  } catch (e) {
    await failSellSettle(tradeId);
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
