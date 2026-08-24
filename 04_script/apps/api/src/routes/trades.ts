import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { appendLedger, audit } from '../ledger.js';
import {
  requireActiveTrader,
  requireAdmin,
  requireAuth,
  type AuthedRequest,
} from '../middleware.js';
import { settleOtcBuyLedger, settleOtcSellOnChain } from '../otcSettle.js';

export const tradesRouter = Router();

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

type TradeRow = {
  id: string;
  listing_id: string | null;
  kind: string | null;
  buyer_user_id: string;
  seller_user_id: string;
  amount_usdt: string;
  amount_krw: string;
  price_krw_per_usdt: string | null;
  status: string;
};

async function loadTrade(id: string) {
  const result = await query<TradeRow>(`SELECT * FROM trades WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

async function tradeBundle(id: string, viewer?: { id: string; role: string }) {
  const trade = await loadTrade(id);
  if (!trade) return null;
  const deposits = await query(`SELECT * FROM deposit_intents WHERE trade_id = $1`, [id]);
  const holds = await query(`SELECT * FROM holds WHERE trade_id = $1`, [id]);
  const custodyBanks = await query(
    `SELECT id, bank_name, account_no, holder_name FROM bank_accounts WHERE is_custody = true AND status = 'active' LIMIT 1`,
  );
  const isAdmin = viewer?.role === 'admin';
  let custodyWallet: { id: string; chain: string; address?: string; label: string } | null = null;
  if (isAdmin) {
    const custodyWallets = await query<{ id: string; chain: string; address: string; label: string }>(
      `SELECT id, chain, address, label FROM tether_wallets
       WHERE is_custody = true AND status = 'active'
       ORDER BY is_default DESC, created_at ASC
       LIMIT 1`,
    );
    custodyWallet = custodyWallets.rows[0] ?? null;
  }
  return {
    trade,
    deposits: deposits.rows,
    holds: holds.rows,
    custody: {
      bank: custodyBanks.rows[0] ?? null,
      wallet: custodyWallet,
    },
  };
}

function canViewTrade(user: { id: string; role: string }, trade: { buyer_user_id: string; seller_user_id: string }) {
  return user.role === 'admin' || user.id === trade.buyer_user_id || user.id === trade.seller_user_id;
}

function isOtc(kind: string | null | undefined) {
  return kind === 'buy_from_admin' || kind === 'sell_to_admin';
}

tradesRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const result =
    req.user!.role === 'admin'
      ? await query(`SELECT * FROM trades ORDER BY created_at DESC LIMIT 200`)
      : await query(
          `SELECT * FROM trades
           WHERE buyer_user_id = $1 OR seller_user_id = $1
           ORDER BY created_at DESC LIMIT 200`,
          [req.user!.id],
        );
  res.json({ trades: result.rows });
});

tradesRouter.get('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const bundle = await tradeBundle(paramId(req.params.id), req.user!);
  if (!bundle) {
    res.status(404).json({ error: 'Trade not found' });
    return;
  }
  if (!canViewTrade(req.user!, bundle.trade as TradeRow)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json(bundle);
});

/** Legacy P2P take-listing — disabled. */
tradesRouter.post('/', requireAuth, requireActiveTrader, async (_req, res) => {
  res.status(410).json({
    error: 'P2P listing trades are retired. Use POST /api/orders/buy or /api/orders/sell.',
  });
});

tradesRouter.post(
  '/:id/deposits/:side/confirm',
  requireAuth,
  requireAdmin,
  async (req: AuthedRequest, res) => {
    const side = req.params.side === 'krw' ? 'buyer_krw' : req.params.side === 'usdt' ? 'seller_usdt' : null;
    if (!side) {
      res.status(400).json({ error: 'side must be krw or usdt' });
      return;
    }
    const body = z
      .object({
        txRef: z.string().max(200).optional(),
        proofNote: z.string().max(500).optional(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }

    try {
      const tradeId = paramId(req.params.id);
      const trade = await loadTrade(tradeId);
      if (!trade) {
        res.status(404).json({ error: 'Trade not found' });
        return;
      }

      if (trade.kind === 'buy_from_admin') {
        if (side !== 'buyer_krw') {
          res.status(400).json({ error: 'Buy orders only need KRW deposit confirm' });
          return;
        }
        const result = await settleOtcBuyLedger(tradeId, req.user!.id, {
          txRef: body.data.txRef,
          proofNote: body.data.proofNote,
        });
        await audit(req.user!.id, 'deposit.confirm', {
          tradeId,
          side,
        });
        res.json(result);
        return;
      }

      if (trade.kind === 'sell_to_admin') {
        if (side !== 'seller_usdt') {
          res.status(400).json({ error: 'Sell orders only need USDT confirm' });
          return;
        }
        // #region agent log
        try {
          const fs = await import('node:fs');
          fs.appendFileSync(
            '/tmp/debug-307f1d.log',
            `${JSON.stringify({
              sessionId: '307f1d',
              hypothesisId: 'D',
              location: 'trades.ts:sellConfirm',
              message: 'admin confirm sell path',
              data: { tradeId, side, tradeStatus: trade.status },
              timestamp: Date.now(),
            })}\n`,
          );
        } catch {
          /* ignore */
        }
        // #endregion
        const result = await settleOtcSellOnChain(tradeId, req.user!.id, {
          txRef: body.data.txRef,
          proofNote: body.data.proofNote,
        });
        await audit(req.user!.id, 'deposit.confirm', {
          tradeId,
          side,
          onchainTxId: result.onchainTxId,
        });
        res.json(result);
        return;
      }

      const result = await withTransaction(async (client) => {
        const tradeR = await client.query(`SELECT * FROM trades WHERE id = $1 FOR UPDATE`, [tradeId]);
        const t = tradeR.rows[0] as TradeRow;
        if (!t) throw new Error('Trade not found');
        if (['completed', 'cancelled'].includes(t.status)) {
          throw new Error('Trade is closed');
        }

        // Legacy dual-deposit path
        const depR = await client.query(
          `SELECT * FROM deposit_intents WHERE trade_id = $1 AND side = $2 FOR UPDATE`,
          [t.id, side],
        );
        const dep = depR.rows[0];
        if (!dep) throw new Error('Deposit intent missing');
        if (dep.status === 'received') throw new Error('Already confirmed');

        await client.query(
          `UPDATE deposit_intents SET status = 'received', tx_ref = $2, proof_note = $3,
             confirmed_by = $4, confirmed_at = now()
           WHERE id = $1`,
          [dep.id, body.data.txRef ?? '', body.data.proofNote ?? '', req.user!.id],
        );

        const asset = side === 'buyer_krw' ? 'krw' : 'usdt';
        const depositor = side === 'buyer_krw' ? t.buyer_user_id : t.seller_user_id;
        const amount = Number(dep.expected_amount);

        await client.query(
          `INSERT INTO holds (trade_id, asset, amount, depositor_user_id, status)
           VALUES ($1,$2,$3,$4,'held')
           ON CONFLICT (trade_id, asset) DO UPDATE SET status = 'held', amount = EXCLUDED.amount`,
          [t.id, asset, amount, depositor],
        );

        await appendLedger(client, {
          userId: depositor,
          asset,
          direction: 'credit',
          amount,
          refType: 'custody_deposit',
          refId: t.id,
          note: `${asset.toUpperCase()} deposited to admin custody`,
        });
        await appendLedger(client, {
          userId: depositor,
          asset,
          direction: 'debit',
          amount,
          refType: 'custody_hold',
          refId: t.id,
          note: `${asset.toUpperCase()} held by admin`,
        });

        const both = await client.query(
          `SELECT side, status FROM deposit_intents WHERE trade_id = $1`,
          [t.id],
        );
        const map = Object.fromEntries(both.rows.map((r) => [r.side, r.status]));
        let status = t.status;
        if (map.buyer_krw === 'received' && map.seller_usdt === 'received') {
          status = 'both_held';
        } else if (map.buyer_krw === 'received') {
          status = 'krw_confirmed';
        } else if (map.seller_usdt === 'received') {
          status = 'usdt_confirmed';
        }
        await client.query(`UPDATE trades SET status = $2, updated_at = now() WHERE id = $1`, [
          t.id,
          status,
        ]);
        return { tradeId: t.id, status };
      });

      await audit(req.user!.id, 'deposit.confirm', { tradeId, side });
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Confirm failed' });
    }
  },
);

/** Retry sell on-chain sweep, or complete buy ledger settle. */
tradesRouter.post('/:id/settle', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const tradeId = paramId(req.params.id);
    const trade = await loadTrade(tradeId);
    if (!trade) {
      res.status(404).json({ error: 'Trade not found' });
      return;
    }
    if (trade.status === 'completed') {
      res.status(400).json({ error: 'Already completed' });
      return;
    }

    if (trade.kind === 'sell_to_admin') {
      const result = await settleOtcSellOnChain(tradeId, req.user!.id, {
        proofNote: 'admin settle',
      });
      await audit(req.user!.id, 'trade.settle', { tradeId, onchainTxId: result.onchainTxId });
      res.json(result);
      return;
    }
    if (trade.kind === 'buy_from_admin') {
      const result = await settleOtcBuyLedger(tradeId, req.user!.id, {
        proofNote: 'admin settle',
      });
      await audit(req.user!.id, 'trade.settle', { tradeId });
      res.json(result);
      return;
    }
    res.status(400).json({ error: 'Settle is only for OTC orders; use exchange for legacy P2P' });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Settle failed' });
  }
});

tradesRouter.post('/:id/exchange', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const result = await withTransaction(async (client) => {
      const tradeId = paramId(req.params.id);
      const tradeR = await client.query(`SELECT * FROM trades WHERE id = $1 FOR UPDATE`, [tradeId]);
      const trade = tradeR.rows[0] as TradeRow;
      if (!trade) throw new Error('Trade not found');
      if (isOtc(trade.kind)) {
        throw new Error('OTC orders settle via deposit confirm (or /settle)');
      }
      if (trade.status === 'completed') throw new Error('Already exchanged');
      if (trade.status !== 'both_held') throw new Error('Both deposits must be held first');

      const holdsR = await client.query(
        `SELECT * FROM holds WHERE trade_id = $1 AND status = 'held' FOR UPDATE`,
        [trade.id],
      );
      const krwHold = holdsR.rows.find((h) => h.asset === 'krw');
      const usdtHold = holdsR.rows.find((h) => h.asset === 'usdt');
      if (!krwHold || !usdtHold) throw new Error('Missing holds');

      await appendLedger(client, {
        userId: trade.buyer_user_id,
        asset: 'usdt',
        direction: 'credit',
        amount: Number(usdtHold.amount),
        refType: 'exchange',
        refId: trade.id,
        note: 'Received USDT from admin exchange',
      });
      await appendLedger(client, {
        userId: trade.seller_user_id,
        asset: 'krw',
        direction: 'credit',
        amount: Number(krwHold.amount),
        refType: 'exchange',
        refId: trade.id,
        note: 'Received KRW from admin exchange',
      });

      await client.query(
        `UPDATE holds SET status = 'exchanged', updated_at = now() WHERE trade_id = $1`,
        [trade.id],
      );
      await client.query(`UPDATE trades SET status = 'completed', updated_at = now() WHERE id = $1`, [
        trade.id,
      ]);
      if (trade.listing_id) {
        await client.query(`UPDATE listings SET status = 'closed', updated_at = now() WHERE id = $1`, [
          trade.listing_id,
        ]);
      }
      return { tradeId: trade.id, status: 'completed' };
    });

    await audit(req.user!.id, 'trade.exchange', { tradeId: paramId(req.params.id) });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Exchange failed' });
  }
});

tradesRouter.post('/:id/cancel', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const result = await withTransaction(async (client) => {
      const tradeId = paramId(req.params.id);
      const tradeR = await client.query(`SELECT * FROM trades WHERE id = $1 FOR UPDATE`, [tradeId]);
      const trade = tradeR.rows[0] as TradeRow;
      if (!trade) throw new Error('Trade not found');
      if (trade.status === 'completed') throw new Error('Cannot cancel completed trade');

      const holdsR = await client.query(
        `SELECT * FROM holds WHERE trade_id = $1 AND status = 'held' FOR UPDATE`,
        [trade.id],
      );
      for (const hold of holdsR.rows) {
        // Buy OTC: KRW bank deposit — no ledger invent.
        // Sell OTC: refund USDT ledger hold if we debited otc_sell_hold.
        if (!isOtc(trade.kind)) {
          await appendLedger(client, {
            userId: hold.depositor_user_id,
            asset: hold.asset,
            direction: 'credit',
            amount: Number(hold.amount),
            refType: 'refund',
            refId: trade.id,
            note: 'Refund from cancelled trade',
          });
        } else if (trade.kind === 'sell_to_admin' && hold.asset === 'usdt') {
          const prior = await client.query(
            `SELECT 1 FROM ledger_entries
             WHERE ref_id = $1 AND ref_type = 'otc_sell_hold' AND direction = 'debit'
             LIMIT 1`,
            [trade.id],
          );
          if (prior.rowCount) {
            await appendLedger(client, {
              userId: hold.depositor_user_id,
              asset: 'usdt',
              direction: 'credit',
              amount: Number(hold.amount),
              refType: 'refund',
              refId: trade.id,
              note: '환전 취소 환불',
            });
          }
        }
        await client.query(`UPDATE holds SET status = 'refunded', updated_at = now() WHERE id = $1`, [
          hold.id,
        ]);
      }
      await client.query(`UPDATE trades SET status = 'cancelled', updated_at = now() WHERE id = $1`, [
        trade.id,
      ]);
      if (trade.listing_id && !isOtc(trade.kind)) {
        await client.query(`UPDATE listings SET status = 'open', updated_at = now() WHERE id = $1`, [
          trade.listing_id,
        ]);
      }
      return { tradeId: trade.id, status: 'cancelled' };
    });
    await audit(req.user!.id, 'trade.cancel', { tradeId: paramId(req.params.id) });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Cancel failed' });
  }
});

tradesRouter.get('/:id/messages', requireAuth, async (req: AuthedRequest, res) => {
  const id = paramId(req.params.id);
  const trade = await loadTrade(id);
  if (!trade) {
    res.status(404).json({ error: 'Trade not found' });
    return;
  }
  if (!canViewTrade(req.user!, trade)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const result = await query(
    `SELECT m.*, u.display_name AS sender_name
     FROM chat_messages m JOIN users u ON u.id = m.sender_user_id
     WHERE m.trade_id = $1
     ORDER BY m.created_at ASC`,
    [id],
  );
  res.json({ messages: result.rows });
});
