import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { authorizePerson } from '../policy/index.js';

/**
 * One-time SSO handoff (church → peer).
 * Prototype SPA used localStorage; production redeems here then issues JWT.
 */
export const ssoRouter = Router();

const issueSchema = z.object({
  systemId: z.string().min(1),
  ttlSeconds: z.number().int().min(30).max(600).optional(),
});

ssoRouter.post('/issue', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = issueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const { systemId } = parsed.data;
  const ttl = parsed.data.ttlSeconds ?? 120;
  const system = await prisma.churchSystem.findUnique({ where: { id: systemId } });
  if (!system) {
    res.status(404).json({ error: 'System not found' });
    return;
  }

  const enter = await authorizePerson({
    personId: req.auth!.personId,
    systemId,
    resource: 'SYSTEM',
    action: 'ENTER',
  });
  if (!enter.allowed) {
    res.status(403).json({ error: enter.reason });
    return;
  }

  const token = randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + ttl * 1000);
  await prisma.ssoHandoffToken.create({
    data: {
      token,
      accountId: req.auth!.sub,
      systemId,
      expiresAt,
    },
  });

  const handoffPath = `/sso/handoff?token=${token}&system=${systemId}`;
  res.status(201).json({
    token,
    expiresAt: expiresAt.toISOString(),
    systemId,
    /** Same-origin path for current SPA; use system.externalUrl when peers split. */
    handoffPath,
    externalUrl: system.externalUrl
      ? `${system.externalUrl.replace(/\/$/, '')}/sso/handoff?token=${token}`
      : null,
  });
});

const redeemSchema = z.object({
  token: z.string().min(1),
});

ssoRouter.post('/redeem', async (req, res) => {
  const parsed = redeemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body' });
    return;
  }
  const row = await prisma.ssoHandoffToken.findUnique({
    where: { token: parsed.data.token },
  });
  if (!row || row.redeemedAt || row.expiresAt < new Date()) {
    res.status(400).json({ error: 'Invalid or expired handoff token' });
    return;
  }
  // Atomic claim: only one concurrent redeem can flip redeemedAt from null.
  const claimed = await prisma.ssoHandoffToken.updateMany({
    where: { id: row.id, redeemedAt: null },
    data: { redeemedAt: new Date() },
  });
  if (claimed.count !== 1) {
    res.status(400).json({ error: 'Invalid or expired handoff token' });
    return;
  }
  const account = await prisma.account.findUnique({
    where: { id: row.accountId },
    include: { person: true },
  });
  if (!account) {
    res.status(400).json({ error: 'Account missing' });
    return;
  }

  const { signAccessToken } = await import('../lib/auth.js');
  const jwt = signAccessToken({
    sub: account.id,
    personId: account.personId,
    username: account.username,
  });

  res.json({
    token: jwt,
    systemId: row.systemId,
    account: {
      id: account.id,
      username: account.username,
      personId: account.personId,
    },
    person: {
      id: account.person.id,
      fullName: account.person.fullName,
      preferredName: account.person.preferredName,
    },
  });
});
