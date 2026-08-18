import { Router } from 'express';
import { z } from 'zod';
import { hashPassword } from '../auth.js';
import { query, withTransaction } from '../db.js';
import { getBalance } from '../ledger.js';
import { ensureDefaultManagedWallet } from '../managedWallet.js';
import { signHandoffToken } from './crypto.js';
import { requirePartnerKey, type PartnerRequest } from './partners.js';

export const partnerRouter = Router();
partnerRouter.use(requirePartnerKey);

function syntheticEmail(partnerCode: string, loginId: string) {
  const safe = loginId.toLowerCase().replace(/[^a-z0-9._+-]/g, '_').slice(0, 64);
  return `${partnerCode}+${safe}@partner.local`;
}

const bankSchema = z.object({
  bankName: z.string().min(1).max(80),
  bankAccount: z.string().min(4).max(40),
  bankHolder: z.string().min(1).max(80),
  bankCode: z.string().max(20).optional(),
});

async function upsertBank(
  client: import('pg').PoolClient,
  userId: string,
  bank: z.infer<typeof bankSchema>,
) {
  const existing = await client.query(
    `SELECT id FROM bank_accounts
     WHERE user_id = $1 AND is_custody = false AND status = 'active'
     ORDER BY created_at ASC LIMIT 1`,
    [userId],
  );
  if (existing.rowCount) {
    await client.query(
      `UPDATE bank_accounts
       SET bank_code = $2, bank_name = $3, account_no = $4, holder_name = $5
       WHERE id = $1`,
      [
        existing.rows[0].id,
        bank.bankCode || '000',
        bank.bankName,
        bank.bankAccount,
        bank.bankHolder,
      ],
    );
  } else {
    await client.query(
      `INSERT INTO bank_accounts
        (user_id, is_custody, bank_code, bank_name, account_no, holder_name, status, verified_at)
       VALUES ($1, false, $2, $3, $4, $5, 'active', now())`,
      [userId, bank.bankCode || '000', bank.bankName, bank.bankAccount, bank.bankHolder],
    );
  }
}

/** Upsert partner member + required bank; creates active TPS user. */
partnerRouter.post('/members', async (req: PartnerRequest, res) => {
  const body = z
    .object({
      externalUserId: z.string().uuid(),
      loginId: z.string().min(1).max(80),
      nickname: z.string().min(1).max(80).optional(),
      phone: z.string().max(40).optional(),
      bankName: z.string().min(1).max(80),
      bankAccount: z.string().min(4).max(40),
      bankHolder: z.string().min(1).max(80),
      bankCode: z.string().max(20).optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  const partner = req.partner!;
  const d = body.data;
  const bank = {
    bankName: d.bankName,
    bankAccount: d.bankAccount,
    bankHolder: d.bankHolder,
    bankCode: d.bankCode,
  };

  try {
    const result = await withTransaction(async (client) => {
      const mapR = await client.query<{ user_id: string; id: string }>(
        `SELECT id, user_id FROM partner_members
         WHERE partner_id = $1 AND external_user_id = $2 FOR UPDATE`,
        [partner.id, d.externalUserId],
      );

      let userId: string;
      if (mapR.rowCount) {
        userId = mapR.rows[0].user_id;
        await client.query(
          `UPDATE users SET display_name = $2, updated_at = now() WHERE id = $1`,
          [userId, d.nickname || d.loginId],
        );
        await client.query(
          `UPDATE partner_members SET external_login_id = $2, updated_at = now() WHERE id = $1`,
          [mapR.rows[0].id, d.loginId],
        );
      } else {
        const email = syntheticEmail(partner.code, d.loginId);
        const pw = await hashPassword(`partner:${partner.code}:${d.externalUserId}:${Date.now()}`);
        const existingEmail = await client.query(`SELECT id FROM users WHERE email = $1`, [email]);
        if (existingEmail.rowCount) {
          userId = existingEmail.rows[0].id;
          await client.query(
            `UPDATE users SET display_name = $2, status = 'active', updated_at = now() WHERE id = $1`,
            [userId, d.nickname || d.loginId],
          );
        } else {
          const u = await client.query<{ id: string }>(
            `INSERT INTO users (email, password_hash, display_name, role, status)
             VALUES ($1,$2,$3,'user','active') RETURNING id`,
            [email, pw, d.nickname || d.loginId],
          );
          userId = u.rows[0].id;
        }
        await client.query(
          `INSERT INTO partner_members (partner_id, external_user_id, user_id, external_login_id)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (partner_id, external_user_id) DO UPDATE
             SET user_id = EXCLUDED.user_id, external_login_id = EXCLUDED.external_login_id,
                 updated_at = now()`,
          [partner.id, d.externalUserId, userId, d.loginId],
        );
      }

      try {
        await upsertBank(client, userId, bank);
      } catch (e) {
        throw e;
      }

      return { userId };
    });

    await ensureDefaultManagedWallet(result.userId);
    const [usdt, krw] = await Promise.all([
      getBalance(result.userId, 'usdt'),
      getBalance(result.userId, 'krw'),
    ]);
    res.json({
      userId: result.userId,
      externalUserId: d.externalUserId,
      balances: { usdt, krw },
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Upsert failed' });
  }
});

partnerRouter.post('/members/:externalUserId/bank', async (req: PartnerRequest, res) => {
  const bank = bankSchema.safeParse(req.body);
  if (!bank.success) {
    res.status(400).json({ error: bank.error.flatten() });
    return;
  }
  const externalUserId = String(req.params.externalUserId);
  const map = await query<{ user_id: string }>(
    `SELECT user_id FROM partner_members WHERE partner_id = $1 AND external_user_id = $2`,
    [req.partner!.id, externalUserId],
  );
  if (!map.rowCount) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }
  try {
    await withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT id FROM bank_accounts WHERE user_id = $1 AND is_custody = false LIMIT 1`,
        [map.rows[0].user_id],
      );
      if (existing.rowCount) {
        await client.query(
          `UPDATE bank_accounts
           SET bank_code = $2, bank_name = $3, account_no = $4, holder_name = $5
           WHERE id = $1`,
          [
            existing.rows[0].id,
            bank.data.bankCode || '000',
            bank.data.bankName,
            bank.data.bankAccount,
            bank.data.bankHolder,
          ],
        );
      } else {
        await client.query(
          `INSERT INTO bank_accounts
            (user_id, is_custody, bank_code, bank_name, account_no, holder_name, status, verified_at)
           VALUES ($1, false, $2, $3, $4, $5, 'active', now())`,
          [
            map.rows[0].user_id,
            bank.data.bankCode || '000',
            bank.data.bankName,
            bank.data.bankAccount,
            bank.data.bankHolder,
          ],
        );
      }
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Bank update failed' });
  }
});

partnerRouter.get('/members/:externalUserId/balance', async (req: PartnerRequest, res) => {
  const map = await query<{ user_id: string }>(
    `SELECT user_id FROM partner_members WHERE partner_id = $1 AND external_user_id = $2`,
    [req.partner!.id, String(req.params.externalUserId)],
  );
  if (!map.rowCount) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }
  const userId = map.rows[0].user_id;
  const [usdt, krw] = await Promise.all([getBalance(userId, 'usdt'), getBalance(userId, 'krw')]);
  res.json({
    externalUserId: req.params.externalUserId,
    userId,
    balances: { usdt, krw },
    virtualDepositAddress: req.partner!.virtual_deposit_address,
  });
});

partnerRouter.post('/handoff', async (req: PartnerRequest, res) => {
  const body = z.object({ externalUserId: z.string().uuid() }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  const map = await query<{ user_id: string }>(
    `SELECT pm.user_id FROM partner_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.partner_id = $1 AND pm.external_user_id = $2 AND u.status = 'active'`,
    [req.partner!.id, body.data.externalUserId],
  );
  if (!map.rowCount) {
    res.status(404).json({ error: 'Member not found or inactive — upsert member with bank first' });
    return;
  }
  const bank = await query(
    `SELECT id FROM bank_accounts WHERE user_id = $1 AND is_custody = false AND status = 'active' LIMIT 1`,
    [map.rows[0].user_id],
  );
  if (!bank.rowCount) {
    res.status(400).json({ error: 'Bank account required before handoff' });
    return;
  }

  const token = signHandoffToken({
    partnerId: req.partner!.id,
    partnerCode: req.partner!.code,
    userId: map.rows[0].user_id,
    externalUserId: body.data.externalUserId,
  });
  const base =
    process.env.PUBLIC_WEB_BASE_URL?.replace(/\/$/, '') ||
    process.env.SITE_PUBLIC_URL?.replace(/\/$/, '') ||
    'https://bgp-001.com';
  const redirectUrl = `${base}/handoff?partner=${encodeURIComponent(req.partner!.code)}&token=${encodeURIComponent(token)}`;
  res.json({
    handoffToken: token,
    redirectUrl,
    virtualDepositAddress: req.partner!.virtual_deposit_address,
    expiresInSec: 300,
  });
});
