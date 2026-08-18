import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '../db.js';
import { appendLedger } from '../ledger.js';
import type { PartnerRow } from './partners.js';

export type PartnerMemberRow = {
  id: string;
  partner_id: string;
  external_user_id: string;
  user_id: string;
};

/**
 * Debit TPS USDT and credit partner game money via callback.
 * Looks like a wallet transfer to the partner virtual address.
 */
export async function executePartnerVirtualTransfer(opts: {
  partner: PartnerRow;
  member: PartnerMemberRow;
  amountUsdt: number;
}): Promise<{ intentId: string; gameAmount: number; idempotencyKey: string }> {
  const rate = Number(opts.partner.usdt_to_game_rate) || 1;
  const gameAmount = Math.floor(opts.amountUsdt * rate * 100) / 100;
  if (!(gameAmount > 0)) throw new Error('Game credit amount must be positive');

  const idempotencyKey = randomUUID();

  const intentId = await withTransaction(async (client) => {
    const ins = await client.query<{ id: string }>(
      `INSERT INTO partner_credit_intents
        (partner_id, partner_member_id, user_id, idempotency_key, amount_usdt, game_amount, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING id`,
      [
        opts.partner.id,
        opts.member.id,
        opts.member.user_id,
        idempotencyKey,
        opts.amountUsdt,
        gameAmount,
      ],
    );
    await appendLedger(client, {
      userId: opts.member.user_id,
      asset: 'usdt',
      direction: 'debit',
      amount: opts.amountUsdt,
      refType: 'partner_credit_out',
      refId: ins.rows[0].id,
      note: '게임 충전 전송',
    });
    return ins.rows[0].id;
  });

  try {
    await callPartnerCredit({
      partner: opts.partner,
      externalUserId: opts.member.external_user_id,
      amountUsdt: opts.amountUsdt,
      gameAmount,
      idempotencyKey,
    });
    await query(
      `UPDATE partner_credit_intents
       SET status = 'completed', updated_at = now() WHERE id = $1`,
      [intentId],
    );
    return { intentId, gameAmount, idempotencyKey };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Partner credit failed';
    await withTransaction(async (client) => {
      await appendLedger(client, {
        userId: opts.member.user_id,
        asset: 'usdt',
        direction: 'credit',
        amount: opts.amountUsdt,
        refType: 'partner_credit_refund',
        refId: intentId,
        note: '게임 충전 실패 환불',
      });
      await client.query(
        `UPDATE partner_credit_intents
         SET status = 'refunded', error_message = $2, updated_at = now() WHERE id = $1`,
        [intentId, msg.slice(0, 500)],
      );
    });
    throw e;
  }
}

async function callPartnerCredit(opts: {
  partner: PartnerRow;
  externalUserId: string;
  amountUsdt: number;
  gameAmount: number;
  idempotencyKey: string;
}) {
  const base = opts.partner.callback_base_url.replace(/\/$/, '');
  if (!base) throw new Error('Partner callback_base_url is not configured');
  const path = opts.partner.callback_path.startsWith('/')
    ? opts.partner.callback_path
    : `/${opts.partner.callback_path}`;
  const url = `${base}${path}`;
  const secret = opts.partner.callback_secret || '';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tps-Callback-Secret': secret,
      Authorization: secret ? `Bearer ${secret}` : '',
    },
    body: JSON.stringify({
      externalUserId: opts.externalUserId,
      amountUsdt: opts.amountUsdt,
      gameAmount: opts.gameAmount,
      idempotencyKey: opts.idempotencyKey,
      partnerCode: opts.partner.code,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Partner credit HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
}
