import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

function walletKey(): Buffer {
  const secret = process.env.WALLET_KEY_SECRET || process.env.JWT_SECRET || 'dev-wallet-secret';
  return scryptSync(secret, 'tps-managed-wallet-v1', 32);
}

/** Encrypt private key for DB storage (admin custody). Format: iv.hex:tag.hex:data.hex */
export function encryptPrivateKey(privateKeyHex: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', walletKey(), iv);
  const enc = Buffer.concat([cipher.update(privateKeyHex, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptPrivateKey(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Invalid private_key_enc format');
  const decipher = createDecipheriv('aes-256-gcm', walletKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
