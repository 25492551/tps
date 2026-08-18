import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { getBalance } from '../ledger.js';
import {
  executeExternalUsdtWithdraw,
  findUserIdByManagedAddress,
} from '../externalWithdraw.js';
import { requireActiveTrader, requireAuth, type AuthedRequest } from '../middleware.js';
import { withTransaction } from '../db.js';
import { appendLedger } from '../ledger.js';

export const assetsRouter = Router();
assetsRouter.use(requireAuth);

const tronAddress = z
  .string()
  .regex(/^T[1-9A-HJ-NP-Za-km-z]{33}$/, 'Invalid TRC-20 address');

/** User-facing wallet summary — no public address. */
assetsRouter.get('/wallets', async (req: AuthedRequest, res) => {
  const result = await query(
    `SELECT id, chain, label, status, is_platform_managed, is_default, created_at
     FROM tether_wallets WHERE user_id = $1 AND is_custody = false
     ORDER BY is_default DESC, created_at DESC`,
    [req.user!.id],
  );
  const ledgerUsdt = await getBalance(req.user!.id, 'usdt');
  const ledgerKrw = await getBalance(req.user!.id, 'krw');
  res.json({
    wallets: result.rows.map((w) => ({
      id: w.id,
      chain: w.chain,
      label: w.label,
      status: w.status,
      isPlatformManaged: w.is_platform_managed,
      isDefault: w.is_default,
      createdAt: w.created_at,
    })),
    balances: {
      usdt: ledgerUsdt,
      krw: ledgerKrw,
      ledgerUsdt,
      ledgerKrw,
    },
  });
});

assetsRouter.post('/wallets', requireActiveTrader, async (_req: AuthedRequest, res) => {
  res.status(410).json({
    error: '외부 지갑 등록은 종료되었습니다.',
  });
});

/** External TRC-20 withdraw (on-chain) or internal ledger if destination is a platform user. */
assetsRouter.post('/wallets/transfer', requireActiveTrader, async (req: AuthedRequest, res) => {
  const body = z
    .object({
      amount: z.number().positive(),
      destination: tronAddress,
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }

  try {
    const internalUserId = await findUserIdByManagedAddress(body.data.destination);
    if (internalUserId) {
      if (internalUserId === req.user!.id) {
        res.status(400).json({ error: '본인에게는 보낼 수 없습니다.' });
        return;
      }
      const result = await withTransaction(async (client) => {
        const amount = body.data.amount;
        await appendLedger(client, {
          userId: req.user!.id,
          asset: 'usdt',
          direction: 'debit',
          amount,
          refType: 'transfer_out',
          note: '테더 전송',
        });
        await appendLedger(client, {
          userId: internalUserId,
          asset: 'usdt',
          direction: 'credit',
          amount,
          refType: 'transfer_in',
          note: '테더 수신',
        });
        return { kind: 'internal' as const, toUserId: internalUserId, amountUsdt: amount };
      });
      res.status(201).json({ transfer: result });
      return;
    }

    const out = await executeExternalUsdtWithdraw({
      userId: req.user!.id,
      amountUsdt: body.data.amount,
      destination: body.data.destination,
    });
    res.status(201).json({
      withdrawal: {
        id: out.withdrawalId,
        status: 'done',
        onchainTxId: out.onchainTxId,
        destination: out.toAddress,
      },
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : '이체 실패' });
  }
});

assetsRouter.get('/bank-accounts', async (req: AuthedRequest, res) => {
  const result = await query(
    `SELECT id, bank_code, bank_name, account_no, holder_name, status, verified_at, created_at
     FROM bank_accounts WHERE user_id = $1 AND is_custody = false
     ORDER BY created_at DESC`,
    [req.user!.id],
  );
  res.json({ bankAccounts: result.rows });
});

assetsRouter.post('/bank-accounts', requireActiveTrader, async (req: AuthedRequest, res) => {
  const body = z
    .object({
      bankCode: z.string().min(1).max(20),
      bankName: z.string().min(1).max(80),
      accountNo: z.string().min(4).max(40),
      holderName: z.string().min(1).max(80),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  const result = await query(
    `INSERT INTO bank_accounts
      (user_id, is_custody, bank_code, bank_name, account_no, holder_name, status)
     VALUES ($1, false, $2, $3, $4, $5, 'active') RETURNING *`,
    [
      req.user!.id,
      body.data.bankCode,
      body.data.bankName,
      body.data.accountNo,
      body.data.holderName,
    ],
  );
  res.status(201).json({ bankAccount: result.rows[0] });
});

assetsRouter.get('/withdrawals', async (req: AuthedRequest, res) => {
  const result = await query(
    `SELECT * FROM withdrawal_requests WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user!.id],
  );
  res.json({ withdrawals: result.rows });
});
