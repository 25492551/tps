import { getPublicKey, utils as secpUtils } from '@noble/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits = [0];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j += 1) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '1'.repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) out += BASE58[digits[i]];
  return out;
}

function base58CheckEncode(payload: Uint8Array): string {
  const h1 = sha256(payload);
  const h2 = sha256(h1);
  const checksum = h2.slice(0, 4);
  const full = new Uint8Array(payload.length + 4);
  full.set(payload, 0);
  full.set(checksum, payload.length);
  return base58Encode(full);
}

/** Derive TRC-20 (Tron) address from 32-byte private key. */
export function tronAddressFromPrivateKey(privateKeyHex: string): string {
  const priv = hexToBytes(privateKeyHex.replace(/^0x/, ''));
  if (priv.length !== 32) throw new Error('Private key must be 32 bytes');
  const pub = getPublicKey(priv, false); // uncompressed 65 bytes
  const hash = keccak_256(pub.slice(1));
  const addr20 = hash.slice(12);
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(addr20, 1);
  return base58CheckEncode(payload);
}

export function generateTronWallet(): { address: string; privateKey: string } {
  const priv = secpUtils.randomPrivateKey();
  const privateKey = bytesToHex(priv);
  const address = tronAddressFromPrivateKey(privateKey);
  return { address, privateKey };
}
