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
      ledgerUsdt,
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
  const accounts = await query(
    `SELECT id, bank_name, account_no, holder_name, status, verified_at, created_at
     FROM bank_accounts
     WHERE user_id = $1 AND is_custody = false AND status <> 'deleted'
     ORDER BY
       CASE status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
       created_at DESC`,
    [req.user!.id],
  );
  const pending = await query(
    `SELECT id, bank_name, account_no, holder_name, status, created_at, review_note
     FROM bank_change_requests
     WHERE user_id = $1 AND status = 'pending'
     ORDER BY created_at DESC LIMIT 1`,
    [req.user!.id],
  );
  res.json({
    bankAccounts: accounts.rows,
    pendingRequest: pending.rows[0] ?? null,
  });
});

/** Soft-delete: mark status deleted; keep row. */
assetsRouter.post('/bank-accounts/:id/delete', requireActiveTrader, async (req: AuthedRequest, res) => {
  const result = await query(
    `UPDATE bank_accounts
     SET status = 'deleted'
     WHERE id = $1 AND user_id = $2 AND is_custody = false AND status <> 'deleted'
     RETURNING id, status`,
    [String(req.params.id), req.user!.id],
  );
  if (!result.rowCount) {
    res.status(404).json({ error: '삭제할 계좌가 없습니다' });
    return;
  }
  res.json({ bankAccount: result.rows[0] });
});

assetsRouter.post('/bank-accounts', requireActiveTrader, async (req: AuthedRequest, res) => {
  const body = z
    .object({
      bankName: z.string().min(1).max(80),
      accountNo: z.string().min(4).max(40),
      holderName: z.string().min(1).max(80),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  const accountNo = body.data.accountNo.replace(/\D/g, '') || body.data.accountNo.trim();
  if (accountNo.length < 4) {
    res.status(400).json({ error: '유효한 계좌번호(숫자 4자리 이상)가 필요합니다' });
    return;
  }
  try {
    const inserted = await query(
      `INSERT INTO bank_change_requests
        (user_id, bank_name, account_no, holder_name, status)
       VALUES ($1,$2,$3,$4,'pending')
       RETURNING *`,
      [
        req.user!.id,
        body.data.bankName.trim(),
        accountNo,
        body.data.holderName.trim(),
      ],
    );
    res.status(201).json({ request: inserted.rows[0] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('bank_change_requests_one_pending_uidx') || msg.includes('unique')) {
      res.status(409).json({ error: '이미 대기 중인 등록 요청이 있습니다. 승인·거절 후 다시 요청하세요.' });
      return;
    }
    res.status(400).json({ error: msg });
  }
});

assetsRouter.post('/bank-accounts/requests/:id/cancel', requireActiveTrader, async (req: AuthedRequest, res) => {
  const result = await query(
    `UPDATE bank_change_requests
     SET status = 'cancelled', updated_at = now()
     WHERE id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING *`,
    [String(req.params.id), req.user!.id],
  );
  if (!result.rowCount) {
    res.status(404).json({ error: '취소할 대기 요청이 없습니다' });
    return;
  }
  res.json({ request: result.rows[0] });
});

assetsRouter.get('/withdrawals', async (req: AuthedRequest, res) => {
  const result = await query(
    `SELECT * FROM withdrawal_requests WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user!.id],
  );
  res.json({ withdrawals: result.rows });
});
