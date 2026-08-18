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
  role: 'user' | 'admin',
  status: string,
) {
  const existing = await query(`SELECT id FROM users WHERE email = $1`, [email]);
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

  const adminId = await upsertUser('admin@tps.local', 'admin123', 'Admin', 'admin', 'active');
  const buyerId = await upsertUser('buyer@tps.local', 'demo1234', 'Demo Buyer', 'user', 'active');
  const sellerId = await upsertUser('seller@tps.local', 'demo1234', 'Demo Seller', 'user', 'active');

  await ensureDefaultManagedWallet(buyerId);
  await ensureDefaultManagedWallet(sellerId);
  const backfilled = await backfillDefaultManagedWallets();

  const custodyBank = await query(`SELECT id FROM bank_accounts WHERE is_custody = true LIMIT 1`);
  if (!custodyBank.rowCount) {
    await query(
      `INSERT INTO bank_accounts
        (user_id, is_custody, bank_code, bank_name, account_no, holder_name, status, verified_at)
       VALUES (NULL, true, '004', 'KB국민', '123-456-789012', 'TPS Custody', 'active', now())`,
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
  const { hashApiKey, generateApiKey } = await import('./partner/crypto.js');
  const existingPartner = await query(`SELECT id FROM partners WHERE code = 's01'`);
  if (!existingPartner.rowCount) {
    const rawKey =
      process.env.S01_PARTNER_API_KEY?.trim() || generateApiKey('pk_s01');
    const callbackBase =
      process.env.S01_CALLBACK_BASE_URL?.replace(/\/$/, '') || 'https://bg-demo001.uk';
    const callbackSecret =
      process.env.S01_CALLBACK_SECRET?.trim() || rawKey;
    // Valid TRC-20-shaped virtual address (UI only; not a real on-chain wallet)
    const virtual = 'TPartnerSoiGameCreditDepositAddrX1';
    await query(
      `INSERT INTO partners
        (code, name, api_key_hash, callback_base_url, callback_path, callback_secret,
         virtual_deposit_address, usdt_to_game_rate, status)
       VALUES ('s01', 'S01 Game', $1, $2, '/api/integrations/tps/credit-game', $3, $4, 1, 'active')`,
      [hashApiKey(rawKey), callbackBase, callbackSecret, virtual],
    );
    console.log('  partner s01 API key (save now):', rawKey);
    console.log('  partner s01 virtual address:', virtual);
  }

  console.log('Seed complete');
  console.log('  admin@tps.local / admin123');
  console.log('  buyer@tps.local / demo1234');
  console.log('  seller@tps.local / demo1234');
  console.log('  admin user id:', adminId);
  console.log('  managed wallets backfilled:', backfilled);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
