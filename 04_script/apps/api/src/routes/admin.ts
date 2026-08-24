import { Router } from 'express';
import { z } from 'zod';
import { hashPassword } from '../auth.js';
import { query } from '../db.js';
import { appendLedger, audit, getBalance } from '../ledger.js';
import { withTransaction } from '../db.js';
import {
  createCustodyTransfer,
  createCustodyWallet,
  getCustodyTotalUsdtCached,
  listCustodyTransfers,
  listCustodyWalletsWithBalances,
  registerCustodyWallet,
  revealCustodyPrivateKey,
  setCustodyTransferStatus,
  setDefaultCustodyWallet,
} from '../custodyWallets.js';
import { ensureDefaultManagedWallet } from '../managedWallet.js';
import { decryptPrivateKey, encryptPrivateKey } from '../walletCrypto.js';
import { requireAdmin, requireAuth, type AuthedRequest } from '../middleware.js';
import {
  fetchAllProviderRates,
  fetchProviderRate,
  FX_REFRESH_INTERVALS,
  isFxRefreshIntervalId,
  isRateProviderId,
  RATE_PROVIDERS,
} from '../rates.js';
import {
  getSiteSettings,
  setAllowMultiAccountBrowser,
  setFxFeePercents,
  setFxRateProvider,
  setFxRateRefreshInterval,
  setFxRateSnapshot,
} from '../settings.js';
import { toPublicUser, type DbUser } from '../types.js';
import { assertLoginId, normalizeLoginId } from '../loginId.js';
import { disableOtherActiveBanks } from '../bankAccounts.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/users', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const qRaw =
    (typeof req.query.q === 'string' && req.query.q) ||
    (typeof req.query.loginId === 'string' && req.query.loginId) ||
    '';
  const q = normalizeLoginId(qRaw);
  const params: unknown[] = [];
  const where: string[] = [`u.status <> 'deleted'`];
  if (status) {
    params.push(status);
    where.push(`u.status = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`u.email ILIKE $${params.length}`);
  }
  const result = await query(
    `SELECT u.*, w.address AS managed_wallet_address, w.id AS managed_wallet_id,
            COALESCE(p_mem.name, p_agent.name) AS solution_name,
            COALESCE(p_mem.code, p_agent.code) AS solution_code
     FROM users u
     LEFT JOIN tether_wallets w
       ON w.user_id = u.id AND w.is_default = true AND w.is_platform_managed = true
     LEFT JOIN partner_members pm ON pm.user_id = u.id
     LEFT JOIN partners p_mem ON p_mem.id = pm.partner_id
     LEFT JOIN partners p_agent ON p_agent.agent_user_id = u.id
     WHERE ${where.join(' AND ')}
     ORDER BY u.created_at DESC
     LIMIT 500`,
    params,
  );
  res.json({
    users: result.rows.map((row) => ({
      ...toPublicUser(row as DbUser),
      managedWalletAddress: row.managed_wallet_address ?? null,
      managedWalletId: row.managed_wallet_id ?? null,
      solutionName: row.solution_name ?? null,
      solutionCode: row.solution_code ?? null,
    })),
  });
});

adminRouter.post('/users', async (req: AuthedRequest, res) => {
  const body = z
    .object({
      email: z.string().min(1).max(80).optional(),
      loginId: z.string().min(1).max(80).optional(),
      password: z.string().min(6),
      displayName: z.string().min(1).max(80).optional(),
      status: z.enum(['pending_approval', 'active']).default('active'),
      role: z.enum(['agent', 'member']).default('member'),
      partnerId: z.string().uuid().optional(),
      parentPartnerId: z.string().uuid().nullable().optional(),
      canBuyTether: z.boolean().optional(),
      canSellTether: z.boolean().optional(),
      bank: z
        .object({
          bankName: z.string().min(1).max(80),
          accountNo: z.string().min(1).max(64),
          holderName: z.string().min(1).max(80),
        })
        .optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  let loginId: string;
  try {
    loginId = assertLoginId(body.data.loginId || body.data.email || '');
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid login id' });
    return;
  }
  if (body.data.role === 'agent' && !body.data.partnerId) {
    res.status(400).json({ error: '에이전트는 솔루션(partnerId)이 필요합니다.' });
    return;
  }
  if (
    body.data.role === 'agent' &&
    body.data.parentPartnerId &&
    body.data.parentPartnerId === body.data.partnerId
  ) {
    res.status(400).json({ error: '상부 솔루션은 본인 솔루션과 달라야 합니다.' });
    return;
  }
  const passwordHash = await hashPassword(body.data.password);
  const canBuy = body.data.canBuyTether !== false;
  const canSell = body.data.canSellTether !== false;
  try {
    if (body.data.role === 'agent' && body.data.parentPartnerId) {
      const { listDescendantPartnerIds } = await import('../agentSettlement.js');
      const parentId = body.data.parentPartnerId;
      const partnerId = body.data.partnerId!;
      const parentExists = await query(`SELECT id FROM partners WHERE id = $1`, [parentId]);
      if (!parentExists.rowCount) throw new Error('상부 솔루션을 찾을 수 없습니다.');
      const descendants = await listDescendantPartnerIds(partnerId);
      if (descendants.includes(parentId)) {
        throw new Error('하부를 상부로 지정할 수 없습니다 (순환).');
      }
    }
    const created = await withTransaction(async (client) => {
      const inserted = await client.query<DbUser>(
        `INSERT INTO users (email, password_hash, display_name, role, status, can_buy_tether, can_sell_tether)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          loginId,
          passwordHash,
          body.data.displayName ?? loginId,
          body.data.role,
          body.data.status,
          canBuy,
          canSell,
        ],
      );
      const user = inserted.rows[0]!;
      if (body.data.role === 'agent') {
        const partnerId = body.data.partnerId!;
        const partner = await client.query<{ id: string; agent_user_id: string | null }>(
          `SELECT id, agent_user_id FROM partners WHERE id = $1 FOR UPDATE`,
          [partnerId],
        );
        if (!partner.rowCount) throw new Error('Solution (partner) not found');
        const prevAgent = partner.rows[0].agent_user_id;
        if (prevAgent && prevAgent !== user.id) {
          throw new Error('이미 에이전트가 지정된 솔루션입니다.');
        }
        await client.query(
          `UPDATE partners SET agent_user_id = NULL, updated_at = now()
           WHERE agent_user_id = $1 AND id <> $2`,
          [user.id, partnerId],
        );
        await client.query(
          `UPDATE partners SET agent_user_id = $1, updated_at = now() WHERE id = $2`,
          [user.id, partnerId],
        );
        if (body.data.parentPartnerId !== undefined) {
          await client.query(
            `UPDATE partners SET parent_partner_id = $2, updated_at = now() WHERE id = $1`,
            [partnerId, body.data.parentPartnerId],
          );
        }
        const linked = await client.query(
          `SELECT id FROM partner_members WHERE user_id = $1 LIMIT 1`,
          [user.id],
        );
        if (!linked.rowCount) {
          await client.query(
            `INSERT INTO partner_members (partner_id, external_user_id, user_id, external_login_id)
             VALUES ($1, $2, $3, $4)`,
            [partnerId, `agent:${user.id}`, user.id, loginId],
          );
        }
      }
      if (body.data.bank) {
        const b = body.data.bank;
        await client.query(
          `INSERT INTO bank_accounts
            (user_id, is_custody, bank_name, account_no, holder_name, status, verified_at)
           VALUES ($1, false, $2, $3, $4, 'active', now())`,
          [user.id, b.bankName, b.accountNo, b.holderName],
        );
      }
      return user;
    });
    await ensureDefaultManagedWallet(created.id);
    await audit(req.user!.id, 'user.create', {
      userId: created.id,
      role: body.data.role,
      partnerId: body.data.partnerId,
      parentPartnerId: body.data.parentPartnerId ?? null,
      status: body.data.status,
      bankAdded: !!body.data.bank,
    });
    res.status(201).json({ user: toPublicUser(created) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('unique') || msg.includes('users_email') || msg.includes('already exists')) {
      res.status(409).json({ error: 'Login id already exists' });
      return;
    }
    if (msg.includes('이미 에이전트가 지정된 솔루션')) {
      res.status(409).json({ error: msg });
      return;
    }
    res.status(400).json({ error: msg });
  }
});

adminRouter.get('/users/:id/managed-wallet', async (req: AuthedRequest, res) => {
  const userId = String(req.params.id);
  const result = await query<{
    id: string;
    address: string;
    label: string;
    status: string;
    private_key_enc: string | null;
    is_platform_managed: boolean;
    is_default: boolean;
    created_at: string;
  }>(
    `SELECT id, address, label, status, private_key_enc, is_platform_managed, is_default, created_at
     FROM tether_wallets
     WHERE user_id = $1 AND is_platform_managed = true AND is_default = true
     LIMIT 1`,
    [userId],
  );
  if (!result.rowCount) {
    res.status(404).json({ error: 'Managed wallet not found' });
    return;
  }
  const row = result.rows[0];
  let privateKey: string | null = null;
  if (row.private_key_enc) {
    try {
      privateKey = decryptPrivateKey(row.private_key_enc);
    } catch {
      res.status(500).json({ error: 'Failed to decrypt private key' });
      return;
    }
  }
  await audit(req.user!.id, 'wallet.reveal_private_key', { userId, walletId: row.id });
  res.json({
    wallet: {
      id: row.id,
      address: row.address,
      label: row.label,
      status: row.status,
      isPlatformManaged: row.is_platform_managed,
      isDefault: row.is_default,
      privateKey,
      createdAt: row.created_at,
    },
  });
});

adminRouter.post('/users/:id/ensure-managed-wallet', async (req: AuthedRequest, res) => {
  const userId = String(req.params.id);
  const user = await query(`SELECT id FROM users WHERE id = $1 AND role IN ('member', 'agent')`, [userId]);
  if (!user.rowCount) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const wallet = await ensureDefaultManagedWallet(userId);
  await audit(req.user!.id, 'wallet.ensure_managed', { userId, walletId: wallet.id });
  res.json({ wallet });
});

adminRouter.patch('/users/:id', async (req: AuthedRequest, res) => {
  const body = z
    .object({
      displayName: z.string().min(1).max(80).optional(),
      loginId: z.string().min(1).max(80).optional(),
      password: z.string().min(6).max(128).optional(),
      status: z.enum(['pending_approval', 'active', 'suspended', 'rejected', 'deleted']).optional(),
      canBuyTether: z.boolean().optional(),
      canSellTether: z.boolean().optional(),
      role: z.enum(['agent', 'member']).optional(),
      partnerId: z.string().uuid().optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  const userId = String(req.params.id);
  const existing = await query<DbUser>(`SELECT * FROM users WHERE id = $1`, [userId]);
  if (!existing.rowCount) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const row = existing.rows[0];
  if (row.role === 'admin') {
    res.status(400).json({ error: 'Cannot change admin account this way' });
    return;
  }
  if (body.data.status) {
    const from = row.status;
    if (body.data.status === 'rejected' && from !== 'pending_approval') {
      res.status(409).json({ error: 'Only pending users can be rejected' });
      return;
    }
    if (body.data.status === 'suspended' && from !== 'active') {
      res.status(409).json({ error: 'Only active users can be suspended' });
      return;
    }
  }
  if (body.data.role === 'agent' && !body.data.partnerId) {
    // allow omitting partnerId if already agent of a partner or mapped as member
    const mapped = await query<{ partner_id: string }>(
      `SELECT partner_id FROM partner_members WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    const asAgent = await query<{ id: string }>(
      `SELECT id FROM partners WHERE agent_user_id = $1 LIMIT 1`,
      [userId],
    );
    if (!mapped.rowCount && !asAgent.rowCount) {
      res.status(400).json({ error: 'Agent requires partnerId (solution)' });
      return;
    }
  }
  let loginId: string | null = null;
  if (body.data.loginId !== undefined) {
    try {
      loginId = assertLoginId(body.data.loginId);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid login id' });
      return;
    }
    if (loginId !== row.email) {
      const clash = await query(`SELECT id FROM users WHERE lower(email) = $1 AND id <> $2`, [loginId, userId]);
      if (clash.rowCount) {
        res.status(409).json({ error: 'Login id already exists' });
        return;
      }
    }
  }
  let passwordHash: string | null = null;
  if (body.data.password) {
    passwordHash = await hashPassword(body.data.password);
  }
  try {
    const result = await withTransaction(async (client) => {
      await client.query(
        `UPDATE users SET
           display_name = COALESCE($2, display_name),
           email = COALESCE($3, email),
           password_hash = COALESCE($4, password_hash),
           status = COALESCE($5, status),
           can_buy_tether = COALESCE($6, can_buy_tether),
           can_sell_tether = COALESCE($7, can_sell_tether),
           updated_at = now()
         WHERE id = $1`,
        [
          userId,
          body.data.displayName ?? null,
          loginId,
          passwordHash,
          body.data.status ?? null,
          body.data.canBuyTether ?? null,
          body.data.canSellTether ?? null,
        ],
      );
      if (loginId) {
        await client.query(
          `UPDATE partner_members SET external_login_id = $2, updated_at = now() WHERE user_id = $1`,
          [userId, loginId],
        );
      }

      if (body.data.role === 'member') {
        await client.query(
          `UPDATE partners SET agent_user_id = NULL, updated_at = now() WHERE agent_user_id = $1`,
          [userId],
        );
        await client.query(`UPDATE users SET role = 'member', updated_at = now() WHERE id = $1`, [userId]);
      }

      if (body.data.role === 'agent') {
        let partnerId = body.data.partnerId;
        if (!partnerId) {
          const mapped = await client.query<{ partner_id: string }>(
            `SELECT partner_id FROM partner_members WHERE user_id = $1 LIMIT 1`,
            [userId],
          );
          partnerId = mapped.rows[0]?.partner_id;
        }
        if (!partnerId) {
          const asAgent = await client.query<{ id: string }>(
            `SELECT id FROM partners WHERE agent_user_id = $1 LIMIT 1`,
            [userId],
          );
          partnerId = asAgent.rows[0]?.id;
        }
        if (!partnerId) throw new Error('Agent requires partnerId (solution)');
        const partner = await client.query<{ id: string; agent_user_id: string | null }>(
          `SELECT id, agent_user_id FROM partners WHERE id = $1 FOR UPDATE`,
          [partnerId],
        );
        if (!partner.rowCount) throw new Error('Solution (partner) not found');
        const prevAgent = partner.rows[0].agent_user_id;
        if (prevAgent && prevAgent !== userId) {
          throw new Error('이미 에이전트가 지정된 솔루션입니다.');
        }
        // clear this user as agent elsewhere
        await client.query(
          `UPDATE partners SET agent_user_id = NULL, updated_at = now()
           WHERE agent_user_id = $1 AND id <> $2`,
          [userId, partnerId],
        );
        await client.query(
          `UPDATE partners SET agent_user_id = $1, updated_at = now() WHERE id = $2`,
          [userId, partnerId],
        );
        await client.query(`UPDATE users SET role = 'agent', updated_at = now() WHERE id = $1`, [userId]);
        const existingLink = await client.query<{ partner_id: string }>(
          `SELECT partner_id FROM partner_members WHERE user_id = $1 LIMIT 1`,
          [userId],
        );
        if (existingLink.rowCount) {
          if (existingLink.rows[0].partner_id !== partnerId) {
            throw new Error('User already mapped to another solution');
          }
        } else {
          await client.query(
            `INSERT INTO partner_members (partner_id, external_user_id, user_id, external_login_id)
             VALUES ($1, $2, $3, $4)`,
            [partnerId, `agent:${userId}`, userId, row.email],
          );
        }
      }
      const updated = await client.query<DbUser>(`SELECT * FROM users WHERE id = $1`, [userId]);
      return updated.rows[0];
    });

    await audit(req.user!.id, 'user.patch', {
      userId,
      displayName: body.data.displayName,
      loginId: loginId || undefined,
      passwordChanged: !!passwordHash,
      status: body.data.status,
      role: body.data.role,
      partnerId: body.data.partnerId,
      canBuyTether: body.data.canBuyTether,
      canSellTether: body.data.canSellTether,
    });
    res.json({ user: toPublicUser(result) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('unique') || msg.includes('users_email')) {
      res.status(409).json({ error: 'Login id already exists' });
      return;
    }
    if (msg.includes('이미 에이전트가 지정된 솔루션')) {
      res.status(409).json({ error: msg });
      return;
    }
    res.status(400).json({ error: msg });
  }
});

async function setStatus(req: AuthedRequest, res: import('express').Response, status: string) {
  const result = await query<DbUser>(
    `UPDATE users SET status = $2, updated_at = now() WHERE id = $1 AND role IN ('member', 'agent') RETURNING *`,
    [req.params.id, status],
  );
  if (!result.rowCount) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  await audit(req.user!.id, `user.${status}`, { userId: req.params.id });
  res.json({ user: toPublicUser(result.rows[0]) });
}

adminRouter.post('/users/:id/approve', async (req: AuthedRequest, res) => {
  const userId = String(req.params.id);
  const existing = await query<DbUser>(`SELECT * FROM users WHERE id = $1 AND role IN ('member', 'agent')`, [userId]);
  if (!existing.rowCount) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const result = await query<DbUser>(
    `UPDATE users SET status = 'active', updated_at = now() WHERE id = $1 AND role IN ('member', 'agent') RETURNING *`,
    [userId],
  );
  const wallet = await ensureDefaultManagedWallet(userId);
  await audit(req.user!.id, 'user.active', { userId, walletId: wallet.id });
  res.json({
    user: toPublicUser(result.rows[0]),
    managedWalletAddress: wallet.address,
    managedWalletId: wallet.id,
  });
});

adminRouter.post('/users/:id/reject', async (req: AuthedRequest, res) => {
  const userId = String(req.params.id);
  const existing = await query<DbUser>(`SELECT * FROM users WHERE id = $1 AND role IN ('member', 'agent')`, [userId]);
  if (!existing.rowCount) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (existing.rows[0].status !== 'pending_approval') {
    res.status(409).json({ error: 'Only pending users can be rejected (already approved cannot be rejected)' });
    return;
  }
  await setStatus(req, res, 'rejected');
});

adminRouter.post('/users/:id/suspend', async (req: AuthedRequest, res) => {
  const userId = String(req.params.id);
  const existing = await query<DbUser>(`SELECT * FROM users WHERE id = $1 AND role IN ('member', 'agent')`, [userId]);
  if (!existing.rowCount) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (existing.rows[0].status !== 'active') {
    res.status(409).json({ error: 'Only active users can be suspended' });
    return;
  }
  await setStatus(req, res, 'suspended');
});

async function loadMemberProfileByLoginId(loginIdRaw: string) {
  const loginId = normalizeLoginId(loginIdRaw);
  if (!loginId) return null;
  const result = await query(
    `SELECT u.*, w.address AS managed_wallet_address,
            COALESCE(p_mem.name, p_agent.name) AS solution_name,
            COALESCE(p_mem.code, p_agent.code) AS solution_code,
            pm.external_login_id
     FROM users u
     LEFT JOIN tether_wallets w
       ON w.user_id = u.id AND w.is_default = true AND w.is_platform_managed = true
     LEFT JOIN partner_members pm ON pm.user_id = u.id
     LEFT JOIN partners p_mem ON p_mem.id = pm.partner_id
     LEFT JOIN partners p_agent ON p_agent.agent_user_id = u.id
     WHERE lower(u.email) = $1 AND u.status <> 'deleted'
     LIMIT 1`,
    [loginId],
  );
  if (!result.rowCount) return null;
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
  return {
    user: {
      ...toPublicUser(row as DbUser),
      managedWalletAddress: row.managed_wallet_address ?? null,
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
  };
}

adminRouter.get('/members/:loginId', async (req, res) => {
  const profile = await loadMemberProfileByLoginId(String(req.params.loginId || ''));
  if (!profile) {
    res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
    return;
  }
  res.json(profile);
});

adminRouter.patch('/members/:loginId', async (req: AuthedRequest, res) => {
  const profile = await loadMemberProfileByLoginId(String(req.params.loginId || ''));
  if (!profile) {
    res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
    return;
  }
  const userId = profile.user.id;
  if (profile.user.role === 'admin') {
    res.status(400).json({ error: '관리자 계정은 이 화면에서 수정할 수 없습니다.' });
    return;
  }
  const body = z
    .object({
      displayName: z.string().min(1).max(80).optional(),
      loginId: z.string().min(1).max(80).optional(),
      password: z.string().min(6).max(128).optional(),
      status: z.enum(['pending_approval', 'active', 'suspended', 'rejected']).optional(),
      canBuyTether: z.boolean().optional(),
      canSellTether: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  const existing = await query<DbUser>(`SELECT * FROM users WHERE id = $1`, [userId]);
  const row = existing.rows[0];
  if (!row) {
    res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
    return;
  }
  if (body.data.status) {
    const from = row.status;
    if (body.data.status === 'rejected' && from !== 'pending_approval') {
      res.status(409).json({ error: '승인 대기 회원만 거절할 수 있습니다.' });
      return;
    }
    if (body.data.status === 'suspended' && from !== 'active' && from !== 'suspended') {
      res.status(409).json({ error: '활성 회원만 정지할 수 있습니다.' });
      return;
    }
  }
  let nextLoginId: string | null = null;
  if (body.data.loginId !== undefined) {
    try {
      nextLoginId = assertLoginId(body.data.loginId);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : 'Invalid login id' });
      return;
    }
    if (nextLoginId !== row.email) {
      const clash = await query(`SELECT id FROM users WHERE lower(email) = $1 AND id <> $2`, [
        nextLoginId,
        userId,
      ]);
      if (clash.rowCount) {
        res.status(409).json({ error: 'Login id already exists' });
        return;
      }
    }
  }
  let passwordHash: string | null = null;
  if (body.data.password) {
    passwordHash = await hashPassword(body.data.password);
  }
  try {
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE users SET
           display_name = COALESCE($2, display_name),
           email = COALESCE($3, email),
           password_hash = COALESCE($4, password_hash),
           status = COALESCE($5, status),
           can_buy_tether = COALESCE($6, can_buy_tether),
           can_sell_tether = COALESCE($7, can_sell_tether),
           updated_at = now()
         WHERE id = $1`,
        [
          userId,
          body.data.displayName ?? null,
          nextLoginId,
          passwordHash,
          body.data.status ?? null,
          body.data.canBuyTether ?? null,
          body.data.canSellTether ?? null,
        ],
      );
      if (nextLoginId) {
        await client.query(
          `UPDATE partner_members SET external_login_id = $2, updated_at = now() WHERE user_id = $1`,
          [userId, nextLoginId],
        );
      }
    });
    await audit(req.user!.id, 'user.patch', {
      userId,
      via: 'member_popup',
      displayName: body.data.displayName,
      loginId: nextLoginId || undefined,
      passwordChanged: !!passwordHash,
      status: body.data.status,
      canBuyTether: body.data.canBuyTether,
      canSellTether: body.data.canSellTether,
    });
    const updated = await loadMemberProfileByLoginId(nextLoginId || row.email);
    res.json(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('unique') || msg.includes('users_email')) {
      res.status(409).json({ error: 'Login id already exists' });
      return;
    }
    res.status(400).json({ error: msg });
  }
});

adminRouter.put('/members/:loginId/banks', async (req: AuthedRequest, res) => {
  const profile = await loadMemberProfileByLoginId(String(req.params.loginId || ''));
  if (!profile) {
    res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
    return;
  }
  const userId = profile.user.id;
  const body = z
    .object({
      banks: z
        .array(
          z.object({
            id: z.string().uuid().optional(),
            bankName: z.string().min(1).max(80),
            accountNo: z.string().min(1).max(64),
            holderName: z.string().min(1).max(80),
            status: z.enum(['pending', 'active', 'disabled']).default('active'),
          }),
        )
        .max(20),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  const activeBanks = body.data.banks.filter((b) => b.status === 'active');
  if (activeBanks.length > 1) {
    res.status(400).json({ error: '활성 원화 계좌는 회원당 1개만 가능합니다.' });
    return;
  }
  try {
    await withTransaction(async (client) => {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM bank_accounts WHERE user_id = $1 AND is_custody = false FOR UPDATE`,
        [userId],
      );
      const keep = new Set<string>();
      let activeId: string | null = null;
      for (const b of body.data.banks) {
        if (b.id) {
          const owned = existing.rows.some((r) => r.id === b.id);
          if (!owned) throw new Error('Invalid bank id');
          await client.query(
            `UPDATE bank_accounts
             SET bank_name = $2, account_no = $3, holder_name = $4, status = $5
             WHERE id = $1 AND user_id = $6`,
            [b.id, b.bankName, b.accountNo, b.holderName, b.status, userId],
          );
          keep.add(b.id);
          if (b.status === 'active') activeId = b.id;
        } else {
          const ins = await client.query<{ id: string }>(
            `INSERT INTO bank_accounts
              (user_id, is_custody, bank_name, account_no, holder_name, status, verified_at)
             VALUES ($1, false, $2, $3, $4, $5, CASE WHEN $5 = 'active' THEN now() ELSE NULL END)
             RETURNING id`,
            [userId, b.bankName, b.accountNo, b.holderName, b.status],
          );
          keep.add(ins.rows[0]!.id);
          if (b.status === 'active') activeId = ins.rows[0]!.id;
        }
      }
      for (const row of existing.rows) {
        if (!keep.has(row.id)) {
          await client.query(
            `UPDATE bank_accounts SET status = 'disabled' WHERE id = $1 AND user_id = $2`,
            [row.id, userId],
          );
        }
      }
      if (activeId) {
        await disableOtherActiveBanks(userId, activeId, client);
      }
    });
    await audit(req.user!.id, 'member.banks.put', {
      userId,
      loginId: profile.user.email,
      count: body.data.banks.length,
    });
    const updated = await loadMemberProfileByLoginId(profile.user.email);
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : '저장 실패' });
  }
});

adminRouter.get('/members/:loginId/transactions', async (req, res) => {
  const loginId = normalizeLoginId(String(req.params.loginId || ''));
  if (!loginId) {
    res.status(400).json({ error: 'Invalid login id' });
    return;
  }
  const u = await query<{ id: string }>(
    `SELECT id FROM users WHERE lower(email) = $1 AND status <> 'deleted' LIMIT 1`,
    [loginId],
  );
  if (!u.rowCount) {
    res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
    return;
  }
  const result = await query(
    `SELECT le.*, u.email AS login_id
     FROM ledger_entries le
     JOIN users u ON u.id = le.user_id
     WHERE le.user_id = $1
     ORDER BY le.created_at DESC
     LIMIT 500`,
    [u.rows[0].id],
  );
  res.json({
    loginId,
    transactions: result.rows.map((t) => ({
      id: t.id,
      asset: t.asset,
      direction: t.direction,
      amount: Number(t.amount),
      balanceAfter: Number(t.balance_after),
      refType: t.ref_type,
      note: t.note,
      createdAt: t.created_at,
    })),
  });
});

adminRouter.get('/members/:loginId/access-logs', async (req, res) => {
  const loginId = normalizeLoginId(String(req.params.loginId || ''));
  if (!loginId) {
    res.status(400).json({ error: 'Invalid login id' });
    return;
  }
  const u = await query<{ id: string }>(
    `SELECT id FROM users WHERE lower(email) = $1 AND status <> 'deleted' LIMIT 1`,
    [loginId],
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

adminRouter.get('/transactions', async (req, res) => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
  const loginIdRaw = typeof req.query.loginId === 'string' ? req.query.loginId : undefined;
  const asset = typeof req.query.asset === 'string' ? req.query.asset : undefined;
  let resolvedUserId = userId;
  if (!resolvedUserId && loginIdRaw) {
    const loginId = normalizeLoginId(loginIdRaw);
    if (loginId) {
      const u = await query<{ id: string }>(`SELECT id FROM users WHERE lower(email) = $1 LIMIT 1`, [loginId]);
      if (!u.rowCount) {
        res.json({ transactions: [], filterUserId: null, filterLoginId: loginId });
        return;
      }
      resolvedUserId = u.rows[0].id;
    }
  }
  const params: unknown[] = [];
  const where: string[] = [];
  if (resolvedUserId) {
    params.push(resolvedUserId);
    where.push(`le.user_id = $${params.length}`);
  }
  if (asset) {
    params.push(asset);
    where.push(`le.asset = $${params.length}`);
  }
  const sql = `SELECT le.*, u.email AS login_id FROM ledger_entries le
    LEFT JOIN users u ON u.id = le.user_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY le.created_at DESC LIMIT 500`;
  const result = await query(sql, params);
  let filterLoginId: string | null = loginIdRaw ? normalizeLoginId(loginIdRaw) : null;
  if (!filterLoginId && resolvedUserId) {
    const u = await query<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [resolvedUserId]);
    filterLoginId = u.rows[0]?.email ?? null;
  }
  res.json({
    transactions: result.rows,
    filterUserId: resolvedUserId ?? null,
    filterLoginId,
  });
});

adminRouter.post('/ledger-adjust', async (req: AuthedRequest, res) => {
  const body = z
    .object({
      userId: z.string().uuid().optional(),
      loginId: z.string().min(1).max(80).optional(),
      asset: z.enum(['krw', 'usdt']),
      direction: z.enum(['credit', 'debit']),
      amount: z.number().positive(),
      note: z.string().max(500).optional(),
    })
    .refine((d) => !!(d.userId || d.loginId), { message: 'loginId or userId required' })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  try {
    let userId = body.data.userId;
    if (!userId && body.data.loginId) {
      const loginId = normalizeLoginId(body.data.loginId);
      const u = await query<{ id: string }>(
        `SELECT id FROM users WHERE lower(email) = $1 LIMIT 1`,
        [loginId],
      );
      if (!u.rowCount) {
        res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
        return;
      }
      userId = u.rows[0].id;
    }
    const entry = await withTransaction(async (client) =>
      appendLedger(client, {
        userId: userId!,
        asset: body.data.asset,
        direction: body.data.direction,
        amount: body.data.amount,
        refType: 'admin_adjust',
        note: body.data.note ?? '',
      }),
    );
    await audit(req.user!.id, 'ledger.adjust', {
      userId,
      loginId: body.data.loginId ?? null,
      asset: body.data.asset,
      direction: body.data.direction,
      amount: body.data.amount,
      note: body.data.note ?? '',
    });
    res.status(201).json({ entry });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Adjust failed' });
  }
});

adminRouter.get('/partners', async (_req, res) => {
  const result = await query(
    `SELECT p.id, p.code, p.name, p.status, p.agent_user_id, p.agent_fee_percent,
            p.parent_partner_id, u.email AS agent_login_id,
            pp.code AS parent_code, pp.name AS parent_name,
            pu.email AS parent_agent_login_id
     FROM partners p
     LEFT JOIN users u ON u.id = p.agent_user_id
     LEFT JOIN partners pp ON pp.id = p.parent_partner_id
     LEFT JOIN users pu ON pu.id = pp.agent_user_id
     ORDER BY p.code ASC`,
  );
  res.json({
    partners: result.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      status: row.status,
      agentUserId: row.agent_user_id,
      agentLoginId: row.agent_login_id,
      agentFeePercent: Number(row.agent_fee_percent),
      parentPartnerId: row.parent_partner_id ?? null,
      parentCode: row.parent_code ?? null,
      parentName: row.parent_name ?? null,
      parentAgentLoginId: row.parent_agent_login_id ?? null,
    })),
  });
});

type SolutionKeyDbRow = {
  id: string;
  code: string;
  name: string;
  status: string;
  api_key_hash?: string | null;
  api_key_prefix?: string;
  api_public_key?: string;
  api_secret_enc?: string;
  api_key_issued_at?: string | null;
  callback_base_url?: string;
  virtual_deposit_address?: string;
  created_at?: string;
};

function decryptPartnerSecret(enc?: string | null): string {
  if (!enc) return '';
  try {
    return decryptPrivateKey(enc);
  } catch {
    return '';
  }
}

function toSolutionKeyRow(row: SolutionKeyDbRow, issuedKeys?: { publicKey?: string; privateKey?: string }) {
  const issued = !!(row.api_key_hash && String(row.api_key_hash).length === 64);
  const publicKey = issuedKeys?.publicKey || row.api_public_key || '';
  const privateKey = issuedKeys?.privateKey || decryptPartnerSecret(row.api_secret_enc);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    keyIssued: issued,
    publicKey: issued ? publicKey : '',
    privateKey: issued ? privateKey : '',
    keyPrefix: issued ? publicKey || row.api_key_prefix || '••••' : '',
    keyIssuedAt: row.api_key_issued_at ?? null,
    callbackBaseUrl: row.callback_base_url ?? '',
    virtualDepositAddress: row.virtual_deposit_address ?? '',
    createdAt: row.created_at,
  };
}

/** Solution API keys — only issued keys may call Partner API / virtual transfer. */
adminRouter.get('/solution-keys', async (_req, res) => {
  const result = await query<SolutionKeyDbRow>(
    `SELECT id, code, name, status, api_key_hash, api_key_prefix, api_public_key, api_secret_enc,
            api_key_issued_at, callback_base_url, virtual_deposit_address, created_at
     FROM partners
     ORDER BY code ASC`,
  );
  const { generatePartnerKeyPair, apiKeyMatches } = await import('../partner/crypto.js');
  const solutions = [];
  for (const row of result.rows) {
    const issued = !!(row.api_key_hash && String(row.api_key_hash).length === 64);
    let publicKey = row.api_public_key || '';
    let secretEnc = row.api_secret_enc || '';
    const publicLooksTruncated = !publicKey || publicKey.includes('…') || publicKey.length < 20;
    if (issued && publicLooksTruncated) {
      publicKey = generatePartnerKeyPair(row.code).publicKey;
      await query(`UPDATE partners SET api_public_key = $2, api_key_prefix = $2, updated_at = now() WHERE id = $1`, [
        row.id,
        publicKey,
      ]);
      row.api_public_key = publicKey;
      row.api_key_prefix = publicKey;
    }
    if (issued && !secretEnc) {
      const envKey =
        row.code === 's01' ? process.env.S01_PARTNER_API_KEY?.trim() || '' : '';
      if (envKey && row.api_key_hash && apiKeyMatches(envKey, row.api_key_hash)) {
        secretEnc = encryptPrivateKey(envKey);
        await query(`UPDATE partners SET api_secret_enc = $2, updated_at = now() WHERE id = $1`, [row.id, secretEnc]);
        row.api_secret_enc = secretEnc;
      }
    }
    solutions.push(toSolutionKeyRow(row));
  }
  res.json({ solutions });
});

adminRouter.post('/solution-keys', async (req: AuthedRequest, res) => {
  const body = z
    .object({
      code: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9][a-z0-9_-]{0,31}$/, '코드는 영문·숫자·하이픈·밑줄만 (최대 32자)'),
      name: z.string().trim().min(1).max(120),
      callbackBaseUrl: z.string().trim().max(500).optional().default(''),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: '코드·이름이 필요합니다. 코드는 영문 소문자·숫자·하이픈·밑줄만 사용합니다.' });
    return;
  }
  const { generateVirtualDepositAddress } = await import('../partner/crypto.js');
  try {
    const inserted = await query<SolutionKeyDbRow>(
      `INSERT INTO partners
         (code, name, api_key_hash, api_key_prefix, api_public_key, api_secret_enc,
          callback_base_url, virtual_deposit_address, status)
       VALUES ($1, $2, '', '', '', '', $3, $4, 'active')
       RETURNING id, code, name, status, api_key_hash, api_key_prefix, api_public_key, api_secret_enc,
                 api_key_issued_at, callback_base_url, virtual_deposit_address, created_at`,
      [body.data.code, body.data.name, body.data.callbackBaseUrl, generateVirtualDepositAddress()],
    );
    const row = inserted.rows[0];
    await audit(req.user!.id, 'partner.create', { partnerId: row.id, code: row.code });
    res.status(201).json({ solution: toSolutionKeyRow(row) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('partners_code') || msg.includes('partners_code_key')) {
      res.status(409).json({ error: '이미 있는 솔루션 코드입니다.' });
      return;
    }
    res.status(400).json({ error: msg || '등록 실패' });
  }
});

adminRouter.post('/solution-keys/:id/issue', async (req: AuthedRequest, res) => {
  const partnerId = String(req.params.id);
  const partner = await query<{ id: string; code: string }>(
    `SELECT id, code FROM partners WHERE id = $1`,
    [partnerId],
  );
  if (!partner.rowCount) {
    res.status(404).json({ error: 'Solution not found' });
    return;
  }
  const { generatePartnerKeyPair, hashApiKey } = await import('../partner/crypto.js');
  const code = partner.rows[0].code;
  const { publicKey, privateKey } = generatePartnerKeyPair(code);
  const updated = await query<SolutionKeyDbRow>(
    `UPDATE partners
     SET api_key_hash = $2,
         api_key_prefix = $3,
         api_public_key = $3,
         api_secret_enc = $4,
         api_key_issued_at = now(),
         status = 'active',
         updated_at = now()
     WHERE id = $1
     RETURNING id, code, name, status, api_key_hash, api_key_prefix, api_public_key, api_secret_enc,
               api_key_issued_at, callback_base_url, virtual_deposit_address`,
    [partnerId, hashApiKey(privateKey), publicKey, encryptPrivateKey(privateKey)],
  );
  const row = updated.rows[0];
  await audit(req.user!.id, 'partner_api_key_issue', { partnerId, code });
  res.json({
    solution: toSolutionKeyRow(row, { publicKey, privateKey }),
    publicKey,
    privateKey,
    apiKey: privateKey,
    warning: '공개키·개인키를 솔루션에 전달하세요. 개인키는 TPS_PARTNER_KEY(X-Partner-Key)입니다.',
  });
});

adminRouter.post('/solution-keys/:id/revoke', async (req: AuthedRequest, res) => {
  const partnerId = String(req.params.id);
  const updated = await query<SolutionKeyDbRow>(
    `UPDATE partners
     SET api_key_hash = '',
         api_key_prefix = '',
         api_public_key = '',
         api_secret_enc = '',
         api_key_issued_at = NULL,
         updated_at = now()
     WHERE id = $1
     RETURNING id, code, name, status, api_key_hash, api_key_prefix, api_public_key, api_secret_enc,
               api_key_issued_at, callback_base_url, virtual_deposit_address`,
    [partnerId],
  );
  if (!updated.rowCount) {
    res.status(404).json({ error: 'Solution not found' });
    return;
  }
  await audit(req.user!.id, 'partner_api_key_revoke', {
    partnerId,
    code: updated.rows[0].code,
  });
  res.json({
    solution: toSolutionKeyRow(updated.rows[0]),
  });
});

adminRouter.patch('/solution-keys/:id', async (req: AuthedRequest, res) => {
  const body = z
    .object({
      status: z.enum(['active', 'disabled']).optional(),
      name: z.string().min(1).max(120).optional(),
      callbackBaseUrl: z.string().max(500).optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  const partnerId = String(req.params.id);
  const updated = await query<SolutionKeyDbRow>(
    `UPDATE partners
     SET status = COALESCE($2, status),
         name = COALESCE($3, name),
         callback_base_url = COALESCE($4, callback_base_url),
         updated_at = now()
     WHERE id = $1
     RETURNING id, code, name, status, callback_base_url,
               api_key_hash, api_key_prefix, api_public_key, api_secret_enc,
               api_key_issued_at, virtual_deposit_address`,
    [
      partnerId,
      body.data.status ?? null,
      body.data.name ?? null,
      body.data.callbackBaseUrl ?? null,
    ],
  );
  if (!updated.rowCount) {
    res.status(404).json({ error: 'Solution not found' });
    return;
  }
  const row = updated.rows[0];
  await audit(req.user!.id, 'partner.patch', {
    partnerId,
    status: body.data.status ?? null,
    name: body.data.name ?? null,
  });
  res.json({
    solution: toSolutionKeyRow(row),
  });
});

adminRouter.get('/partners/tree', async (_req, res) => {
  const result = await query(
    `SELECT p.id, p.code, p.name, p.status, p.agent_user_id, p.agent_fee_percent,
            p.parent_partner_id, u.email AS agent_login_id, u.display_name AS agent_display_name
     FROM partners p
     LEFT JOIN users u ON u.id = p.agent_user_id
     WHERE p.status = 'active'
     ORDER BY p.code ASC`,
  );
  const nodes = result.rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    agentUserId: row.agent_user_id,
    agentLoginId: row.agent_login_id,
    agentDisplayName: row.agent_display_name,
    agentFeePercent: Number(row.agent_fee_percent),
    parentPartnerId: row.parent_partner_id ?? null,
  }));
  res.json({ nodes });
});

adminRouter.patch('/partners/:id/parent', async (req: AuthedRequest, res) => {
  const partnerId = String(req.params.id);
  const body = z
    .object({
      parentPartnerId: z.string().uuid().nullable(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'parentPartnerId uuid or null required' });
    return;
  }
  try {
    const { assertValidParent } = await import('../agentSettlement.js');
    await assertValidParent(partnerId, body.data.parentPartnerId);
    const result = await query(
      `UPDATE partners SET parent_partner_id = $2, updated_at = now()
       WHERE id = $1
       RETURNING id, code, name, parent_partner_id, agent_fee_percent, agent_user_id`,
      [partnerId, body.data.parentPartnerId],
    );
    if (!result.rowCount) {
      res.status(404).json({ error: 'Partner not found' });
      return;
    }
    await audit(req.user!.id, 'partner.parent', {
      partnerId,
      parentPartnerId: body.data.parentPartnerId,
    });
    const row = result.rows[0];
    res.json({
      partner: {
        id: row.id,
        code: row.code,
        name: row.name,
        parentPartnerId: row.parent_partner_id,
        agentFeePercent: Number(row.agent_fee_percent),
        agentUserId: row.agent_user_id,
      },
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : '상부 지정 실패' });
  }
});

adminRouter.patch('/partners/:id/agent-fee', async (req: AuthedRequest, res) => {
  const partnerId = String(req.params.id);
  const body = z
    .object({ agentFeePercent: z.number().min(0).max(100) })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'agentFeePercent must be 0–100' });
    return;
  }
  const existing = await query<{ parent_partner_id: string | null }>(
    `SELECT parent_partner_id FROM partners WHERE id = $1`,
    [partnerId],
  );
  if (!existing.rowCount) {
    res.status(404).json({ error: 'Partner not found' });
    return;
  }
  if (existing.rows[0].parent_partner_id) {
    const parent = await query<{ agent_fee_percent: string }>(
      `SELECT agent_fee_percent FROM partners WHERE id = $1`,
      [existing.rows[0].parent_partner_id],
    );
    if (parent.rowCount && body.data.agentFeePercent < Number(parent.rows[0].agent_fee_percent)) {
      res.status(400).json({
        error: `하부 수수료는 상부(${Number(parent.rows[0].agent_fee_percent)}%) 이상이어야 합니다.`,
      });
      return;
    }
  }
  const childMin = await query<{ min: string | null }>(
    `SELECT MIN(agent_fee_percent)::text AS min FROM partners WHERE parent_partner_id = $1`,
    [partnerId],
  );
  if (childMin.rows[0]?.min != null && body.data.agentFeePercent > Number(childMin.rows[0].min)) {
    // parent rate must be <= all children
    res.status(400).json({
      error: `상부 수수료는 하부 최소값(${Number(childMin.rows[0].min)}%) 이하여야 합니다.`,
    });
    return;
  }
  const result = await query(
    `UPDATE partners SET agent_fee_percent = $2, updated_at = now()
     WHERE id = $1
     RETURNING id, code, name, agent_fee_percent, agent_user_id, parent_partner_id`,
    [partnerId, body.data.agentFeePercent],
  );
  if (!result.rowCount) {
    res.status(404).json({ error: 'Partner not found' });
    return;
  }
  await audit(req.user!.id, 'partner.agent_fee', {
    partnerId,
    agentFeePercent: body.data.agentFeePercent,
  });
  const row = result.rows[0];
  res.json({
    partner: {
      id: row.id,
      code: row.code,
      name: row.name,
      agentUserId: row.agent_user_id,
      agentFeePercent: Number(row.agent_fee_percent),
      parentPartnerId: row.parent_partner_id,
    },
  });
});

adminRouter.get('/deposit-series', async (req, res) => {
  try {
    const { loadDepositSeries, parseSeriesDays } = await import('../depositSeries.js');
    const days = parseSeriesDays(req.query.days, 7);
    const data = await loadDepositSeries({ days });
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Deposit series failed' });
  }
});

adminRouter.get('/agent-stats', async (req, res) => {
  const fromRaw = typeof req.query.from === 'string' ? req.query.from : '';
  const toRaw = typeof req.query.to === 'string' ? req.query.to : '';
  const from = fromRaw ? new Date(fromRaw) : new Date(Date.now() - 30 * 86400000);
  const to = toRaw ? new Date(toRaw) : new Date(Date.now() + 86400000);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || !(to > from)) {
    res.status(400).json({ error: 'from, to (ISO, to > from) required' });
    return;
  }
  try {
    const { summarizePartnerPeriod } = await import('../agentSettlement.js');
    const partners = await query<{
      id: string;
      code: string;
      name: string;
      agent_fee_percent: string;
      agent_user_id: string | null;
      parent_partner_id: string | null;
      agent_login_id: string | null;
    }>(
      `SELECT p.id, p.code, p.name, p.agent_fee_percent, p.agent_user_id, p.parent_partner_id,
              u.email AS agent_login_id
       FROM partners p
       LEFT JOIN users u ON u.id = p.agent_user_id
       WHERE p.status = 'active'
       ORDER BY p.code`,
    );
    const rows = [];
    for (const p of partners.rows) {
      const s = await summarizePartnerPeriod(p.id, from, to, undefined, { unsettledOnly: false });
      rows.push({
        partnerId: p.id,
        code: p.code,
        name: p.name,
        agentLoginId: p.agent_login_id,
        parentPartnerId: p.parent_partner_id,
        feePercent: Number(p.agent_fee_percent),
        grossKrw: s.grossKrw,
        tradeCount: s.tradeCount,
        agentDueKrw: s.agentDueKrw,
        totalFeeKrw: s.totalFeeKrw,
        adminFeeKrw: s.adminFeeKrw,
        parentShares: s.parentShares,
      });
    }
    const totals = rows.reduce(
      (acc, r) => {
        acc.grossKrw += r.grossKrw;
        acc.agentDueKrw += r.agentDueKrw;
        acc.adminFeeKrw += r.adminFeeKrw;
        acc.totalFeeKrw += r.totalFeeKrw;
        return acc;
      },
      { grossKrw: 0, agentDueKrw: 0, adminFeeKrw: 0, totalFeeKrw: 0 },
    );
    res.json({
      periodStart: from.toISOString(),
      periodEnd: to.toISOString(),
      totals,
      rows,
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Stats failed' });
  }
});

adminRouter.get('/agent-settlements/preview', async (req, res) => {
  const partnerId = typeof req.query.partnerId === 'string' ? req.query.partnerId : '';
  const fromRaw = typeof req.query.from === 'string' ? req.query.from : '';
  const toRaw = typeof req.query.to === 'string' ? req.query.to : '';
  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (!partnerId || !Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || !(to > from)) {
    res.status(400).json({ error: 'partnerId, from, to (ISO, to > from) required' });
    return;
  }
  try {
    const { summarizePartnerPeriod } = await import('../agentSettlement.js');
    const summary = await summarizePartnerPeriod(partnerId, from, to);
    const partner = summary.chain[0];
    res.json({
      partner: {
        id: partner!.id,
        code: partner!.code,
        name: partner!.name,
        agentUserId: partner!.agentUserId,
        agentFeePercent: partner!.agentFeePercent,
      },
      periodStart: from.toISOString(),
      periodEnd: to.toISOString(),
      grossKrw: summary.grossKrw,
      feePercent: summary.feePercent,
      agentDueKrw: summary.agentDueKrw,
      totalFeeKrw: summary.totalFeeKrw,
      adminFeeKrw: summary.adminFeeKrw,
      parentShares: summary.parentShares,
      tradeCount: summary.tradeCount,
      trades: summary.trades,
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Preview failed' });
  }
});

adminRouter.post('/agent-settlements', async (req: AuthedRequest, res) => {
  const body = z
    .object({
      partnerId: z.string().uuid(),
      from: z.string().min(1),
      to: z.string().min(1),
      note: z.string().max(500).optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  const from = new Date(body.data.from);
  const to = new Date(body.data.to);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || !(to > from)) {
    res.status(400).json({ error: 'from/to must be valid ISO with to > from' });
    return;
  }
  try {
    const { completeAgentSettlement } = await import('../agentSettlement.js');
    const result = await completeAgentSettlement({
      partnerId: body.data.partnerId,
      from,
      to,
      note: body.data.note ?? '',
      adminId: req.user!.id,
    });
    await audit(req.user!.id, 'agent.settlement.complete', {
      settlementId: result.settlementId,
      partnerId: body.data.partnerId,
      agentDueKrw: result.agentDueKrw,
      adminFeeKrw: result.adminFeeKrw,
      tradeCount: result.tradeCount,
    });
    res.status(201).json({
      settlement: {
        id: result.settlementId,
        partnerId: body.data.partnerId,
        agentUserId: result.agentUserId,
        periodStart: from.toISOString(),
        periodEnd: to.toISOString(),
        grossKrw: result.grossKrw,
        feePercent: result.feePercent,
        agentDueKrw: result.agentDueKrw,
        adminFeeKrw: result.adminFeeKrw,
        parentShares: result.parentShares,
        tradeCount: result.tradeCount,
        status: 'completed',
      },
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Settlement failed' });
  }
});

adminRouter.get('/agent-settlements', async (req, res) => {
  const partnerId = typeof req.query.partnerId === 'string' ? req.query.partnerId : '';
  const params: unknown[] = [];
  let where = '';
  if (partnerId) {
    params.push(partnerId);
    where = `WHERE s.partner_id = $1`;
  }
  const result = await query(
    `SELECT s.*, p.code AS partner_code, p.name AS partner_name,
            ua.email AS agent_login_id, uc.email AS completed_by_login
     FROM agent_settlements s
     JOIN partners p ON p.id = s.partner_id
     LEFT JOIN users ua ON ua.id = s.agent_user_id
     LEFT JOIN users uc ON uc.id = s.completed_by
     ${where}
     ORDER BY s.completed_at DESC
     LIMIT 200`,
    params,
  );
  res.json({
    settlements: result.rows.map((row) => ({
      id: row.id,
      partnerId: row.partner_id,
      partnerCode: row.partner_code,
      partnerName: row.partner_name,
      agentUserId: row.agent_user_id,
      agentLoginId: row.agent_login_id,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      grossKrw: Number(row.gross_krw),
      feePercent: Number(row.fee_percent),
      agentDueKrw: Number(row.agent_due_krw),
      status: row.status,
      completedByLoginId: row.completed_by_login,
      completedAt: row.completed_at,
      note: row.note,
    })),
  });
});

adminRouter.get('/bank-requests', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
  const result =
    status === 'all'
      ? await query(
          `SELECT r.*, u.email AS login_id, u.display_name
           FROM bank_change_requests r
           JOIN users u ON u.id = r.user_id
           ORDER BY r.created_at DESC
           LIMIT 200`,
        )
      : await query(
          `SELECT r.*, u.email AS login_id, u.display_name
           FROM bank_change_requests r
           JOIN users u ON u.id = r.user_id
           WHERE r.status = $1
           ORDER BY r.created_at ASC
           LIMIT 200`,
          [status],
        );
  res.json({
    requests: result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      loginId: row.login_id,
      displayName: row.display_name,
      bankName: row.bank_name,
      accountNo: row.account_no,
      holderName: row.holder_name,
      status: row.status,
      reviewNote: row.review_note,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
    })),
  });
});

adminRouter.post('/bank-requests/:id/approve', async (req: AuthedRequest, res) => {
  const id = String(req.params.id);
  try {
    const out = await withTransaction(async (client) => {
      const r = await client.query(
        `SELECT * FROM bank_change_requests WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (!r.rowCount) throw new Error('요청을 찾을 수 없습니다');
      const reqRow = r.rows[0];
      if (reqRow.status !== 'pending') throw new Error('이미 처리된 요청입니다');

      await client.query(
        `UPDATE bank_accounts SET status = 'disabled'
         WHERE user_id = $1 AND is_custody = false AND status = 'active'`,
        [reqRow.user_id],
      );
      const existing = await client.query(
        `SELECT id FROM bank_accounts
         WHERE user_id = $1 AND is_custody = false
         ORDER BY created_at ASC LIMIT 1`,
        [reqRow.user_id],
      );
      let bankId: string;
      if (existing.rowCount) {
        const upd = await client.query(
          `UPDATE bank_accounts
           SET bank_name = $2, account_no = $3, holder_name = $4,
               status = 'active', verified_at = now()
           WHERE id = $1
           RETURNING id`,
          [
            existing.rows[0].id,
            reqRow.bank_name,
            reqRow.account_no,
            reqRow.holder_name,
          ],
        );
        bankId = upd.rows[0].id;
      } else {
        const ins = await client.query(
          `INSERT INTO bank_accounts
            (user_id, is_custody, bank_name, account_no, holder_name, status, verified_at)
           VALUES ($1, false, $2, $3, $4, 'active', now())
           RETURNING id`,
          [
            reqRow.user_id,
            reqRow.bank_name,
            reqRow.account_no,
            reqRow.holder_name,
          ],
        );
        bankId = ins.rows[0].id;
      }

      await client.query(
        `UPDATE bank_change_requests
         SET status = 'approved', reviewed_by = $2, reviewed_at = now(), updated_at = now()
         WHERE id = $1`,
        [id, req.user!.id],
      );
      return { bankId, userId: reqRow.user_id as string };
    });
    await audit(req.user!.id, 'bank_request.approve', { requestId: id, ...out });
    res.json({ ok: true, ...out });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : '승인 실패' });
  }
});

adminRouter.post('/bank-requests/:id/reject', async (req: AuthedRequest, res) => {
  const id = String(req.params.id);
  const body = z.object({ note: z.string().max(500).optional() }).safeParse(req.body ?? {});
  const note = body.success ? body.data.note ?? '' : '';
  const result = await query(
    `UPDATE bank_change_requests
     SET status = 'rejected', review_note = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'pending'
     RETURNING id, user_id`,
    [id, note, req.user!.id],
  );
  if (!result.rowCount) {
    res.status(404).json({ error: '대기 중인 요청이 없습니다' });
    return;
  }
  await audit(req.user!.id, 'bank_request.reject', { requestId: id, note });
  res.json({ ok: true });
});

adminRouter.get('/listings', async (_req, res) => {
  res.status(410).json({ error: 'Listing boards retired — use OTC holds queue' });
});

adminRouter.patch('/listings/:id', async (_req, res) => {
  res.status(410).json({ error: 'Listing boards retired — use OTC holds queue' });
});

adminRouter.get('/custody', async (_req, res) => {
  const banks = await query(`SELECT * FROM bank_accounts WHERE is_custody = true`);
  const wallets = await query(
    `SELECT id, address, label, status, is_default, created_at
     FROM tether_wallets WHERE is_custody = true ORDER BY is_default DESC, created_at ASC`,
  );
  res.json({ banks: banks.rows, wallets: wallets.rows });
});

adminRouter.get('/wallets', async (_req, res) => {
  try {
    const [{ wallets, totalUsdt }, transfers] = await Promise.all([
      listCustodyWalletsWithBalances(),
      listCustodyTransfers(),
    ]);
    res.json({ wallets, transfers, totalUsdt });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Failed to list wallets' });
  }
});

adminRouter.post('/wallets/create', async (req: AuthedRequest, res) => {
  const body = z
    .object({
      label: z.string().max(80).optional(),
      makeDefault: z.boolean().optional(),
    })
    .safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  try {
    const wallet = await createCustodyWallet(body.data.label || '관리자 지갑', !!body.data.makeDefault);
    await audit(req.user!.id, 'custody_wallet.create', { walletId: wallet.id, address: wallet.address });
    res.status(201).json({ wallet });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Create failed' });
  }
});

adminRouter.post('/wallets/register', async (req: AuthedRequest, res) => {
  const body = z
    .object({
      address: z.string().min(1),
      label: z.string().max(80).optional(),
      privateKey: z.string().optional(),
      makeDefault: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  try {
    const wallet = await registerCustodyWallet({
      address: body.data.address,
      label: body.data.label || '등록 지갑',
      privateKey: body.data.privateKey,
      makeDefault: body.data.makeDefault,
    });
    await audit(req.user!.id, 'custody_wallet.register', { walletId: wallet.id, address: wallet.address });
    res.status(201).json({ wallet });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 400;
    res.status(status).json({ error: e instanceof Error ? e.message : 'Register failed' });
  }
});

adminRouter.post('/wallets/transfer', async (req: AuthedRequest, res) => {
  const body = z
    .object({
      fromWalletId: z.string().uuid(),
      toWalletId: z.string().uuid(),
      amountUsdt: z.number().positive(),
      note: z.string().max(200).optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  try {
    const transfer = await createCustodyTransfer({
      fromWalletId: body.data.fromWalletId,
      toWalletId: body.data.toWalletId,
      amountUsdt: body.data.amountUsdt,
      note: body.data.note,
      createdBy: req.user!.id,
    });
    await audit(req.user!.id, 'custody_wallet.transfer', {
      transferId: transfer.id,
      fromWalletId: body.data.fromWalletId,
      toWalletId: body.data.toWalletId,
      amountUsdt: body.data.amountUsdt,
    });
    res.status(201).json({ transfer });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 400;
    res.status(status).json({ error: e instanceof Error ? e.message : 'Transfer failed' });
  }
});

adminRouter.post('/wallets/transfers/:id/complete', async (req: AuthedRequest, res) => {
  try {
    const transfer = await setCustodyTransferStatus(String(req.params.id), 'completed');
    await audit(req.user!.id, 'custody_wallet.transfer_complete', { transferId: req.params.id });
    res.json({ transfer });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 400;
    res.status(status).json({ error: e instanceof Error ? e.message : 'Complete failed' });
  }
});

adminRouter.post('/wallets/transfers/:id/cancel', async (req: AuthedRequest, res) => {
  try {
    const transfer = await setCustodyTransferStatus(String(req.params.id), 'cancelled');
    await audit(req.user!.id, 'custody_wallet.transfer_cancel', { transferId: req.params.id });
    res.json({ transfer });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 400;
    res.status(status).json({ error: e instanceof Error ? e.message : 'Cancel failed' });
  }
});

adminRouter.post('/wallets/:id/set-default', async (req: AuthedRequest, res) => {
  try {
    const wallets = await setDefaultCustodyWallet(String(req.params.id));
    await audit(req.user!.id, 'custody_wallet.set_default', { walletId: req.params.id });
    res.json({ wallets });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 400;
    res.status(status).json({ error: e instanceof Error ? e.message : 'Set default failed' });
  }
});

adminRouter.get('/wallets/:id/private-key', async (req: AuthedRequest, res) => {
  try {
    const privateKey = await revealCustodyPrivateKey(String(req.params.id));
    await audit(req.user!.id, 'custody_wallet.reveal_private_key', { walletId: req.params.id });
    const w = await query<{ address: string }>(
      `SELECT address FROM tether_wallets WHERE id = $1 AND is_custody = true`,
      [req.params.id],
    );
    res.json({ wallet: { id: req.params.id, address: w.rows[0]?.address, privateKey } });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 400;
    res.status(status).json({ error: e instanceof Error ? e.message : 'Reveal failed' });
  }
});

/** Start/end of calendar day in Asia/Seoul as Date (UTC instants). */
function kstTodayBounds(now = new Date()): { from: Date; to: Date; ymd: string } {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const from = new Date(`${ymd}T00:00:00+09:00`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from, to, ymd };
}

/** Lightweight poll for admin top bar + new-request alerts. */
adminRouter.get('/holds/pending', async (_req, res) => {
  const r = await query<{ pending_count: number; newest_created_at: string | null }>(
    `SELECT COUNT(*)::int AS pending_count,
            MAX(created_at) AS newest_created_at
     FROM trades
     WHERE status NOT IN ('completed', 'cancelled')`,
  );
  const row = r.rows[0];
  let custodyUsdtTotal: number | null = null;
  try {
    custodyUsdtTotal = await getCustodyTotalUsdtCached();
  } catch {
    custodyUsdtTotal = null;
  }

  const { from, to, ymd } = kstTodayBounds();
  let todayDepositKrw = 0;
  let todayPlatformFeeKrw = 0;
  try {
    const dep = await query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_krw), 0)::text AS total
       FROM trades
       WHERE kind = 'buy_from_admin'
         AND status = 'completed'
         AND updated_at >= $1
         AND updated_at < $2`,
      [from.toISOString(), to.toISOString()],
    );
    todayDepositKrw = Math.round(Number(dep.rows[0]?.total ?? 0));

    const feeRows = await query<{ partner_id: string; gross: string }>(
      `SELECT p.id AS partner_id,
              COALESCE(SUM(t.amount_krw), 0)::text AS gross
       FROM partners p
       LEFT JOIN partner_members pm ON pm.partner_id = p.id
       LEFT JOIN trades t
         ON t.buyer_user_id = pm.user_id
        AND t.kind = 'buy_from_admin'
        AND t.status = 'completed'
        AND t.updated_at >= $1
        AND t.updated_at < $2
       GROUP BY p.id`,
      [from.toISOString(), to.toISOString()],
    );
    const { loadPartnerAncestorChain, splitFeePool } = await import('../agentSettlement.js');
    todayPlatformFeeKrw = 0;
    for (const row of feeRows.rows) {
      const chain = await loadPartnerAncestorChain(row.partner_id);
      const split = splitFeePool(Number(row.gross), chain);
      todayPlatformFeeKrw += split.adminFeeKrw;
    }
  } catch {
    todayDepositKrw = 0;
    todayPlatformFeeKrw = 0;
  }

  res.json({
    pendingCount: row?.pending_count ?? 0,
    newestCreatedAt: row?.newest_created_at ?? null,
    custodyUsdtTotal,
    todayDepositKrw,
    todayPlatformFeeKrw,
    todayYmdKst: ymd,
  });
});

adminRouter.get('/holds', async (_req, res) => {
  const trades = await query(
    `SELECT t.*,
       (SELECT status FROM deposit_intents WHERE trade_id = t.id AND side = 'buyer_krw') AS krw_deposit_status,
       (SELECT status FROM deposit_intents WHERE trade_id = t.id AND side = 'seller_usdt') AS usdt_deposit_status,
       u.email AS requester_login_id,
       u.display_name AS requester_display_name,
       p.name AS solution_name,
       p.code AS solution_code,
       ba.bank_name AS requester_bank_name,
       ba.account_no AS requester_account_no,
       ba.holder_name AS requester_holder_name
     FROM trades t
     LEFT JOIN users u ON u.id = CASE
       WHEN t.kind = 'sell_to_admin' THEN t.seller_user_id
       ELSE t.buyer_user_id
     END
     LEFT JOIN partner_members pm ON pm.user_id = u.id
     LEFT JOIN partners p ON p.id = pm.partner_id
     LEFT JOIN LATERAL (
       SELECT bank_name, account_no, holder_name
       FROM bank_accounts
       WHERE user_id = u.id AND is_custody = false AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1
     ) ba ON true
     WHERE t.status NOT IN ('completed', 'cancelled')
     ORDER BY t.created_at DESC`,
  );
  const holds = await query(
    `SELECT * FROM holds WHERE status = 'held' ORDER BY created_at DESC`,
  );
  res.json({ trades: trades.rows, holds: holds.rows });
});

adminRouter.get('/settings', async (_req, res) => {
  const settings = await getSiteSettings();
  res.json({ settings });
});

adminRouter.patch('/settings', async (req: AuthedRequest, res) => {
  const body = z
    .object({
      allowMultiAccountBrowser: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  let settings = await getSiteSettings();
  if (typeof body.data.allowMultiAccountBrowser === 'boolean') {
    settings = await setAllowMultiAccountBrowser(body.data.allowMultiAccountBrowser);
    await audit(req.user!.id, 'settings.allow_multi_account_browser', {
      value: body.data.allowMultiAccountBrowser,
    });
  }
  res.json({ settings });
});

adminRouter.get('/rates', async (_req, res) => {
  const settings = await getSiteSettings();
  const quotes = await fetchAllProviderRates();
  res.json({
    selectedProviderId: settings.fxRateProvider,
    fxBuyFeePercent: settings.fxBuyFeePercent,
    fxSellFeePercent: settings.fxSellFeePercent,
    fxRateRefreshInterval: settings.fxRateRefreshInterval,
    fxRateSnapshot: settings.fxRateSnapshot,
    refreshIntervals: FX_REFRESH_INTERVALS,
    providers: RATE_PROVIDERS,
    quotes,
  });
});

adminRouter.get('/rates/:providerId', async (req: AuthedRequest, res) => {
  const id = String(req.params.providerId);
  if (!isRateProviderId(id)) {
    res.status(400).json({ error: 'Unknown provider' });
    return;
  }
  const quote = await fetchProviderRate(id);
  const settings = await getSiteSettings();
  if (
    id === settings.fxRateProvider &&
    quote.rateKrwPerUsdt != null &&
    quote.rateKrwPerUsdt > 0
  ) {
    await setFxRateSnapshot({
      providerId: id,
      rateKrwPerUsdt: quote.rateKrwPerUsdt,
      fetchedAt: quote.fetchedAt,
    });
  }
  res.json({
    provider: RATE_PROVIDERS.find((p) => p.id === id),
    quote,
  });
});

adminRouter.post('/rates/select', async (req: AuthedRequest, res) => {
  const body = z.object({ providerId: z.string() }).safeParse(req.body);
  if (!body.success || !isRateProviderId(body.data.providerId)) {
    res.status(400).json({ error: 'Invalid providerId' });
    return;
  }
  const quote = await fetchProviderRate(body.data.providerId);
  if (quote.rateKrwPerUsdt == null) {
    res.status(502).json({
      error: `선택한 소스에서 환율을 가져오지 못했습니다: ${quote.error || 'unknown'}`,
      quote,
    });
    return;
  }
  await setFxRateProvider(body.data.providerId);
  const settings = await setFxRateSnapshot({
    providerId: body.data.providerId,
    rateKrwPerUsdt: quote.rateKrwPerUsdt,
    fetchedAt: quote.fetchedAt,
  });
  await audit(req.user!.id, 'settings.fx_rate_provider', {
    providerId: body.data.providerId,
    rateKrwPerUsdt: quote.rateKrwPerUsdt,
  });
  res.json({
    settings,
    selectedProviderId: settings.fxRateProvider,
    fxBuyFeePercent: settings.fxBuyFeePercent,
    fxSellFeePercent: settings.fxSellFeePercent,
    fxRateRefreshInterval: settings.fxRateRefreshInterval,
    fxRateSnapshot: settings.fxRateSnapshot,
    quote,
  });
});

adminRouter.post('/rates/refresh-interval', async (req: AuthedRequest, res) => {
  const body = z.object({ interval: z.string() }).safeParse(req.body);
  if (!body.success || !isFxRefreshIntervalId(body.data.interval)) {
    res.status(400).json({ error: 'interval must be one of 1h, 6h, 1d, 3d, 1w' });
    return;
  }
  const settings = await setFxRateRefreshInterval(body.data.interval);
  await audit(req.user!.id, 'settings.fx_rate_refresh_interval', {
    interval: settings.fxRateRefreshInterval,
  });
  res.json({
    settings,
    fxRateRefreshInterval: settings.fxRateRefreshInterval,
    refreshIntervals: FX_REFRESH_INTERVALS,
  });
});

adminRouter.post('/rates/fee', async (req: AuthedRequest, res) => {
  const body = z
    .object({
      fxBuyFeePercent: z.number().min(0).max(100),
      fxSellFeePercent: z.number().max(100).min(0),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'fxBuyFeePercent and fxSellFeePercent must be 0–100' });
    return;
  }
  const settings = await setFxFeePercents(body.data.fxBuyFeePercent, body.data.fxSellFeePercent);
  await audit(req.user!.id, 'settings.fx_fee_percents', {
    fxBuyFeePercent: settings.fxBuyFeePercent,
    fxSellFeePercent: settings.fxSellFeePercent,
  });
  res.json({
    settings,
    fxBuyFeePercent: settings.fxBuyFeePercent,
    fxSellFeePercent: settings.fxSellFeePercent,
  });
});
