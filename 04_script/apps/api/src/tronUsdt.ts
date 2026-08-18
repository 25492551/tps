import { sha256 } from '@noble/hashes/sha256';

/** Mainnet USDT (TRC-20). */
export const TRON_USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const TRONGRID = (process.env.TRONGRID_API_URL || 'https://api.trongrid.io').replace(/\/$/, '');

function base58Decode(s: string): Uint8Array {
  let zeros = 0;
  while (zeros < s.length && s[zeros] === '1') zeros += 1;
  const bytes: number[] = [];
  for (let i = zeros; i < s.length; i += 1) {
    let carry = BASE58.indexOf(s[i]);
    if (carry < 0) throw new Error('Invalid base58');
    for (let j = 0; j < bytes.length; j += 1) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  const out = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i += 1) out[out.length - 1 - i] = bytes[i];
  return out;
}

/** Base58Check Tron address → 21-byte hex with 0x41 prefix (no 0x). */
export function tronAddressToHex41(address: string): string {
  const full = base58Decode(address.trim());
  if (full.length < 25) throw new Error('Invalid Tron address length');
  const payload = full.slice(0, full.length - 4);
  const checksum = full.slice(full.length - 4);
  const h1 = sha256(payload);
  const h2 = sha256(h1);
  for (let i = 0; i < 4; i += 1) {
    if (checksum[i] !== h2[i]) throw new Error('Invalid Tron address checksum');
  }
  if (payload[0] !== 0x41 || payload.length !== 21) throw new Error('Not a Tron address');
  return Buffer.from(payload).toString('hex');
}

function balanceOfParameter(address: string): string {
  const hex41 = tronAddressToHex41(address);
  return hex41.slice(2).padStart(64, '0');
}

/**
 * On-chain USDT (TRC-20) balance via TronGrid constant call.
 * Returns human units (6 decimals → number).
 */
export async function fetchTronUsdtBalance(address: string): Promise<{
  balanceUsdt: number;
  raw: string;
  fetchedAt: string;
}> {
  const fetchedAt = new Date().toISOString();
  const res = await fetch(`${TRONGRID}/wallet/triggerconstantcontract`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(process.env.TRONGRID_API_KEY
        ? { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY }
        : {}),
    },
    body: JSON.stringify({
      owner_address: address,
      contract_address: TRON_USDT_CONTRACT,
      function_selector: 'balanceOf(address)',
      parameter: balanceOfParameter(address),
      visible: true,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`TronGrid HTTP ${res.status}`);
  const data = (await res.json()) as {
    result?: { result?: boolean; message?: string };
    constant_result?: string[];
  };
  if (data.result?.result === false) {
    throw new Error(data.result.message || 'Tron constant call failed');
  }
  const hex = data.constant_result?.[0];
  if (!hex) throw new Error('No constant_result from TronGrid');
  const raw = BigInt(`0x${hex}`);
  const balanceUsdt = Number(raw) / 1e6;
  return {
    balanceUsdt: Math.round(balanceUsdt * 100) / 100,
    raw: raw.toString(),
    fetchedAt,
  };
}
