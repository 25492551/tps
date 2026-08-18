import { Router } from 'express';
import { z } from 'zod';
import { hashPassword } from '../auth.js';
import { query } from '../db.js';
import { appendLedger, audit } from '../ledger.js';
import { withTransaction } from '../db.js';
import {
  createCustodyTransfer,
  createCustodyWallet,
  listCustodyTransfers,
  listCustodyWallets,
  listCustodyWalletsWithBalances,
  registerCustodyWallet,
  revealCustodyPrivateKey,
  setCustodyTransferStatus,
  setDefaultCustodyWallet,
} from '../custodyWallets.js';
import { ensureDefaultManagedWallet } from '../managedWallet.js';
import { decryptPrivateKey } from '../walletCrypto.js';
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

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/users', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const result = status
    ? await query(
        `SELECT u.*, w.address AS managed_wallet_address, w.id AS managed_wallet_id
         FROM users u
         LEFT JOIN tether_wallets w
           ON w.user_id = u.id AND w.is_default = true AND w.is_platform_managed = true
         WHERE u.status = $1
         ORDER BY u.created_at DESC`,
        [status],
      )
    : await query(
        `SELECT u.*, w.address AS managed_wallet_address, w.id AS managed_wallet_id
         FROM users u
         LEFT JOIN tether_wallets w
           ON w.user_id = u.id AND w.is_default = true AND w.is_platform_managed = true
         WHERE u.status <> 'deleted'
         ORDER BY u.created_at DESC`,
      );
  res.json({
    users: result.rows.map((row) => ({
      ...toPublicUser(row as DbUser),
      managedWalletAddress: row.managed_wallet_address ?? null,
      managedWalletId: row.managed_wallet_id ?? null,
    })),
  });
});

adminRouter.post('/users', async (req: AuthedRequest, res) => {
  const body = z
    .object({
      email: z.string().email(),
      password: z.string().min(6),
      displayName: z.string().min(1).max(80).optional(),
      status: z.enum(['pending_approval', 'active']).default('active'),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  const passwordHash = await hashPassword(body.data.password);
  try {
    const inserted = await query<DbUser>(
      `INSERT INTO users (email, password_hash, display_name, role, status)
       VALUES ($1,$2,$3,'user',$4) RETURNING *`,
      [
        body.data.email.toLowerCase(),
        passwordHash,
        body.data.displayName ?? body.data.email.split('@')[0],
        body.data.status,
      ],
    );
    await ensureDefaultManagedWallet(inserted.rows[0].id);
    await audit(req.user!.id, 'user.create', { userId: inserted.rows[0].id });
    res.status(201).json({ user: toPublicUser(inserted.rows[0]) });
  } catch {
    res.status(409).json({ error: 'Email already exists' });
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
  const user = await query(`SELECT id FROM users WHERE id = $1 AND role = 'user'`, [userId]);
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
      status: z.enum(['pending_approval', 'active', 'suspended', 'rejected', 'deleted']).optional(),
      canBuyTether: z.boolean().optional(),
      canSellTether: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  if (body.data.status) {
    const cur = await query<{ status: string }>(
      `SELECT status FROM users WHERE id = $1 AND role = 'user'`,
      [req.params.id],
    );
    if (!cur.rowCount) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const from = cur.rows[0].status;
    if (body.data.status === 'rejected' && from !== 'pending_approval') {
      res.status(409).json({ error: 'Only pending users can be rejected' });
      return;
    }
    if (body.data.status === 'suspended' && from !== 'active') {
      res.status(409).json({ error: 'Only active users can be suspended' });
      return;
    }
  }
  const result = await query<DbUser>(
    `UPDATE users SET
       display_name = COALESCE($2, display_name),
       status = COALESCE($3, status),
       can_buy_tether = COALESCE($4, can_buy_tether),
       can_sell_tether = COALESCE($5, can_sell_tether),
       updated_at = now()
     WHERE id = $1 RETURNING *`,
    [
      req.params.id,
      body.data.displayName ?? null,
      body.data.status ?? null,
      body.data.canBuyTether ?? null,
      body.data.canSellTether ?? null,
    ],
  );
  if (!result.rowCount) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  await audit(req.user!.id, 'user.patch', { userId: req.params.id, ...body.data });
  res.json({ user: toPublicUser(result.rows[0]) });
});

async function setStatus(req: AuthedRequest, res: import('express').Response, status: string) {
  const result = await query<DbUser>(
    `UPDATE users SET status = $2, updated_at = now() WHERE id = $1 AND role = 'user' RETURNING *`,
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
  const existing = await query<DbUser>(`SELECT * FROM users WHERE id = $1 AND role = 'user'`, [userId]);
  if (!existing.rowCount) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const result = await query<DbUser>(
    `UPDATE users SET status = 'active', updated_at = now() WHERE id = $1 AND role = 'user' RETURNING *`,
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
  const existing = await query<DbUser>(`SELECT * FROM users WHERE id = $1 AND role = 'user'`, [userId]);
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
  const existing = await query<DbUser>(`SELECT * FROM users WHERE id = $1 AND role = 'user'`, [userId]);
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

adminRouter.get('/transactions', async (req, res) => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
  const asset = typeof req.query.asset === 'string' ? req.query.asset : undefined;
  const params: unknown[] = [];
  const where: string[] = [];
  if (userId) {
    params.push(userId);
    where.push(`user_id = $${params.length}`);
  }
  if (asset) {
    params.push(asset);
    where.push(`asset = $${params.length}`);
  }
  const sql = `SELECT * FROM ledger_entries ${
    where.length ? `WHERE ${where.join(' AND ')}` : ''
  } ORDER BY created_at DESC LIMIT 500`;
  const result = await query(sql, params);
  res.json({ transactions: result.rows });
});

adminRouter.post('/ledger-adjust', async (req: AuthedRequest, res) => {
  const body = z
    .object({
      userId: z.string().uuid(),
      asset: z.enum(['krw', 'usdt']),
      direction: z.enum(['credit', 'debit']),
      amount: z.number().positive(),
      note: z.string().max(500).optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  try {
    const entry = await withTransaction(async (client) =>
      appendLedger(client, {
        userId: body.data.userId,
        asset: body.data.asset,
        direction: body.data.direction,
        amount: body.data.amount,
        refType: 'admin_adjust',
        note: body.data.note ?? '',
      }),
    );
    await audit(req.user!.id, 'ledger.adjust', body.data);
    res.status(201).json({ entry });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Adjust failed' });
  }
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

adminRouter.get('/holds', async (_req, res) => {
  const trades = await query(
    `SELECT t.*,
       (SELECT status FROM deposit_intents WHERE trade_id = t.id AND side = 'buyer_krw') AS krw_deposit_status,
       (SELECT status FROM deposit_intents WHERE trade_id = t.id AND side = 'seller_usdt') AS usdt_deposit_status
     FROM trades t
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
