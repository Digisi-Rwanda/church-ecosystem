/**
 * The Administrator console (phase 3): accounts and password resets, access review and system health,
 * in one place. Every route here is for Administrators only, judged on the server.
 * Add-only: it reads the same tables as the rest of the app and writes accounts and the audit trail.
 */
import { randomInt } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { liveHoldings, type AccessData, type DelegationRec, type MembershipRec, type PositionRec } from '../capabilities/engine.js';
import { config } from '../config.js';
import { hashPassword } from '../lib/auth.js';
import { officeOf } from '../lib/offices.js';
import { prisma } from '../lib/prisma.js';
import { MIN_ADMINISTRATORS, OFFICE_TITLE } from '../shared/accessMatrix.js';
import { pathParam, requireAuth, type AuthedRequest } from '../middleware/http.js';
import { clearFails, lockedUsers } from './auth.js';

export const adminRouter = Router();

const fail = (res: any, status: number, code: string, error: string) => res.status(status).json({ error, code });
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : typeof d === 'string' ? d : null);

async function loadAccess(): Promise<AccessData> {
  const [positions, memberships, delegations, units] = await Promise.all([
    prisma.position.findMany(),
    prisma.membership.findMany(),
    prisma.delegation.findMany(),
    prisma.orgUnit.findMany(),
  ]);
  const unitSystem: Record<string, string | null> = {};
  for (const u of units as Array<{ id: string; systemId?: string | null }>) unitSystem[u.id] = u.systemId ?? null;
  return { positions: positions as PositionRec[], memberships: memberships as MembershipRec[], delegations: delegations as DelegationRec[], unitSystem };
}

/** The gate for every route below. */
async function requireAdministrator(req: AuthedRequest, res: any, next: () => void) {
  const data = await loadAccess();
  const isAdmin = liveHoldings(req.auth!.personId, data, new Date()).some((h) => h.via === 'OFFICE' && h.office === 'ADMINISTRATOR');
  if (!isAdmin) return fail(res, 403, 'NOT_ALLOWED', 'Only Administrators use the console');
  next();
}
adminRouter.use(requireAuth, requireAdministrator);

async function audit(actorId: string, action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({ data: { at: new Date(), actorId, systemId: 'sys-main', action, resource: 'ACCOUNT', detail, metaJson: JSON.stringify(meta) } });
}

/** A temporary password: 12 characters, no look-alikes, shown once to the Administrator. */
export function temporaryPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 12 }, () => alphabet[randomInt(alphabet.length)]).join('');
}

adminRouter.get('/overview', async (_req, res) => {
  const now = new Date();
  const data = await loadAccess();
  const admins = data.positions.filter((p) => officeOf(p) === 'ADMINISTRATOR' && p.status === 'ACTIVE').length;
  let db: 'ok' | 'error' = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = 'error';
  }
  const [accounts, people] = await Promise.all([prisma.account.count(), prisma.person.count()]);
  res.json({
    administrators: { count: admins, minimum: MIN_ADMINISTRATORS },
    accounts,
    people,
    withoutAccount: Math.max(0, people - accounts),
    locked: lockedUsers().length,
    health: { db, env: config.appEnv ?? 'unspecified', time: now.toISOString() },
    // The host does not report backups to the app; the console says so instead of guessing.
    backup: null,
  });
});

adminRouter.get('/accounts', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const accountRows = (await prisma.account.findMany({ orderBy: { username: 'asc' } })) as Array<{ id: string; personId: string; username: string; createdAt: Date; updatedAt: Date }>;
  const peopleRows = (await prisma.person.findMany({ where: { id: { in: accountRows.map((a) => a.personId) } } })) as Array<{ id: string; fullName: string; memberCode?: string | null; status: string; archivedAt?: Date | null }>;
  const personOf = new Map(peopleRows.map((p) => [p.id, p]));
  const rows = accountRows
    .filter((a) => personOf.has(a.personId))
    .map((a) => ({ ...a, person: personOf.get(a.personId)! }));
  const locked = new Set(lockedUsers());
  const data = await loadAccess();
  const now = new Date();
  const mine = rows
    .filter((a) => !q || a.username.toLowerCase().includes(q.toLowerCase()) || a.person.fullName.toLowerCase().includes(q.toLowerCase()) || (a.person.memberCode ?? '').toLowerCase() === q.toLowerCase())
    .slice(0, 200)
    .map((a) => ({
      personId: a.personId,
      name: a.person.fullName,
      memberCode: a.person.memberCode ?? null,
      username: a.username,
      status: a.person.archivedAt ? 'ARCHIVED' : a.person.status,
      locked: locked.has(a.username.toLowerCase()),
      createdAt: iso(a.createdAt),
      passwordChangedAt: iso(a.updatedAt),
      offices: liveHoldings(a.personId, data, now)
        .filter((h) => h.via === 'OFFICE')
        .map((h) => OFFICE_TITLE[h.office as keyof typeof OFFICE_TITLE] ?? String(h.office)),
    }));
  res.json({ accounts: mine, total: rows.length });
});

const createSchema = z.object({ personId: z.string().min(1), username: z.string().trim().min(3).max(40).regex(/^[a-z0-9._-]+$/i, 'Use letters, numbers, dot, dash or underscore') });

/** A sign-in for a person who has none. The password is temporary and shown once. */
adminRouter.post('/accounts', async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', parsed.error.issues[0]?.message ?? 'Invalid body');
  const { personId } = parsed.data;
  const username = parsed.data.username.toLowerCase();
  const person = (await prisma.person.findUnique({ where: { id: personId } })) as { status: string; archivedAt?: Date | null } | null;
  if (!person) return fail(res, 404, 'NOT_FOUND', 'Person not found');
  if (person.status === 'INACTIVE' || person.archivedAt) return fail(res, 409, 'PERSON_NOT_ACTIVE', 'That person is not active');
  if (await prisma.account.findUnique({ where: { personId } })) return fail(res, 409, 'ALREADY_HAS_ACCOUNT', 'That person already has a sign-in');
  if (await prisma.account.findUnique({ where: { username } })) return fail(res, 409, 'USERNAME_TAKEN', 'That username is taken');
  const password = temporaryPassword();
  await prisma.account.create({ data: { id: `acc-${personId}`, personId, username, passwordHash: await hashPassword(password) } });
  await audit(req.auth!.personId, 'ACCOUNT_CREATED', `Sign-in created for ${personId}`, { personId, username });
  res.status(201).json({ username, temporaryPassword: password });
});

/** Reset someone else's password. Your own goes through "change password". */
adminRouter.post('/accounts/:personId/reset-password', async (req: AuthedRequest, res) => {
  const personId = pathParam(req, 'personId')!;
  if (personId === req.auth!.personId) return fail(res, 409, 'SELF', 'Change your own password from your settings');
  const account = (await prisma.account.findUnique({ where: { personId } })) as { id: string; username: string } | null;
  if (!account) return fail(res, 404, 'NOT_FOUND', 'That person has no sign-in');
  const password = temporaryPassword();
  await prisma.account.update({ where: { id: account.id }, data: { passwordHash: await hashPassword(password) } });
  clearFails(account.username);
  await audit(req.auth!.personId, 'PASSWORD_RESET', `Password reset for ${personId}`, { personId });
  res.json({ username: account.username, temporaryPassword: password });
});

/** Let someone try again after too many wrong passwords. */
adminRouter.post('/accounts/:personId/unlock', async (req: AuthedRequest, res) => {
  const personId = pathParam(req, 'personId')!;
  const account = (await prisma.account.findUnique({ where: { personId } })) as { username: string } | null;
  if (!account) return fail(res, 404, 'NOT_FOUND', 'That person has no sign-in');
  clearFails(account.username);
  await audit(req.auth!.personId, 'ACCOUNT_UNLOCKED', `Sign-in unlocked for ${personId}`, { personId });
  res.json({ unlocked: true });
});

const ADMIN_ACTIONS = ['PASSWORD_RESET', 'ACCOUNT_CREATED', 'ACCOUNT_UNLOCKED', 'APPOINTED', 'OFFICE_ENDED', 'TERM_CHANGED', 'DELEGATED', 'DELEGATION_REVOKED', 'ARCHIVE', 'UNARCHIVE', 'PERSON_IMPORT'];

/** Everything an Administrator reviews: accounts, appointments, archives, imports. */
adminRouter.get('/audit', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const rows = (await prisma.auditEvent.findMany({ where: { action: { in: ADMIN_ACTIONS } }, orderBy: { at: 'desc' }, take: 500 })) as Array<{
    id: string; at: Date; actorId?: string | null; action: string; detail?: string | null;
  }>;
  rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const page = rows.slice(0, limit);
  const ids = [...new Set(page.map((r) => r.actorId).filter(Boolean) as string[])];
  const people = ids.length ? ((await prisma.person.findMany({ where: { id: { in: ids } } })) as Array<{ id: string; fullName: string }>) : [];
  const nameOf = new Map(people.map((p) => [p.id, p.fullName]));
  res.json({ events: page.map((r) => ({ id: r.id, at: iso(r.at), action: r.action, detail: r.detail ?? '', actorName: r.actorId ? (nameOf.get(r.actorId) ?? r.actorId) : null })) });
});
