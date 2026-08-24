import type pg from 'pg';
import { query, withTransaction } from './db.js';

export type UnsettledBuy = {
  id: string;
  amount_krw: string;
  updated_at: Date;
  buyer_login_id: string;
};

export type PartnerNode = {
  id: string;
  code: string;
  name: string;
  agentUserId: string | null;
  agentFeePercent: number;
  parentPartnerId: string | null;
};

export type FeeParentShare = {
  partnerId: string;
  code: string;
  name: string;
  agentUserId: string | null;
  /** Differential rate % applied to this parent (ownRate - nextUpperRate). */
  ratePercent: number;
  dueKrw: number;
};

export type FeeSplit = {
  grossKrw: number;
  feePercent: number;
  agentDueKrw: number;
  totalFeeKrw: number;
  adminFeeKrw: number;
  parentShares: FeeParentShare[];
};

export function agentDueFromGross(grossKrw: number, feePercent: number): number {
  const fee = Math.min(100, Math.max(0, feePercent));
  const gross = Math.max(0, grossKrw);
  return Math.floor(gross * (1 - fee / 100) + 1e-9);
}

/**
 * Differential fee pool (S01-style, child rate may be higher than parent).
 * chain[0] = leaf partner (volume source), then parents toward admin.
 * Parent i gets (rate[i] - rate[i+1]|0)% of gross; admin gets remainder of leaf fee pool.
 */
export function splitFeePool(grossKrw: number, chain: PartnerNode[]): FeeSplit {
  const gross = Math.max(0, grossKrw);
  const leafRate = chain[0] ? Math.min(100, Math.max(0, chain[0].agentFeePercent)) : 0;
  const agentDueKrw = agentDueFromGross(gross, leafRate);
  const totalFeeKrw = Math.max(0, Math.round(gross) - agentDueKrw);
  const parentShares: FeeParentShare[] = [];
  let allocated = 0;
  for (let i = 1; i < chain.length; i++) {
    const node = chain[i]!;
    const own = Math.min(100, Math.max(0, node.agentFeePercent));
    const next = chain[i + 1]
      ? Math.min(100, Math.max(0, chain[i + 1]!.agentFeePercent))
      : 0;
    const ratePercent = Math.max(0, own - next);
    const dueKrw = Math.floor((gross * ratePercent) / 100 + 1e-9);
    parentShares.push({
      partnerId: node.id,
      code: node.code,
      name: node.name,
      agentUserId: node.agentUserId,
      ratePercent,
      dueKrw,
    });
    allocated += dueKrw;
  }
  const adminFeeKrw = Math.max(0, totalFeeKrw - allocated);
  return {
    grossKrw: Math.round(gross * 100) / 100,
    feePercent: leafRate,
    agentDueKrw,
    totalFeeKrw,
    adminFeeKrw,
    parentShares,
  };
}

const UNSETTLED_BUYS_SQL = `
  SELECT t.id, t.amount_krw, t.updated_at, u.email AS buyer_login_id
  FROM trades t
  JOIN partner_members pm ON pm.user_id = t.buyer_user_id AND pm.partner_id = $1
  JOIN users u ON u.id = t.buyer_user_id
  LEFT JOIN agent_settlement_trades ast ON ast.trade_id = t.id
  WHERE t.kind = 'buy_from_admin'
    AND t.status = 'completed'
    AND ast.trade_id IS NULL
    AND t.updated_at >= $2
    AND t.updated_at < $3
  ORDER BY t.updated_at ASC
`;

export async function listUnsettledBuys(
  partnerId: string,
  from: Date,
  to: Date,
  client?: pg.PoolClient,
): Promise<UnsettledBuy[]> {
  const params = [partnerId, from.toISOString(), to.toISOString()];
  if (client) {
    const r = await client.query<UnsettledBuy>(UNSETTLED_BUYS_SQL, params);
    return r.rows;
  }
  const r = await query<UnsettledBuy>(UNSETTLED_BUYS_SQL, params);
  return r.rows;
}

export function summarizeBuys(buys: UnsettledBuy[], feePercent: number) {
  const grossKrw = buys.reduce((s, b) => s + Number(b.amount_krw), 0);
  const agentDueKrw = agentDueFromGross(grossKrw, feePercent);
  return {
    grossKrw: Math.round(grossKrw * 100) / 100,
    feePercent,
    agentDueKrw,
    tradeCount: buys.length,
    trades: buys.map((b) => ({
      id: b.id,
      amountKrw: Number(b.amount_krw),
      completedAt: b.updated_at.toISOString(),
      loginId: b.buyer_login_id,
    })),
  };
}

export async function loadPartnerFee(partnerId: string): Promise<PartnerNode | null> {
  const r = await query<{
    id: string;
    code: string;
    name: string;
    agent_user_id: string | null;
    agent_fee_percent: string;
    parent_partner_id: string | null;
  }>(
    `SELECT id, code, name, agent_user_id, agent_fee_percent, parent_partner_id
     FROM partners WHERE id = $1`,
    [partnerId],
  );
  if (!r.rowCount) return null;
  const row = r.rows[0];
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    agentUserId: row.agent_user_id,
    agentFeePercent: Number(row.agent_fee_percent),
    parentPartnerId: row.parent_partner_id,
  };
}

/** Leaf → … → top parent (no cycles; depth cap 20). */
export async function loadPartnerAncestorChain(
  partnerId: string,
  client?: pg.PoolClient,
): Promise<PartnerNode[]> {
  const sql = `
    WITH RECURSIVE chain AS (
      SELECT id, code, name, agent_user_id, agent_fee_percent, parent_partner_id, 0 AS depth
      FROM partners WHERE id = $1
      UNION ALL
      SELECT p.id, p.code, p.name, p.agent_user_id, p.agent_fee_percent, p.parent_partner_id, c.depth + 1
      FROM partners p
      JOIN chain c ON p.id = c.parent_partner_id
      WHERE c.depth < 20
    )
    SELECT id, code, name, agent_user_id, agent_fee_percent, parent_partner_id, depth
    FROM chain
    ORDER BY depth ASC`;
  const r = client
    ? await client.query(sql, [partnerId])
    : await query(sql, [partnerId]);
  return r.rows.map((row) => ({
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    agentUserId: (row.agent_user_id as string | null) ?? null,
    agentFeePercent: Number(row.agent_fee_percent),
    parentPartnerId: (row.parent_partner_id as string | null) ?? null,
  }));
}

const COMPLETED_BUYS_SQL = `
  SELECT t.id, t.amount_krw, t.updated_at, u.email AS buyer_login_id
  FROM trades t
  JOIN partner_members pm ON pm.user_id = t.buyer_user_id AND pm.partner_id = $1
  JOIN users u ON u.id = t.buyer_user_id
  WHERE t.kind = 'buy_from_admin'
    AND t.status = 'completed'
    AND t.updated_at >= $2
    AND t.updated_at < $3
  ORDER BY t.updated_at ASC
`;

export async function listCompletedBuys(
  partnerId: string,
  from: Date,
  to: Date,
): Promise<UnsettledBuy[]> {
  const r = await query<UnsettledBuy>(COMPLETED_BUYS_SQL, [
    partnerId,
    from.toISOString(),
    to.toISOString(),
  ]);
  return r.rows;
}

export async function summarizePartnerPeriod(
  partnerId: string,
  from: Date,
  to: Date,
  client?: pg.PoolClient,
  opts?: { unsettledOnly?: boolean },
): Promise<FeeSplit & { tradeCount: number; trades: ReturnType<typeof summarizeBuys>['trades']; chain: PartnerNode[] }> {
  const chain = await loadPartnerAncestorChain(partnerId, client);
  if (!chain.length) throw new Error('Partner not found');
  const unsettledOnly = opts?.unsettledOnly !== false;
  const buys = unsettledOnly
    ? await listUnsettledBuys(partnerId, from, to, client)
    : await listCompletedBuys(partnerId, from, to);
  const grossKrw = buys.reduce((s, b) => s + Number(b.amount_krw), 0);
  const split = splitFeePool(grossKrw, chain);
  return {
    ...split,
    tradeCount: buys.length,
    trades: buys.map((b) => ({
      id: b.id,
      amountKrw: Number(b.amount_krw),
      completedAt: b.updated_at.toISOString(),
      loginId: b.buyer_login_id,
    })),
    chain,
  };
}

/** Descendant partner ids (not including self). */
export async function listDescendantPartnerIds(rootPartnerId: string): Promise<string[]> {
  const r = await query<{ id: string }>(
    `WITH RECURSIVE tree AS (
       SELECT id FROM partners WHERE parent_partner_id = $1
       UNION ALL
       SELECT p.id FROM partners p JOIN tree t ON p.parent_partner_id = t.id
     )
     SELECT id FROM tree`,
    [rootPartnerId],
  );
  return r.rows.map((x) => x.id);
}

/** Unsettled parent override due to this partner from all descendant leaf volumes. */
export async function sumParentOverrideFromDescendants(
  payeePartnerId: string,
  from: Date,
  to: Date,
): Promise<{ dueKrw: number; bySource: { partnerId: string; code: string; name: string; dueKrw: number; grossKrw: number }[] }> {
  const descendants = await listDescendantPartnerIds(payeePartnerId);
  const bySource: { partnerId: string; code: string; name: string; dueKrw: number; grossKrw: number }[] = [];
  let dueKrw = 0;
  for (const leafId of descendants) {
    const summary = await summarizePartnerPeriod(leafId, from, to);
    const share = summary.parentShares.find((s) => s.partnerId === payeePartnerId);
    if (share && share.dueKrw > 0) {
      dueKrw += share.dueKrw;
      bySource.push({
        partnerId: leafId,
        code: summary.chain[0]!.code,
        name: summary.chain[0]!.name,
        dueKrw: share.dueKrw,
        grossKrw: summary.grossKrw,
      });
    }
  }
  return { dueKrw, bySource };
}

export async function completeAgentSettlement(opts: {
  partnerId: string;
  from: Date;
  to: Date;
  note: string;
  adminId: string;
}) {
  return withTransaction(async (client) => {
    const partnerR = await client.query<{
      id: string;
      agent_user_id: string | null;
      agent_fee_percent: string;
    }>(
      `SELECT id, agent_user_id, agent_fee_percent FROM partners WHERE id = $1 FOR UPDATE`,
      [opts.partnerId],
    );
    if (!partnerR.rowCount) throw new Error('Partner not found');
    const partner = partnerR.rows[0];
    const buys = await listUnsettledBuys(opts.partnerId, opts.from, opts.to, client);
    if (!buys.length) throw new Error('정산할 구매 건이 없습니다.');
    const chain = await loadPartnerAncestorChain(opts.partnerId, client);
    const grossKrw = buys.reduce((s, b) => s + Number(b.amount_krw), 0);
    const split = splitFeePool(grossKrw, chain);

    const ins = await client.query<{ id: string }>(
      `INSERT INTO agent_settlements
        (partner_id, agent_user_id, period_start, period_end,
         gross_krw, fee_percent, agent_due_krw, admin_fee_krw, status, completed_by, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'completed',$9,$10)
       RETURNING id`,
      [
        opts.partnerId,
        partner.agent_user_id,
        opts.from.toISOString(),
        opts.to.toISOString(),
        split.grossKrw,
        split.feePercent,
        split.agentDueKrw,
        split.adminFeeKrw,
        opts.adminId,
        opts.note,
      ],
    );
    const settlementId = ins.rows[0].id;
    for (const b of buys) {
      await client.query(
        `INSERT INTO agent_settlement_trades (settlement_id, trade_id) VALUES ($1,$2)`,
        [settlementId, b.id],
      );
    }
    for (const s of split.parentShares) {
      if (!(s.dueKrw > 0)) continue;
      await client.query(
        `INSERT INTO agent_settlement_shares
          (settlement_id, source_partner_id, payee_partner_id, payee_agent_user_id,
           share_kind, rate_percent, due_krw)
         VALUES ($1,$2,$3,$4,'parent_agent',$5,$6)`,
        [settlementId, opts.partnerId, s.partnerId, s.agentUserId, s.ratePercent, s.dueKrw],
      );
    }
    if (split.adminFeeKrw > 0) {
      await client.query(
        `INSERT INTO agent_settlement_shares
          (settlement_id, source_partner_id, payee_partner_id, payee_agent_user_id,
           share_kind, rate_percent, due_krw)
         VALUES ($1,$2,$2,NULL,'admin',$3,$4)`,
        [
          settlementId,
          opts.partnerId,
          Math.max(0, split.feePercent - (split.parentShares[0]?.ratePercent ?? 0)),
          split.adminFeeKrw,
        ],
      );
    }
    return {
      settlementId,
      ...split,
      tradeCount: buys.length,
      agentUserId: partner.agent_user_id,
    };
  });
}

export async function assertValidParent(childId: string, parentId: string | null) {
  if (!parentId) return;
  if (parentId === childId) throw new Error('자기 자신을 상부로 지정할 수 없습니다.');
  const descendants = await listDescendantPartnerIds(childId);
  if (descendants.includes(parentId)) {
    throw new Error('하부를 상부로 지정할 수 없습니다 (순환).');
  }
  const parent = await loadPartnerFee(parentId);
  if (!parent) throw new Error('상부 솔루션을 찾을 수 없습니다.');
  const child = await loadPartnerFee(childId);
  if (!child) throw new Error('솔루션을 찾을 수 없습니다.');
  if (child.agentFeePercent < parent.agentFeePercent) {
    throw new Error(
      `하부 수수료(${child.agentFeePercent}%)는 상부(${parent.agentFeePercent}%) 이상이어야 합니다.`,
    );
  }
}
