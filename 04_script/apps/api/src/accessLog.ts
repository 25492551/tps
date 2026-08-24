import type { Request } from 'express';
import { query } from './db.js';

export type AccessEvent = 'login' | 'handoff';

export function clientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0]!.trim().slice(0, 64);
  }
  if (Array.isArray(xf) && xf[0]) {
    return String(xf[0]).split(',')[0]!.trim().slice(0, 64);
  }
  return (req.socket.remoteAddress || '').slice(0, 64);
}

export function clientUserAgent(req: Request): string {
  const ua = req.headers['user-agent'];
  return (typeof ua === 'string' ? ua : '').slice(0, 512);
}

/** Best-effort; never throws to callers. */
export async function recordUserAccess(
  req: Request,
  userId: string,
  event: AccessEvent,
): Promise<void> {
  try {
    await query(
      `INSERT INTO user_access_logs (user_id, event, ip, user_agent)
       VALUES ($1, $2, $3, $4)`,
      [userId, event, clientIp(req), clientUserAgent(req)],
    );
  } catch (e) {
    console.warn('recordUserAccess failed', e instanceof Error ? e.message : e);
  }
}
