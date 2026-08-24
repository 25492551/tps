import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from './auth.js';
import { query } from './db.js';
import { toPublicUser, type DbUser, type PublicUser } from './types.js';

export type AuthedRequest = Request & { user?: PublicUser };

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const payload = verifyToken(token);
    const result = await query<DbUser>('SELECT * FROM users WHERE id = $1', [payload.sub]);
    const row = result.rows[0];
    if (!row || row.status === 'deleted') {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    req.user = toPublicUser(row);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin only' });
    return;
  }
  next();
}

export function requireAgent(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'agent') {
    res.status(403).json({ error: 'Agent only' });
    return;
  }
  next();
}

export function requireActiveTrader(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (req.user.role !== 'admin' && req.user.status !== 'active') {
    res.status(403).json({ error: 'Trading requires admin approval', status: req.user.status });
    return;
  }
  next();
}
