import type { Request, Response, NextFunction } from 'express';
import { query } from '../db.js';
import { apiKeyMatches } from './crypto.js';

export type PartnerRow = {
  id: string;
  code: string;
  name: string;
  api_key_hash: string;
  callback_base_url: string;
  callback_path: string;
  callback_secret: string;
  virtual_deposit_address: string;
  usdt_to_game_rate: string;
  status: string;
};

export type PartnerRequest = Request & { partner?: PartnerRow };

export async function requirePartnerKey(req: PartnerRequest, res: Response, next: NextFunction) {
  const header =
    (typeof req.headers['x-partner-key'] === 'string' && req.headers['x-partner-key']) ||
    (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : '');
  if (!header) {
    res.status(401).json({ error: 'Partner API key required' });
    return;
  }
  const result = await query<PartnerRow>(
    `SELECT * FROM partners WHERE status = 'active'`,
  );
  const match = result.rows.find((p) => apiKeyMatches(header, p.api_key_hash));
  if (!match) {
    res.status(401).json({ error: 'Invalid partner API key' });
    return;
  }
  req.partner = match;
  next();
}

export async function findPartnerByVirtualAddress(address: string): Promise<PartnerRow | null> {
  const r = await query<PartnerRow>(
    `SELECT * FROM partners WHERE virtual_deposit_address = $1 AND status = 'active' LIMIT 1`,
    [address],
  );
  return r.rows[0] ?? null;
}

export async function findPartnerByCode(code: string): Promise<PartnerRow | null> {
  const r = await query<PartnerRow>(
    `SELECT * FROM partners WHERE code = $1 AND status = 'active' LIMIT 1`,
    [code],
  );
  return r.rows[0] ?? null;
}
