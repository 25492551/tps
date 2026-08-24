import type pg from 'pg';
import { query } from './db.js';
import { generateTronWallet } from './tronWallet.js';
import { encryptPrivateKey } from './walletCrypto.js';

export type ManagedWalletRow = {
  id: string;
  user_id: string;
  address: string;
  label: string;
  status: string;
  is_platform_managed: boolean;
  is_default: boolean;
  created_at: string;
};

/**
 * Ensure the user has a default platform-managed TRC-20 wallet.
 * Admin holds the encrypted private key; user only sees the address.
 */
export async function ensureDefaultManagedWallet(
  userId: string,
  client?: pg.PoolClient,
): Promise<ManagedWalletRow> {
  const run = client
    ? <T extends pg.QueryResultRow>(text: string, params?: unknown[]) => client.query<T>(text, params)
    : query;

  const existing = await run<ManagedWalletRow>(
    `SELECT id, user_id, address, label, status, is_platform_managed, is_default, created_at
     FROM tether_wallets
     WHERE user_id = $1 AND is_default = true
     LIMIT 1`,
    [userId],
  );
  if (existing.rowCount) return existing.rows[0];

  const { address, privateKey } = generateTronWallet();
  const enc = encryptPrivateKey(privateKey);
  const inserted = await run<ManagedWalletRow>(
    `INSERT INTO tether_wallets
      (user_id, is_custody, is_platform_managed, is_default, chain, address, label, status, private_key_enc)
     VALUES ($1, false, true, true, 'TRC-20', $2, $3, 'active', $4)
     RETURNING id, user_id, address, label, status, is_platform_managed, is_default, created_at`,
    [userId, address, '기본 지갑 (관리자 보관)', enc],
  );
  return inserted.rows[0];
}

/** Backfill default managed wallets for approved (active/suspended) users missing one. */
export async function backfillDefaultManagedWallets() {
  const users = await query<{ id: string }>(
    `SELECT u.id FROM users u
     WHERE u.role IN ('member', 'agent') AND u.status IN ('active', 'suspended')
       AND NOT EXISTS (
         SELECT 1 FROM tether_wallets w WHERE w.user_id = u.id AND w.is_default = true
       )`,
  );
  for (const u of users.rows) {
    await ensureDefaultManagedWallet(u.id);
  }
  return users.rowCount ?? 0;
}
