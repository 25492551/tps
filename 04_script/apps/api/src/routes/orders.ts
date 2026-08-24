import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { appendLedger, getBalance } from '../ledger.js';
import {
  applyFxFee,
  feePercentForSide,
  getSiteSettings,
  getSiteSpotQuote,
} from '../settings.js';
import { FX_REFRESH_INTERVALS, RATE_PROVIDERS } from '../rates.js';
import { requireActiveTrader, requireAuth, type AuthedRequest } from '../middleware.js';

export const ordersRouter = Router();

async function getPlatformAdminId(): Promise<string> {
  const r = await query<{ id: string }>(
    `SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY created_at ASC LIMIT 1`,
  );
  if (!r.rowCount) throw new Error('No active admin account for OTC counterparty');
  return r.rows[0].id;
}

async function snapshotRate(side: 'buy' | 'sell'): Promise<{ spot: number; price: number; feePercent: number }> {
  const settings = await getSiteSettings();
  const quote = await getSiteSpotQuote();
  if (quote.rateKrwPerUsdt == null || !(quote.rateKrwPerUsdt > 0)) {
    throw new Error(quote.error || 'Unable to fetch FX rate');
  }
  const spot = quote.rateKrwPerUsdt;
  const feePercent = feePercentForSide(settings, side);
  const price = applyFxFee(spot, feePercent, side);
  return { spot, price, feePercent };
}

/** Floor to 2 decimal places (buy: give slightly less USDT when KRW×rate does not divide evenly). */
function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

/**
 * Buy settlement: KRW is whole won; USDT = floor(KRW / price, 2).
 * Prefer amountKrw; if only amountUsdt is sent, derive integer KRW then floor USDT.
 */
function normalizeBuyAmounts(
  price: number,
  input: { amountKrw?: number; amountUsdt?: number },
): { amountKrw: number; amountUsdt: number } {
  let amountKrw: number;
  if (input.amountKrw != null && Number.isFinite(input.amountKrw) && input.amountKrw > 0) {
    if (!Number.isInteger(input.amountKrw)) {
      throw new Error('구매 원화 금액은 원 단위(정수)여야 합니다.');
    }
    amountKrw = input.amountKrw;
  } else if (input.amountUsdt != null && Number.isFinite(input.amountUsdt) && input.amountUsdt > 0) {
    amountKrw = Math.round(input.amountUsdt * price);
  } else {
    throw new Error('amountKrw 또는 amountUsdt가 필요합니다.');
  }
  if (!(amountKrw >= 1)) {
    throw new Error('구매 원화 금액은 1원 이상이어야 합니다.');
  }
  const amountUsdt = floor2(amountKrw / price);
  if (!(amountUsdt > 0)) {
    throw new Error('환산된 USDT 수량이 너무 작습니다.');
  }
  return { amountKrw, amountUsdt };
}

/** User buys USDT from admin (admin sells) — ledger credit after KRW confirm. */
ordersRouter.post('/buy', requireAuth, requireActiveTrader, async (req: AuthedRequest, res) => {
  const body = z
    .object({
      amountKrw: z.number().positive().optional(),
      amountUsdt: z.number().positive().optional(),
    })
    .refine((d) => d.amountKrw != null || d.amountUsdt != null, {
      message: 'amountKrw or amountUsdt required',
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  if (req.user!.role !== 'admin' && !req.user!.canBuyTether) {
    res.status(403).json({ error: '테더 구매 권한이 없습니다.' });
    return;
  }
  try {
    const { price } = await snapshotRate('buy');
    const { amountKrw, amountUsdt } = normalizeBuyAmounts(price, body.data);
    const adminId = await getPlatformAdminId();
    if (adminId === req.user!.id) {
      res.status(400).json({ error: 'Admin cannot create OTC buy as user' });
      return;
    }

    const trade = await withTransaction(async (client) => {
      const tradeR = await client.query(
        `INSERT INTO trades
          (listing_id, kind, buyer_user_id, seller_user_id, amount_usdt, amount_krw, price_krw_per_usdt, status)
         VALUES (NULL, 'buy_from_admin', $1, $2, $3, $4, $5, 'awaiting_user_deposit')
         RETURNING *`,
        [req.user!.id, adminId, amountUsdt, amountKrw, price],
      );
      const t = tradeR.rows[0];
      await client.query(
        `INSERT INTO deposit_intents (trade_id, side, expected_amount, status)
         VALUES ($1, 'buyer_krw', $2, 'awaiting')`,
        [t.id, amountKrw],
      );
      return t;
    });

    res.status(201).json({ trade });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Buy order failed' });
  }
});

/** User sells USDT to admin — ledger hold now; on-chain custody sweep + KRW on confirm. */
ordersRouter.post('/sell', requireAuth, requireActiveTrader, async (req: AuthedRequest, res) => {
  const body = z.object({ amountUsdt: z.number().positive() }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  if (req.user!.role !== 'admin' && !req.user!.canSellTether) {
    res.status(403).json({ error: '테더 판매 권한이 없습니다.' });
    return;
  }
  try {
    const { price } = await snapshotRate('sell');
    const amountUsdt = Math.round(body.data.amountUsdt * 100) / 100;
    // Whole-won KRW only (no decimals)
    const amountKrw = Math.floor(amountUsdt * price + 1e-9);
    if (!(amountKrw >= 1)) {
      res.status(400).json({ error: '환산된 원화 금액이 너무 작습니다.' });
      return;
    }
    const adminId = await getPlatformAdminId();
    if (adminId === req.user!.id) {
      res.status(400).json({ error: 'Admin cannot create OTC sell as user' });
      return;
    }

    const trade = await withTransaction(async (client) => {
      const bal = await getBalance(req.user!.id, 'usdt', client);
      if (bal + 1e-9 < amountUsdt) {
        throw new Error('USDT 잔액이 부족합니다.');
      }

      const tradeR = await client.query(
        `INSERT INTO trades
          (listing_id, kind, buyer_user_id, seller_user_id, amount_usdt, amount_krw, price_krw_per_usdt, status)
         VALUES (NULL, 'sell_to_admin', $1, $2, $3, $4, $5, 'awaiting_admin_payout')
         RETURNING *`,
        [adminId, req.user!.id, amountUsdt, amountKrw, price],
      );
      const t = tradeR.rows[0];

      await appendLedger(client, {
        userId: req.user!.id,
        asset: 'usdt',
        direction: 'debit',
        amount: amountUsdt,
        refType: 'otc_sell_hold',
        refId: t.id,
        note: 'USDT→KRW 환전 대기',
      });
      await client.query(
        `INSERT INTO deposit_intents (trade_id, side, expected_amount, status, confirmed_at)
         VALUES ($1, 'seller_usdt', $2, 'received', now())`,
        [t.id, amountUsdt],
      );
      await client.query(
        `INSERT INTO holds (trade_id, asset, amount, depositor_user_id, status)
         VALUES ($1, 'usdt', $2, $3, 'held')`,
        [t.id, amountUsdt, req.user!.id],
      );
      return t;
    });

    res.status(201).json({ trade });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Sell order failed' });
  }
});

ordersRouter.get('/rate', requireAuth, async (req, res) => {
  try {
    const sideRaw = typeof req.query.side === 'string' ? req.query.side : 'buy';
    const side = sideRaw === 'sell' ? 'sell' : 'buy';
    const settings = await getSiteSettings();
    const quote = await getSiteSpotQuote();
    const spot = quote.rateKrwPerUsdt;
    const feePercent = feePercentForSide(settings, side);
    const effective =
      spot != null && spot > 0 ? applyFxFee(spot, feePercent, side) : null;
    res.json({
      providerId: settings.fxRateProvider,
      providerName:
        RATE_PROVIDERS.find((p) => p.id === settings.fxRateProvider)?.name ??
        settings.fxRateProvider,
      spotKrwPerUsdt: spot,
      rateKrwPerUsdt: effective,
      fxFeePercent: feePercent,
      fxBuyFeePercent: settings.fxBuyFeePercent,
      fxSellFeePercent: settings.fxSellFeePercent,
      fxRateRefreshInterval: settings.fxRateRefreshInterval,
      fxRateRefreshIntervalLabel:
        FX_REFRESH_INTERVALS.find((i) => i.id === settings.fxRateRefreshInterval)?.labelKo ??
        settings.fxRateRefreshInterval,
      cached: quote.rawNote === 'cached',
      side,
      fetchedAt: quote.fetchedAt,
      error: quote.error,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Rate fetch failed' });
  }
});
