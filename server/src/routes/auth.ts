import { Router } from 'express';
import { z } from 'zod';
import { hashPassword, signAccessToken, verifyPassword } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';

export const authRouter = Router();

/** Failed-login throttle (per username, in memory). Good enough for one API instance. */
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;
const fails = new Map<string, { n: number; first: number }>();
function throttled(key: string): boolean {
  const f = fails.get(key);
  if (!f) return false;
  if (Date.now() - f.first > FAIL_WINDOW_MS) {
    fails.delete(key);
    return false;
  }
  return f.n >= MAX_FAILS;
}
function noteFail(key: string) {
  const f = fails.get(key);
  if (!f || Date.now() - f.first > FAIL_WINDOW_MS) fails.set(key, { n: 1, first: Date.now() });
  else f.n += 1;
}

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  /** Optional peer system to enter after login (SSO path later). */
  systemId: z.string().optional(),
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const { password, systemId } = parsed.data;
  // Saved-password prompts and phone keyboards add capitals and stray spaces.
  const typed = parsed.data.username.trim();
  const throttleKey = typed.toLowerCase();
  if (throttled(throttleKey)) {
    res.status(429).json({ error: 'Too many failed attempts — try again later' });
    return;
  }
  let account = await prisma.account.findUnique({
    where: { username: typed },
    include: { person: true },
  });
  if (!account && typed !== throttleKey) {
    account = await prisma.account.findUnique({
      where: { username: throttleKey },
      include: { person: true },
    });
  }
  if (
    !account ||
    !(await verifyPassword(password, account.passwordHash)) ||
    account.person.status === 'INACTIVE'
  ) {
    noteFail(throttleKey);
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }
  fails.delete(throttleKey);

  const token = signAccessToken({
    sub: account.id,
    personId: account.personId,
    username: account.username,
  });

  await prisma.auditEvent.create({
    data: {
      actorId: account.personId,
      systemId: systemId ?? 'sys-main',
      action: 'LOGIN',
      resource: 'ACCOUNT',
      detail: `username=${account.username}`,
    },
  });

  res.json({
    token,
    account: {
      id: account.id,
      username: account.username,
      personId: account.personId,
    },
    person: {
      id: account.person.id,
      fullName: account.person.fullName,
      preferredName: account.person.preferredName,
      status: account.person.status,
    },
  });
});

authRouter.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  const account = await prisma.account.findUnique({
    where: { id: req.auth!.sub },
    include: {
      person: {
        include: {
          memberships: { where: { status: 'ACTIVE' } },
          positions: { where: { status: 'ACTIVE' } },
        },
      },
    },
  });
  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  res.json({
    account: {
      id: account.id,
      username: account.username,
      personId: account.personId,
    },
    person: account.person,
    memberships: account.person.memberships,
    positions: account.person.positions,
  });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10, 'Use at least 10 characters').max(200),
});

/** Anyone signed in can change their own password (needed after a temporary one). */
authRouter.post('/change-password', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' });
    return;
  }
  const { currentPassword, newPassword } = parsed.data;
  const account = await prisma.account.findUnique({ where: { id: req.auth!.sub } });
  const key = (account?.username ?? '').toLowerCase();
  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  if (throttled(key)) {
    res.status(429).json({ error: 'Too many failed attempts — try again later' });
    return;
  }
  if (!(await verifyPassword(currentPassword, account.passwordHash))) {
    noteFail(key);
    res.status(401).json({ error: 'Current password is not right' });
    return;
  }
  if (newPassword === currentPassword) {
    res.status(400).json({ error: 'Choose a different password' });
    return;
  }
  await prisma.account.update({
    where: { id: account.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  fails.delete(key);
  res.json({ ok: true });
});
