import { Router } from 'express';
import { z } from 'zod';
import { signToken, verifyPassword, verifyToken } from '../auth.js';
import { query } from '../db.js';
import { requireAuth, type AuthedRequest } from '../middleware.js';
import { getSiteSettings } from '../settings.js';
import { toPublicUser, type DbUser } from '../types.js';
import { verifyHandoffToken } from '../partner/crypto.js';
import { findPartnerByCode } from '../partner/partners.js';

export const authRouter = Router();

async function assertBrowserMultiAccountAllowed(
  req: { body?: { browserUserId?: string }; headers: Record<string, unknown> },
  nextUser: { id: string; role: string },
) {
  if (nextUser.role === 'admin') return;

  const settings = await getSiteSettings();
  if (settings.allowMultiAccountBrowser) return;

  const browserUserId =
    (typeof req.body?.browserUserId === 'string' && req.body.browserUserId) ||
    (typeof req.headers['x-browser-user-id'] === 'string'
      ? req.headers['x-browser-user-id']
      : undefined);

  // Also honor currently presented Bearer token (another *user* already in this browser).
  // Admin JWTs are ignored so admin+user can coexist when multi-account lock is on.
  const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
  let tokenUserId: string | undefined;
  if (token) {
    try {
      const payload = verifyToken(token);
      if (payload.role !== 'admin') tokenUserId = payload.sub;
    } catch {
      tokenUserId = undefined;
    }
  }

  const lockedId = browserUserId || tokenUserId;
  if (lockedId && lockedId !== nextUser.id) {
    const err = new Error(
      '이 브라우저에서는 다른 계정으로 로그인할 수 없습니다. 기존 계정에서 로그아웃한 뒤 다시 시도하세요.',
    );
    (err as Error & { status: number }).status = 403;
    throw err;
  }
}

authRouter.get('/settings', async (_req, res) => {
  const settings = await getSiteSettings();
  res.json({ settings });
});

authRouter.post('/register', async (_req, res) => {
  res.status(403).json({
    error: '공개 회원가입은 종료되었습니다. 연동 솔루션(S01 등)을 통해 이용하세요.',
  });
});

/** Exchange partner handoff token for a normal user JWT. */
authRouter.post('/handoff', async (req, res) => {
  const body = z.object({ token: z.string().min(10) }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'token required' });
    return;
  }
  try {
    const payload = verifyHandoffToken(body.data.token);
    const userR = await query<DbUser>(`SELECT * FROM users WHERE id = $1`, [payload.userId]);
    const row = userR.rows[0];
    if (!row || row.status !== 'active') {
      res.status(401).json({ error: 'Invalid handoff user' });
      return;
    }
    const partner = await findPartnerByCode(payload.partnerCode);
    if (!partner || partner.id !== payload.partnerId) {
      res.status(401).json({ error: 'Partner disabled' });
      return;
    }
    const user = toPublicUser(row);
    const token = signToken({ sub: user.id, role: user.role, status: user.status });
    res.json({
      token,
      user,
      partner: {
        code: partner.code,
        name: partner.name,
        virtualDepositAddress: partner.virtual_deposit_address,
      },
    });
  } catch {
    res.status(401).json({ error: 'Invalid or expired handoff token' });
  }
});

authRouter.get('/partner/:code', async (req, res) => {
  const partner = await findPartnerByCode(String(req.params.code));
  if (!partner) {
    res.status(404).json({ error: 'Partner not found' });
    return;
  }
  res.json({
    code: partner.code,
    name: partner.name,
    virtualDepositAddress: partner.virtual_deposit_address,
  });
});

authRouter.post('/login', async (req, res) => {
  const body = z
    .object({
      email: z.string().email(),
      password: z.string().min(1),
      browserUserId: z.string().uuid().optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'Invalid credentials payload' });
    return;
  }
  const result = await query<DbUser>('SELECT * FROM users WHERE email = $1', [
    body.data.email.toLowerCase(),
  ]);
  const row = result.rows[0];
  if (!row || row.status === 'deleted') {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }
  const ok = await verifyPassword(body.data.password, row.password_hash);
  if (!ok) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }
  const user = toPublicUser(row);
  try {
    await assertBrowserMultiAccountAllowed(
      { body: body.data, headers: req.headers as Record<string, unknown> },
      user,
    );
  } catch (e) {
    const status = (e as { status?: number }).status ?? 403;
    res.status(status).json({ error: e instanceof Error ? e.message : 'Forbidden' });
    return;
  }
  const token = signToken({ sub: user.id, role: user.role, status: user.status });
  res.json({ token, user });
});

authRouter.post('/logout', (_req, res) => {
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});
