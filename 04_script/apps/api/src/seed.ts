import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { hashPassword } from './auth.js';
import { migrate, pool, query } from './db.js';
import { backfillDefaultManagedWallets, ensureDefaultManagedWallet } from './managedWallet.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
dotenv.config({ path: path.join(repoRoot, '.env') });

async function upsertUser(
  email: string,
  password: string,
  displayName: string,
  role: 'member' | 'admin' | 'agent',
  status: string,
) {
  const existing = await query(`SELECT id FROM users WHERE lower(email) = $1`, [email]);
  if (existing.rowCount) return existing.rows[0].id as string;
  const hash = await hashPassword(password);
  const r = await query(
    `INSERT INTO users (email, password_hash, display_name, role, status)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [email, hash, displayName, role, status],
  );
  return r.rows[0].id as string;
}

async function main() {
  await migrate();

  const adminId = await upsertUser('admin', 'admin123', 'Admin', 'admin', 'active');
  const buyerId = await upsertUser('buyer', 'demo1234', 'Demo Buyer', 'member', 'active');
  const sellerId = await upsertUser('seller', 'demo1234', 'Demo Seller', 'member', 'active');

  await ensureDefaultManagedWallet(buyerId);
  await ensureDefaultManagedWallet(sellerId);
  const backfilled = await backfillDefaultManagedWallets();

  const custodyBank = await query(`SELECT id FROM bank_accounts WHERE is_custody = true LIMIT 1`);
  if (!custodyBank.rowCount) {
    await query(
      `INSERT INTO bank_accounts
        (user_id, is_custody, bank_name, account_no, holder_name, status, verified_at)
       VALUES (NULL, true, 'KB국민', '123-456-789012', 'TPS Custody', 'active', now())`,
    );
  }

  const { createCustodyWallet } = await import('./custodyWallets.js');
  const custodyWallet = await query(
    `SELECT id FROM tether_wallets WHERE is_custody = true LIMIT 1`,
  );
  if (!custodyWallet.rowCount) {
    await createCustodyWallet('Admin USDT (TRC-20)', true);
  }

  // Partner S01 (API key printed once when newly inserted)
  const { hashApiKey, generatePartnerKeyPair } = await import('./partner/crypto.js');
  const { encryptPrivateKey } = await import('./walletCrypto.js');
  const existingPartner = await query(`SELECT id FROM partners WHERE code = 's01'`);
  if (!existingPartner.rowCount) {
    const pair = generatePartnerKeyPair('s01');
    const privateKey = process.env.S01_PARTNER_API_KEY?.trim() || pair.privateKey;
    const publicKey = pair.publicKey;
    const callbackBase =
      process.env.S01_CALLBACK_BASE_URL?.replace(/\/$/, '') || 'https://bg-demo001.uk';
    const callbackSecret =
      process.env.S01_CALLBACK_SECRET?.trim() || privateKey;
    const virtual = 'TPartnerSoiGameCreditDepositAddrX1';
    await query(
      `INSERT INTO partners
        (code, name, api_key_hash, api_key_prefix, api_public_key, api_secret_enc, api_key_issued_at,
         callback_base_url, callback_path, callback_secret,
         virtual_deposit_address, usdt_to_game_rate, status)
       VALUES ('s01', 'S01 Game', $1, $2, $2, $3, now(), $4, '/api/integrations/tps/credit-game', $5, $6, 1, 'active')`,
      [hashApiKey(privateKey), publicKey, encryptPrivateKey(privateKey), callbackBase, callbackSecret, virtual],
    );
    console.log('  partner s01 public key:', publicKey);
    console.log('  partner s01 private key (TPS_PARTNER_KEY):', privateKey);
    console.log('  partner s01 virtual address:', virtual);
  } else {
    const s01 = await query<{
      id: string;
      api_key_hash: string;
      api_public_key: string;
      api_secret_enc: string;
    }>(
      `SELECT id, api_key_hash,
              COALESCE(api_public_key, '') AS api_public_key,
              COALESCE(api_secret_enc, '') AS api_secret_enc
       FROM partners WHERE code = 's01'`,
    );
    const row = s01.rows[0];
    if (row && row.api_key_hash?.length === 64) {
      const envKey = process.env.S01_PARTNER_API_KEY?.trim();
      const patch: string[] = [];
      const params: unknown[] = [row.id];
      if (!row.api_public_key) {
        const { publicKey } = generatePartnerKeyPair('s01');
        params.push(publicKey);
        patch.push(`api_public_key = $${params.length}`, `api_key_prefix = $${params.length}`);
      }
      if (!row.api_secret_enc && envKey && hashApiKey(envKey) === row.api_key_hash) {
        params.push(encryptPrivateKey(envKey));
        patch.push(`api_secret_enc = $${params.length}`);
      }
      if (patch.length) {
        await query(
          `UPDATE partners SET ${patch.join(', ')},
             api_key_issued_at = COALESCE(api_key_issued_at, created_at),
             updated_at = now()
           WHERE id = $1`,
          params,
        );
      }
    }
  }

  console.log('Seed complete');
  console.log('  admin / admin123');
  console.log('  buyer / demo1234');
  console.log('  seller / demo1234');
  console.log('  admin user id:', adminId);
  console.log('  managed wallets backfilled:', backfilled);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
