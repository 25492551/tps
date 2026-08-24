import { Router } from 'express';
import { query } from '../db.js';
import { getBalance } from '../ledger.js';
import { normalizeLoginId } from '../loginId.js';
import { requireActiveTrader, requireAgent, requireAuth, type AuthedRequest } from '../middleware.js';
import { toPublicUser, type DbUser } from '../types.js';

export const agentRouter = Router();
agentRouter.use(requireAuth, requireAgent, requireActiveTrader);

async function agentPartnerId(agentUserId: string): Promise<{
  partnerId: string;
  code: string;
  name: string;
} | null> {
  const r = await query<{ id: string; code: string; name: string }>(
    `SELECT id, code, name FROM partners WHERE agent_user_id = $1 AND status = 'active' LIMIT 1`,
    [agentUserId],
  );
  if (!r.rowCount) return null;
  return { partnerId: r.rows[0].id, code: r.rows[0].code, name: r.rows[0].name };
}

agentRouter.get('/me', async (req: AuthedRequest, res) => {
  const partner = await agentPartnerId(req.user!.id);
  if (!partner) {
    res.status(403).json({ error: 'Agent is not assigned to a solution' });
    return;
  }

  /** Start/end of calendar day in Asia/Seoul (UTC instants). */
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const from = new Date(`${ymd}T00:00:00+09:00`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);

  let todayDepositKrw = 0;
  try {
    const dep = await query<{ total: string }>(
      `SELECT COALESCE(SUM(t.amount_krw), 0)::text AS total
       FROM trades t
       JOIN partner_members pm ON pm.user_id = t.buyer_user_id AND pm.partner_id = $1
       WHERE t.kind = 'buy_from_admin'
         AND t.status = 'completed'
         AND t.updated_at >= $2
         AND t.updated_at < $3`,
      [partner.partnerId, from.toISOString(), to.toISOString()],
    );
    todayDepositKrw = Math.round(Number(dep.rows[0]?.total ?? 0));
  } catch {
    todayDepositKrw = 0;
  }

  res.json({
    user: req.user,
    partner: { id: partner.partnerId, code: partner.code, name: partner.name },
    todayDepositKrw,
    todayYmdKst: ymd,
  });
});

agentRouter.get('/deposit-series', async (req: AuthedRequest, res) => {
  const partner = await agentPartnerId(req.user!.id);
  if (!partner) {
    res.status(403).json({ error: 'Agent is not assigned to a solution' });
    return;
  }
  try {
    const { loadDepositSeries, parseSeriesDays } = await import('../depositSeries.js');
    const days = parseSeriesDays(req.query.days, 7);
    const data = await loadDepositSeries({ days, partnerId: partner.partnerId });
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Deposit series failed' });
  }
});

agentRouter.get('/members', async (req: AuthedRequest, res) => {
  const partner = await agentPartnerId(req.user!.id);
  if (!partner) {
    res.status(403).json({ error: 'Agent is not assigned to a solution' });
    return;
  }
  const q = typeof req.query.q === 'string' ? normalizeLoginId(req.query.q) : '';
  const params: unknown[] = [partner.partnerId];
  let extra = '';
  if (q) {
    params.push(`%${q}%`);
    extra = ` AND u.email ILIKE $${params.length}`;
  }
  const result = await query(
    `SELECT u.id, u.email AS login_id, u.display_name, u.role, u.status, u.created_at,
            pm.external_login_id
     FROM partner_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.partner_id = $1 AND u.status <> 'deleted' AND u.role <> 'admin'
     ${extra}
     ORDER BY u.created_at DESC
     LIMIT 500`,
    params,
  );
  res.json({
    partner: { id: partner.partnerId, code: partner.code, name: partner.name },
    members: result.rows.map((row) => ({
      id: row.id,
      loginId: row.login_id,
      displayName: row.display_name,
      role: row.role,
      status: row.status,
      externalLoginId: row.external_login_id,
      createdAt: row.created_at,
    })),
  });
});

agentRouter.get('/members/:loginId', async (req: AuthedRequest, res) => {
  const partner = await agentPartnerId(req.user!.id);
  if (!partner) {
    res.status(403).json({ error: 'Agent is not assigned to a solution' });
    return;
  }
  const loginId = normalizeLoginId(String(req.params.loginId || ''));
  if (!loginId) {
    res.status(400).json({ error: 'Invalid login id' });
    return;
  }
  const result = await query(
    `SELECT u.*, pm.external_login_id, p.name AS solution_name, p.code AS solution_code
     FROM partner_members pm
     JOIN users u ON u.id = pm.user_id
     JOIN partners p ON p.id = pm.partner_id
     WHERE pm.partner_id = $1 AND lower(u.email) = $2 AND u.status <> 'deleted' AND u.role <> 'admin'
     LIMIT 1`,
    [partner.partnerId, loginId],
  );
  if (!result.rowCount) {
    res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
    return;
  }
  const row = result.rows[0];
  const banks = await query(
    `SELECT id, bank_name, account_no, holder_name, status, created_at
     FROM bank_accounts
     WHERE user_id = $1 AND is_custody = false
     ORDER BY created_at DESC`,
    [row.id],
  );
  const balanceUsdt = await getBalance(row.id as string, 'usdt');
  const balanceKrw = await getBalance(row.id as string, 'krw');
  res.json({
    user: {
      ...toPublicUser(row as DbUser),
      managedWalletAddress: null,
      solutionName: row.solution_name ?? null,
      solutionCode: row.solution_code ?? null,
      externalLoginId: row.external_login_id ?? null,
    },
    banks: banks.rows.map((b) => ({
      id: b.id,
      bankName: b.bank_name,
      accountNo: b.account_no,
      holderName: b.holder_name,
      status: b.status,
      createdAt: b.created_at,
    })),
    balanceUsdt,
    balanceKrw,
  });
});

agentRouter.get('/members/:loginId/transactions', async (req: AuthedRequest, res) => {
  const partner = await agentPartnerId(req.user!.id);
  if (!partner) {
    res.status(403).json({ error: 'Agent is not assigned to a solution' });
    return;
  }
  const loginId = normalizeLoginId(String(req.params.loginId || ''));
  if (!loginId) {
    res.status(400).json({ error: 'Invalid login id' });
    return;
  }
  const u = await query<{ id: string }>(
    `SELECT u.id FROM users u
     JOIN partner_members pm ON pm.user_id = u.id
     WHERE pm.partner_id = $1 AND lower(u.email) = $2 AND u.status <> 'deleted' AND u.role <> 'admin'
     LIMIT 1`,
    [partner.partnerId, loginId],
  );
  if (!u.rowCount) {
    res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
    return;
  }
  const result = await query(
    `SELECT le.*, t.amount_krw AS trade_amount_krw, t.amount_usdt AS trade_amount_usdt
     FROM ledger_entries le
     LEFT JOIN trades t ON t.id = le.ref_id
       AND le.ref_type IN ('otc_buy', 'otc_sell_hold', 'otc_sell')
     WHERE le.user_id = $1 AND le.asset IN ('usdt', 'krw')
     ORDER BY le.created_at DESC
     LIMIT 500`,
    [u.rows[0].id],
  );
  res.json({
    loginId,
    transactions: result.rows.map((t) => {
      const asset = t.asset as string;
      const amount = Number(t.amount);
      const tradeKrw = t.trade_amount_krw != null ? Number(t.trade_amount_krw) : null;
      const tradeUsdt = t.trade_amount_usdt != null ? Number(t.trade_amount_usdt) : null;
      return {
        id: t.id,
        asset,
        direction: t.direction,
        amount,
        amountUsdt: asset === 'usdt' ? amount : tradeUsdt,
        amountKrw: asset === 'krw' ? amount : tradeKrw,
        balanceAfter: Number(t.balance_after),
        refType: t.ref_type,
        note: t.note,
        createdAt: t.created_at,
      };
    }),
  });
});

agentRouter.get('/members/:loginId/access-logs', async (req: AuthedRequest, res) => {
  const partner = await agentPartnerId(req.user!.id);
  if (!partner) {
    res.status(403).json({ error: 'Agent is not assigned to a solution' });
    return;
  }
  const loginId = normalizeLoginId(String(req.params.loginId || ''));
  if (!loginId) {
    res.status(400).json({ error: 'Invalid login id' });
    return;
  }
  const u = await query<{ id: string }>(
    `SELECT u.id FROM users u
     JOIN partner_members pm ON pm.user_id = u.id
     WHERE pm.partner_id = $1 AND lower(u.email) = $2 AND u.status <> 'deleted' AND u.role <> 'admin'
     LIMIT 1`,
    [partner.partnerId, loginId],
  );
  if (!u.rowCount) {
    res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
    return;
  }
  const result = await query(
    `SELECT id, event, ip, user_agent, created_at
     FROM user_access_logs
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 200`,
    [u.rows[0].id],
  );
  res.json({
    loginId,
    accessLogs: result.rows.map((r) => ({
      id: r.id,
      event: r.event,
      ip: r.ip,
      userAgent: r.user_agent,
      createdAt: r.created_at,
    })),
  });
});

agentRouter.get('/transactions', async (req: AuthedRequest, res) => {
  const partner = await agentPartnerId(req.user!.id);
  if (!partner) {
    res.status(403).json({ error: 'Agent is not assigned to a solution' });
    return;
  }
  const loginIdRaw = typeof req.query.loginId === 'string' ? req.query.loginId : '';
  const loginId = loginIdRaw ? normalizeLoginId(loginIdRaw) : '';
  const params: unknown[] = [partner.partnerId];
  const where = [
    `pm.partner_id = $1`,
    `le.asset IN ('usdt', 'krw')`,
    `u.role <> 'admin'`,
  ];
  if (loginId) {
    params.push(loginId);
    where.push(`lower(u.email) = $${params.length}`);
  }
  const result = await query(
    `SELECT le.*, u.email AS login_id, u.display_name,
            t.amount_krw AS trade_amount_krw, t.amount_usdt AS trade_amount_usdt
     FROM ledger_entries le
     JOIN users u ON u.id = le.user_id
     JOIN partner_members pm ON pm.user_id = le.user_id
     LEFT JOIN trades t ON t.id = le.ref_id
       AND le.ref_type IN ('otc_buy', 'otc_sell_hold', 'otc_sell')
     WHERE ${where.join(' AND ')}
     ORDER BY le.created_at DESC
     LIMIT 500`,
    params,
  );

  let filterBalanceUsdt: number | null = null;
  let filterBalanceKrw: number | null = null;
  if (loginId) {
    const u = await query<{ id: string }>(
      `SELECT u.id FROM users u
       JOIN partner_members pm ON pm.user_id = u.id
       WHERE pm.partner_id = $1 AND lower(u.email) = $2 LIMIT 1`,
      [partner.partnerId, loginId],
    );
    if (u.rowCount) {
      filterBalanceUsdt = await getBalance(u.rows[0].id, 'usdt');
      filterBalanceKrw = await getBalance(u.rows[0].id, 'krw');
    }
  }

  res.json({
    partner: { id: partner.partnerId, code: partner.code, name: partner.name },
    filterLoginId: loginId || null,
    filterBalance: filterBalanceUsdt,
    filterBalanceUsdt,
    filterBalanceKrw,
    transactions: result.rows.map((t) => {
      const asset = t.asset as string;
      const amount = Number(t.amount);
      const tradeKrw = t.trade_amount_krw != null ? Number(t.trade_amount_krw) : null;
      const tradeUsdt = t.trade_amount_usdt != null ? Number(t.trade_amount_usdt) : null;
      return {
        id: t.id,
        loginId: t.login_id,
        displayName: t.display_name,
        asset,
        direction: t.direction,
        amount,
        amountUsdt: asset === 'usdt' ? amount : tradeUsdt,
        amountKrw: asset === 'krw' ? amount : tradeKrw,
        balanceAfter: t.balance_after,
        refType: t.ref_type,
        note: t.note,
        createdAt: t.created_at,
      };
    }),
  });
});

agentRouter.get('/settlements/summary', async (req: AuthedRequest, res) => {
  const partner = await agentPartnerId(req.user!.id);
  if (!partner) {
    res.status(403).json({ error: 'Agent is not assigned to a solution' });
    return;
  }
  try {
    const {
      summarizePartnerPeriod,
      sumParentOverrideFromDescendants,
    } = await import('../agentSettlement.js');
    const from = new Date('1970-01-01T00:00:00.000Z');
    const to = new Date(Date.now() + 86400000);
    const own = await summarizePartnerPeriod(partner.partnerId, from, to);
    const fromDown = await sumParentOverrideFromDescendants(partner.partnerId, from, to);
    res.json({
      partner: {
        id: partner.partnerId,
        code: partner.code,
        name: partner.name,
        agentFeePercent: own.feePercent,
      },
      grossKrw: own.grossKrw,
      feePercent: own.feePercent,
      agentDueKrw: own.agentDueKrw,
      tradeCount: own.tradeCount,
      fromSubAgentsKrw: fromDown.dueKrw,
      fromSubAgents: fromDown.bySource,
      totalReceivableKrw: own.agentDueKrw + fromDown.dueKrw,
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Summary failed' });
  }
});

agentRouter.get('/settlements', async (req: AuthedRequest, res) => {
  const partner = await agentPartnerId(req.user!.id);
  if (!partner) {
    res.status(403).json({ error: 'Agent is not assigned to a solution' });
    return;
  }
  const result = await query(
    `SELECT s.*
     FROM agent_settlements s
     WHERE s.partner_id = $1
     ORDER BY s.completed_at DESC
     LIMIT 100`,
    [partner.partnerId],
  );
  const overrideShares = await query(
    `SELECT sh.*, s.completed_at, sp.code AS source_code, sp.name AS source_name
     FROM agent_settlement_shares sh
     JOIN agent_settlements s ON s.id = sh.settlement_id
     JOIN partners sp ON sp.id = sh.source_partner_id
     WHERE sh.payee_partner_id = $1 AND sh.share_kind = 'parent_agent'
     ORDER BY s.completed_at DESC
     LIMIT 100`,
    [partner.partnerId],
  );
  res.json({
    partner: { id: partner.partnerId, code: partner.code, name: partner.name },
    settlements: result.rows.map((row) => ({
      id: row.id,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      grossKrw: Number(row.gross_krw),
      feePercent: Number(row.fee_percent),
      agentDueKrw: Number(row.agent_due_krw),
      adminFeeKrw: Number(row.admin_fee_krw ?? 0),
      status: row.status,
      completedAt: row.completed_at,
      note: row.note,
    })),
    parentSharesReceived: overrideShares.rows.map((row) => ({
      id: row.id,
      settlementId: row.settlement_id,
      sourcePartnerId: row.source_partner_id,
      sourceCode: row.source_code,
      sourceName: row.source_name,
      ratePercent: Number(row.rate_percent),
      dueKrw: Number(row.due_krw),
      completedAt: row.completed_at,
    })),
  });
});
