import { query, withTransaction } from './db.js';
import { appendLedger, getBalance } from './ledger.js';
import { loadDefaultCustodyHotWallet } from './otcWallets.js';
import { transferTronUsdt } from './tronTransfer.js';

const tronRe = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export function isTronAddress(value: string): boolean {
  return tronRe.test(value);
}

/** If address belongs to a platform user managed wallet, return that user id. */
export async function findUserIdByManagedAddress(address: string): Promise<string | null> {
  const r = await query<{ user_id: string }>(
    `SELECT user_id FROM tether_wallets
     WHERE address = $1 AND is_custody = false AND is_platform_managed = true
       AND user_id IS NOT NULL AND status = 'active'
     LIMIT 1`,
    [address],
  );
  return r.rows[0]?.user_id ?? null;
}

/**
 * External USDT withdrawal: debit ledger, send on-chain from custody, mark withdrawal done.
 */
export async function executeExternalUsdtWithdraw(opts: {
  userId: string;
  amountUsdt: number;
  destination: string;
}): Promise<{ withdrawalId: string; onchainTxId: string; toAddress: string }> {
  if (!isTronAddress(opts.destination)) {
    throw new Error('Invalid TRC-20 destination');
  }
  const internalUser = await findUserIdByManagedAddress(opts.destination);
  if (internalUser) {
    throw new Error('Destination is a platform wallet — use internal transfer instead');
  }

  const withdrawalId = await withTransaction(async (client) => {
    const bal = await getBalance(opts.userId, 'usdt', client);
    if (bal + 1e-9 < opts.amountUsdt) throw new Error('Insufficient USDT balance');

    const w = await client.query<{ id: string }>(
      `INSERT INTO withdrawal_requests (user_id, asset, amount, destination, status)
       VALUES ($1, 'usdt', $2, $3, 'processing') RETURNING id`,
      [opts.userId, opts.amountUsdt, opts.destination],
    );
    const id = w.rows[0].id;
    await appendLedger(client, {
      userId: opts.userId,
      asset: 'usdt',
      direction: 'debit',
      amount: opts.amountUsdt,
      refType: 'withdraw_out',
      refId: id,
      note: `외부 출금 ${opts.destination.slice(0, 6)}…`,
    });
    return id;
  });

  try {
    const custody = await loadDefaultCustodyHotWallet();
    const sent = await transferTronUsdt({
      fromPrivateKeyHex: custody.privateKeyHex,
      toAddress: opts.destination,
      amountUsdt: opts.amountUsdt,
    });
    await query(
      `UPDATE withdrawal_requests
       SET status = 'done', admin_note = $2, updated_at = now()
       WHERE id = $1`,
      [withdrawalId, `txid:${sent.txId}`],
    );
    return { withdrawalId, onchainTxId: sent.txId, toAddress: opts.destination };
  } catch (e) {
    await withTransaction(async (client) => {
      await appendLedger(client, {
        userId: opts.userId,
        asset: 'usdt',
        direction: 'credit',
        amount: opts.amountUsdt,
        refType: 'withdraw_refund',
        refId: withdrawalId,
        note: '외부 출금 실패 환불',
      });
      await client.query(
        `UPDATE withdrawal_requests
         SET status = 'rejected',
             admin_note = $2,
             updated_at = now()
         WHERE id = $1`,
        [withdrawalId, e instanceof Error ? e.message : 'on-chain send failed'],
      );
    });
    throw e;
  }
}
