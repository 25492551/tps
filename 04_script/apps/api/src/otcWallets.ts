import { query } from './db.js';
import { decryptPrivateKey } from './walletCrypto.js';

export type HotWallet = {
  id: string;
  address: string;
  privateKeyHex: string;
};

export async function loadDefaultCustodyHotWallet(): Promise<HotWallet> {
  const r = await query<{ id: string; address: string; private_key_enc: string | null }>(
    `SELECT id, address, private_key_enc FROM tether_wallets
     WHERE is_custody = true AND status = 'active'
     ORDER BY is_default DESC, created_at ASC
     LIMIT 1`,
  );
  if (!r.rowCount) throw new Error('No active custody wallet');
  const row = r.rows[0];
  if (!row.private_key_enc) {
    throw new Error('Custody wallet has no private key — create/register a keyed admin wallet');
  }
  return {
    id: row.id,
    address: row.address,
    privateKeyHex: decryptPrivateKey(row.private_key_enc),
  };
}

export async function loadUserDefaultManagedHotWallet(userId: string): Promise<HotWallet> {
  const r = await query<{ id: string; address: string; private_key_enc: string | null }>(
    `SELECT id, address, private_key_enc FROM tether_wallets
     WHERE user_id = $1 AND is_default = true AND is_platform_managed = true AND status = 'active'
     LIMIT 1`,
    [userId],
  );
  if (!r.rowCount) throw new Error('User has no default managed wallet');
  const row = r.rows[0];
  if (!row.private_key_enc) {
    throw new Error('User managed wallet has no private key');
  }
  return {
    id: row.id,
    address: row.address,
    privateKeyHex: decryptPrivateKey(row.private_key_enc),
  };
}
