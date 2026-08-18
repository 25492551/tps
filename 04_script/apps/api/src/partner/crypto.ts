import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';

const HANDOFF_SECRET = () =>
  process.env.PARTNER_HANDOFF_SECRET || process.env.JWT_SECRET || 'dev-secret';

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

export function generateApiKey(prefix = 'pk'): string {
  return `${prefix}_${randomBytes(24).toString('base64url')}`;
}

export function apiKeyMatches(raw: string, hash: string): boolean {
  const a = Buffer.from(hashApiKey(raw), 'utf8');
  const b = Buffer.from(hash, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type HandoffPayload = {
  typ: 'partner_handoff';
  partnerId: string;
  partnerCode: string;
  userId: string;
  externalUserId: string;
};

export function signHandoffToken(payload: Omit<HandoffPayload, 'typ'>, ttlSec = 300): string {
  return jwt.sign({ ...payload, typ: 'partner_handoff' }, HANDOFF_SECRET(), {
    expiresIn: ttlSec,
  });
}

export function verifyHandoffToken(token: string): HandoffPayload {
  const decoded = jwt.verify(token, HANDOFF_SECRET()) as HandoffPayload;
  if (decoded.typ !== 'partner_handoff') throw new Error('Invalid handoff token');
  return decoded;
}
