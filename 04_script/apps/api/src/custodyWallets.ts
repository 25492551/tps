import { query } from './db.js';
import { generateTronWallet, tronAddressFromPrivateKey } from './tronWallet.js';
import { decryptPrivateKey, encryptPrivateKey } from './walletCrypto.js';
import { fetchTronUsdtBalance } from './tronUsdt.js';

const TRON_ADDR = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export type CustodyWalletRow = {
  id: string;
  address: string;
  label: string;
  status: string;
  is_default: boolean;
  private_key_enc: string | null;
  created_at: string;
};

export function mapCustodyWallet(row: CustodyWalletRow) {
  return {
    id: row.id,
    address: row.address,
    label: row.label,
    status: row.status,
    isDefault: row.is_default,
    hasPrivateKey: !!row.private_key_enc,
    createdAt: row.created_at,
  };
}

export async function listCustodyWallets() {
  const r = await query<CustodyWalletRow>(
    `SELECT id, address, label, status, is_default, private_key_enc, created_at
     FROM tether_wallets
     WHERE is_custody = true
     ORDER BY is_default DESC, created_at ASC`,
  );
  return r.rows.map(mapCustodyWallet);
}

/** Attach on-chain USDT balances (best-effort; null on fetch error). */
export async function listCustodyWalletsWithBalances() {
  const wallets = await listCustodyWallets();
  const withBal = await Promise.all(
    wallets.map(async (w) => {
      try {
        const bal = await fetchTronUsdtBalance(w.address);
        return {
          ...w,
          balanceUsdt: bal.balanceUsdt,
          balanceFetchedAt: bal.fetchedAt,
          balanceError: null as string | null,
        };
      } catch (e) {
        return {
          ...w,
          balanceUsdt: null as number | null,
          balanceFetchedAt: null as string | null,
          balanceError: e instanceof Error ? e.message : 'Balance fetch failed',
        };
      }
    }),
  );
  const totalUsdt = withBal.reduce((s, w) => s + (w.balanceUsdt ?? 0), 0);
  const rounded = Math.round(totalUsdt * 100) / 100;
  totalUsdtCache = { value: rounded, at: Date.now() };
  return {
    wallets: withBal,
    totalUsdt: rounded,
  };
}

let totalUsdtCache: { value: number; at: number } | null = null;
const TOTAL_USDT_CACHE_MS = 20_000;

/** Cached sum of custody on-chain USDT (for admin top bar). */
export async function getCustodyTotalUsdtCached() {
  if (totalUsdtCache && Date.now() - totalUsdtCache.at < TOTAL_USDT_CACHE_MS) {
    return totalUsdtCache.value;
  }
  const { totalUsdt } = await listCustodyWalletsWithBalances();
  return totalUsdt;
}

async function clearCustodyDefaults() {
  await query(`UPDATE tether_wallets SET is_default = false WHERE is_custody = true AND is_default = true`);
}

export async function createCustodyWallet(label: string, makeDefault = false) {
  const { address, privateKey } = generateTronWallet();
  const enc = encryptPrivateKey(privateKey);
  const existing = await query(`SELECT id FROM tether_wallets WHERE is_custody = true LIMIT 1`);
  const isDefault = makeDefault || !existing.rowCount;
  if (isDefault) await clearCustodyDefaults();
  const inserted = await query<CustodyWalletRow>(
    `INSERT INTO tether_wallets
      (user_id, is_custody, is_platform_managed, is_default, chain, address, label, status, private_key_enc)
     VALUES (NULL, true, false, $1, 'TRC-20', $2, $3, 'active', $4)
     RETURNING id, address, label, status, is_default, private_key_enc, created_at`,
    [isDefault, address, label.trim() || '관리자 지갑', enc],
  );
  return mapCustodyWallet(inserted.rows[0]);
}

export async function registerCustodyWallet(opts: {
  address: string;
  label: string;
  privateKey?: string;
  makeDefault?: boolean;
}) {
  const address = opts.address.trim();
  if (!TRON_ADDR.test(address)) throw Object.assign(new Error('Invalid TRC-20 address'), { status: 400 });

  let enc: string | null = null;
  if (opts.privateKey?.trim()) {
    const pk = opts.privateKey.trim().replace(/^0x/, '');
    const derived = tronAddressFromPrivateKey(pk);
    if (derived !== address) {
      throw Object.assign(new Error('Private key does not match address'), { status: 400 });
    }
    enc = encryptPrivateKey(pk);
  }

  const existing = await query(`SELECT id FROM tether_wallets WHERE is_custody = true LIMIT 1`);
  const isDefault = !!opts.makeDefault || !existing.rowCount;
  if (isDefault) await clearCustodyDefaults();

  try {
    const inserted = await query<CustodyWalletRow>(
      `INSERT INTO tether_wallets
        (user_id, is_custody, is_platform_managed, is_default, chain, address, label, status, private_key_enc)
       VALUES (NULL, true, false, $1, 'TRC-20', $2, $3, 'active', $4)
       RETURNING id, address, label, status, is_default, private_key_enc, created_at`,
      [isDefault, address, opts.label.trim() || '등록 지갑', enc],
    );
    return mapCustodyWallet(inserted.rows[0]);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      throw Object.assign(new Error('Address already registered'), { status: 409 });
    }
    throw e;
  }
}

export async function setDefaultCustodyWallet(walletId: string) {
  const found = await query(`SELECT id FROM tether_wallets WHERE id = $1 AND is_custody = true`, [walletId]);
  if (!found.rowCount) throw Object.assign(new Error('Custody wallet not found'), { status: 404 });
  await clearCustodyDefaults();
  await query(`UPDATE tether_wallets SET is_default = true WHERE id = $1`, [walletId]);
  return listCustodyWallets();
}

export async function revealCustodyPrivateKey(walletId: string): Promise<string> {
  const r = await query<{ private_key_enc: string | null }>(
    `SELECT private_key_enc FROM tether_wallets WHERE id = $1 AND is_custody = true`,
    [walletId],
  );
  if (!r.rowCount) throw Object.assign(new Error('Custody wallet not found'), { status: 404 });
  if (!r.rows[0].private_key_enc) {
    throw Object.assign(new Error('No private key stored for this wallet'), { status: 404 });
  }
  try {
    return decryptPrivateKey(r.rows[0].private_key_enc);
  } catch {
    throw Object.assign(new Error('Failed to decrypt private key'), { status: 500 });
  }
}

export async function createCustodyTransfer(opts: {
  fromWalletId: string;
  toWalletId: string;
  amountUsdt: number;
  note?: string;
  createdBy: string;
}) {
  if (opts.fromWalletId === opts.toWalletId) {
    throw Object.assign(new Error('출금과 입금 지갑은 달라야 합니다.'), { status: 400 });
  }
  const wallets = await query(
    `SELECT id FROM tether_wallets
     WHERE is_custody = true AND id = ANY($1::uuid[]) AND status = 'active'`,
    [[opts.fromWalletId, opts.toWalletId]],
  );
  if (wallets.rowCount !== 2) {
    throw Object.assign(new Error('Both wallets must be active custody wallets'), { status: 400 });
  }
  const inserted = await query(
    `INSERT INTO custody_wallet_transfers
      (from_wallet_id, to_wallet_id, amount_usdt, status, note, created_by)
     VALUES ($1,$2,$3,'pending',$4,$5)
     RETURNING *`,
    [opts.fromWalletId, opts.toWalletId, opts.amountUsdt, opts.note ?? '', opts.createdBy],
  );
  return inserted.rows[0];
}

export async function listCustodyTransfers(limit = 50) {
  const r = await query(
    `SELECT t.*,
       fw.address AS from_address, fw.label AS from_label,
       tw.address AS to_address, tw.label AS to_label
     FROM custody_wallet_transfers t
     JOIN tether_wallets fw ON fw.id = t.from_wallet_id
     JOIN tether_wallets tw ON tw.id = t.to_wallet_id
     ORDER BY t.created_at DESC
     LIMIT $1`,
    [limit],
  );
  return r.rows.map((row) => ({
    id: row.id,
    fromWalletId: row.from_wallet_id,
    toWalletId: row.to_wallet_id,
    fromAddress: row.from_address,
    fromLabel: row.from_label,
    toAddress: row.to_address,
    toLabel: row.to_label,
    amountUsdt: Number(row.amount_usdt),
    status: row.status,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }));
}

export async function setCustodyTransferStatus(id: string, status: 'completed' | 'cancelled') {
  const r = await query(
    `UPDATE custody_wallet_transfers
     SET status = $2,
         completed_at = CASE WHEN $2 = 'completed' THEN now() ELSE completed_at END
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [id, status],
  );
  if (!r.rowCount) throw Object.assign(new Error('Pending transfer not found'), { status: 404 });
  return r.rows[0];
}
