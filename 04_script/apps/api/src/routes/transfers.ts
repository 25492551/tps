import { Router } from 'express';
import { z } from 'zod';
import { withTransaction, query } from '../db.js';
import { appendLedger } from '../ledger.js';
import {
  executeExternalUsdtWithdraw,
  findUserIdByManagedAddress,
  isTronAddress,
} from '../externalWithdraw.js';
import { requireActiveTrader, requireAuth, type AuthedRequest } from '../middleware.js';
import { findPartnerByVirtualAddress } from '../partner/partners.js';
import { executePartnerVirtualTransfer } from '../partner/credit.js';

export const transfersRouter = Router();

/**
 * Transfer USDT:
 * - toEmail / toUserId → internal ledger
 * - toAddress matching partner virtual deposit → debit + partner game credit (no on-chain)
 * - toAddress platform wallet → internal
 * - else → on-chain from custody
 */
transfersRouter.post('/', requireAuth, requireActiveTrader, async (req: AuthedRequest, res) => {
  const body = z
    .object({
      amountUsdt: z.number().positive(),
      toUserId: z.string().uuid().optional(),
      toEmail: z.string().min(1).max(80).optional(),
      toAddress: z.string().optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  const { amountUsdt, toUserId, toEmail, toAddress } = body.data;
  if (!toUserId && !toEmail && !toAddress) {
    res.status(400).json({ error: 'toUserId, toEmail, or toAddress required' });
    return;
  }

  try {
    if (toAddress) {
      const addr = toAddress.trim();
      if (!isTronAddress(addr)) {
        res.status(400).json({ error: 'Invalid TRC-20 address' });
        return;
      }

      const partner = await findPartnerByVirtualAddress(addr);
      if (partner) {
        const member = await query<{
          id: string;
          partner_id: string;
          external_user_id: string;
          user_id: string;
        }>(
          `SELECT id, partner_id, external_user_id, user_id FROM partner_members
           WHERE partner_id = $1 AND user_id = $2 LIMIT 1`,
          [partner.id, req.user!.id],
        );
        if (!member.rowCount) {
          res.status(400).json({
            error: '이 충전 지갑은 연동 계정에서만 사용할 수 있습니다.',
          });
          return;
        }
        const out = await executePartnerVirtualTransfer({
          partner,
          member: member.rows[0],
          amountUsdt,
        });
        res.status(201).json({
          transfer: {
            kind: 'partner_credit' as const,
            amountUsdt,
            gameAmount: out.gameAmount,
            intentId: out.intentId,
            toAddress: addr,
          },
        });
        return;
      }

      const internalUserId = await findUserIdByManagedAddress(addr);
      if (internalUserId) {
        if (internalUserId === req.user!.id) {
          res.status(400).json({ error: '본인에게는 보낼 수 없습니다.' });
          return;
        }
        const result = await withTransaction(async (client) => {
          await appendLedger(client, {
            userId: req.user!.id,
            asset: 'usdt',
            direction: 'debit',
            amount: amountUsdt,
            refType: 'transfer_out',
            note: '테더 전송',
          });
          await appendLedger(client, {
            userId: internalUserId,
            asset: 'usdt',
            direction: 'credit',
            amount: amountUsdt,
            refType: 'transfer_in',
            note: '테더 수신',
          });
          return {
            kind: 'internal' as const,
            fromUserId: req.user!.id,
            toUserId: internalUserId,
            amountUsdt,
          };
        });
        res.status(201).json({ transfer: result });
        return;
      }

      const out = await executeExternalUsdtWithdraw({
        userId: req.user!.id,
        amountUsdt,
        destination: addr,
      });
      res.status(201).json({
        transfer: {
          kind: 'external' as const,
          amountUsdt,
          onchainTxId: out.onchainTxId,
          withdrawalId: out.withdrawalId,
        },
      });
      return;
    }

    const result = await withTransaction(async (client) => {
      let toId = toUserId;
      if (!toId && toEmail) {
        const u = await client.query<{ id: string; role: string; status: string }>(
          `SELECT id, role, status FROM users WHERE lower(email) = $1`,
          [toEmail.trim().toLowerCase()],
        );
        if (!u.rowCount) throw new Error('수신자를 찾을 수 없습니다.');
        toId = u.rows[0].id;
        if (u.rows[0].role === 'admin') throw new Error('관리자 계정으로는 전송할 수 없습니다.');
        if (u.rows[0].status === 'deleted' || u.rows[0].status === 'suspended') {
          throw new Error('수신 계정을 사용할 수 없습니다.');
        }
      } else {
        const u = await client.query<{ id: string; role: string; status: string }>(
          `SELECT id, role, status FROM users WHERE id = $1`,
          [toId],
        );
        if (!u.rowCount) throw new Error('수신자를 찾을 수 없습니다.');
        if (u.rows[0].role === 'admin') throw new Error('관리자 계정으로는 전송할 수 없습니다.');
        if (u.rows[0].status === 'deleted' || u.rows[0].status === 'suspended') {
          throw new Error('수신 계정을 사용할 수 없습니다.');
        }
      }
      if (toId === req.user!.id) throw new Error('본인에게는 보낼 수 없습니다.');

      await appendLedger(client, {
        userId: req.user!.id,
        asset: 'usdt',
        direction: 'debit',
        amount: amountUsdt,
        refType: 'transfer_out',
        note: '테더 전송',
      });
      await appendLedger(client, {
        userId: toId!,
        asset: 'usdt',
        direction: 'credit',
        amount: amountUsdt,
        refType: 'transfer_in',
        note: '테더 수신',
      });
      return {
        kind: 'internal' as const,
        fromUserId: req.user!.id,
        toUserId: toId,
        amountUsdt,
      };
    });
    res.status(201).json({ transfer: result });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Transfer failed' });
  }
});
