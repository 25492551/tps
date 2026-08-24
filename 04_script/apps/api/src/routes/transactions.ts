import { Router } from 'express';
import { query } from '../db.js';
import { getBalance } from '../ledger.js';
import { requireAuth, type AuthedRequest } from '../middleware.js';

export const transactionsRouter = Router();

const REF_LABELS: Record<string, string> = {
  otc_buy: '테더 구매',
  otc_sell: '테더→원화 환전',
  otc_sell_hold: '환전 대기',
  transfer_out: '테더 전송',
  transfer_in: '테더 수신',
  withdraw_out: '외부 출금',
  withdraw_refund: '출금 실패 환불',
  partner_credit_out: '게임 충전',
  partner_credit_refund: '게임 충전 환불',
  refund: '취소 환불',
  ledger_adjust: '잔액 조정',
  custody_deposit: '입금',
  custody_hold: '예치',
  exchange: '교환',
};

function displayTxId(id: string) {
  return `TX-${String(id).replace(/-/g, '').slice(0, 16).toUpperCase()}`;
}

transactionsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const result = await query(
    `SELECT * FROM ledger_entries WHERE user_id = $1 AND asset = 'usdt'
     ORDER BY created_at DESC LIMIT 200`,
    [req.user!.id],
  );
  const usdt = await getBalance(req.user!.id, 'usdt');
  res.json({
    balances: { usdt },
    transactions: result.rows.map((t) => ({
      ...t,
      title: REF_LABELS[t.ref_type] || t.note || t.ref_type,
      displayTxId: displayTxId(t.id),
    })),
  });
});
