/**
 * Memberships, positions and org units on the server (step 4, slice 2).
 *
 * These records decide what everyone may open, so writes are strict:
 *  - every write needs the matching MANAGE grant in the record's own system;
 *  - granting governance authority (systemRole, grantsAllSystems, systemAdmin)
 *    needs POSITION MANAGE in the main church — nobody can hand out power
 *    they do not hold;
 *  - every change is audited.
 * Reads: everyone sees the org structure and their own records; others' records
 * only where they hold MEMBERSHIP / POSITION VIEW for that system.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authorizePerson } from '../policy/index.js';
import { hasPeopleModule } from '../policy/personAccess.js';
import { requireAuth, pathParam, type AuthedRequest } from '../middleware/http.js';

export const participationRouter = Router();

const MAIN = 'sys-main';
const ID = z.string().regex(/^[A-Za-z]{2,6}-[A-Za-z0-9-]{3,60}$/);
const day = (v: unknown): string | undefined =>
  v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'string' ? v.slice(0, 10) : undefined;
const nn = <T>(v: T | null | undefined): T | undefined => (v === null || v === undefined ? undefined : v);

async function allowedAt(personId: string, systemId: string, resource: string, action: string): Promise<boolean> {
  const d = await authorizePerson({ personId, systemId, resource, action } as never);
  return d.allowed;
}

/**
 * May this person do `action` on `resource` in `systemId`?
 * Holding the grant in that system is enough. Holding it in the main church
 * also covers other systems — for reads always, for writes only for church
 * leadership (POSITION MANAGE in the main church), so a Catechist's reach
 * stays inside the main church.
 */
async function can(
  personId: string,
  systemId: string | null | undefined,
  resource: string,
  action: string,
): Promise<boolean> {
  const sys = systemId ?? MAIN;
  if (await allowedAt(personId, sys, resource, action)) return true;
  if (sys === MAIN) return false;
  if (!(await allowedAt(personId, MAIN, resource, action))) return false;
  return action === 'VIEW' ? true : allowedAt(personId, MAIN, 'POSITION', 'MANAGE');
}

/* ───────────── reads ───────────── */

participationRouter.get('/records', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const [orgUnits, memberships, positions] = await Promise.all([
    prisma.orgUnit.findMany({ orderBy: { name: 'asc' } }),
    prisma.membership.findMany({ orderBy: { startDate: 'desc' } }),
    prisma.position.findMany({ orderBy: { startDate: 'desc' } }),
  ]);
  // Church Leader and Catechist (PERSON VIEW) may see everyone's records.
  const broad = await hasPeopleModule(me);
  const memo = new Map<string, boolean>();
  const manages = async (sys: string | null | undefined, resource: string) => {
    const key = `${sys ?? MAIN}|${resource}`;
    if (!memo.has(key)) memo.set(key, await can(me, sys, resource, 'MANAGE'));
    return memo.get(key)!;
  };
  const seeMembership = [];
  for (const m of memberships) {
    if (broad || m.personId === me || (await manages(m.systemId, 'MEMBERSHIP'))) seeMembership.push(m);
  }
  // Who holds which office is public church life; the authority flags are not.
  const seePosition = [];
  for (const p of positions) {
    const full = broad || p.personId === me || (await manages(p.systemId, 'POSITION'));
    if (full) seePosition.push({ p, full: true });
    else if (p.status === 'ACTIVE') seePosition.push({ p, full: false });
  }
  res.json({
    orgUnits: orgUnits.map((u) => ({
      id: u.id,
      name: u.name,
      type: u.type,
      parentId: nn(u.parentId),
      description: nn(u.description),
      systemId: nn(u.systemId),
      leaderPersonId: nn(u.leaderPersonId),
    })),
    memberships: seeMembership.map((m) => ({
      id: m.id,
      personId: m.personId,
      type: m.type,
      label: m.label ?? m.type,
      orgUnitId: nn(m.orgUnitId),
      systemId: nn(m.systemId),
      status: m.status,
      startDate: day(m.startDate) ?? '2000-01-01',
      endDate: day(m.endDate),
    })),
    positions: seePosition.map(({ p, full }) => ({
      id: p.id,
      personId: p.personId,
      title: p.title,
      orgUnitId: nn(p.orgUnitId),
      systemId: nn(p.systemId),
      ...(full
        ? {
            systemRole: nn(p.systemRole),
            ministryOffice: nn(p.ministryOffice),
            choirOffice: nn(p.choirOffice),
            choirAdvisorRole: nn(p.choirAdvisorRole),
            worshipOffice: nn(p.worshipOffice),
            protocolOffice: nn(p.protocolOffice),
            deaconOffice: nn(p.deaconOffice),
            systemAdmin: p.systemAdmin || undefined,
            grantsAllSystems: p.grantsAllSystems || undefined,
          }
        : {}),
      status: p.status,
      startDate: day(p.startDate) ?? '2000-01-01',
      endDate: day(p.endDate),
    })),
  });
});

/* ───────────── helpers ───────────── */

async function audit(actorId: string, systemId: string | null | undefined, action: string, detail: string) {
  await prisma.auditEvent.create({
    data: { actorId, systemId: systemId ?? MAIN, action, resource: 'PARTICIPATION', detail },
  });
}
const bad = (res: any, parsed: any) =>
  res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
const forbid = (res: any, why: string) => res.status(403).json({ error: why });

/* ───────────── org units ───────────── */

const orgSchema = z.object({
  id: ID.optional(),
  name: z.string().min(1).max(160),
  type: z.enum(['MINISTRY', 'TEAM', 'ORGANISATION', 'OFFICE', 'COMMITTEE']),
  parentId: z.string().nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  systemId: z.string().nullable().optional(),
  leaderPersonId: z.string().nullable().optional(),
});

participationRouter.post('/org-units', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = orgSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const d = parsed.data;
  if (!(await can(req.auth!.personId, d.systemId, 'ORG_UNIT', 'MANAGE'))) return forbid(res, 'You may not create org units here');
  const id = d.id ?? `ou-${crypto.randomUUID().slice(0, 8)}`;
  if (await prisma.orgUnit.findUnique({ where: { id } })) return res.status(409).json({ error: 'Already exists' });
  const unit = await prisma.orgUnit.create({
    data: { id, name: d.name, type: d.type, parentId: d.parentId ?? null, description: d.description ?? null, systemId: d.systemId ?? null, leaderPersonId: d.leaderPersonId ?? null },
  });
  await audit(req.auth!.personId, d.systemId, 'ORG_UNIT_CREATE', `${unit.id} ${unit.name}`);
  res.status(201).json({ orgUnit: unit });
});

participationRouter.patch('/org-units/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = pathParam(req, 'id')!;
  const parsed = orgSchema.partial().omit({ id: true }).safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const unit = await prisma.orgUnit.findUnique({ where: { id } });
  if (!unit) return res.status(404).json({ error: 'Not found' });
  const me = req.auth!.personId;
  if (!(await can(me, unit.systemId, 'ORG_UNIT', 'MANAGE'))) return forbid(res, 'You may not change this org unit');
  // Moving a unit under another system needs power over the destination too.
  if (parsed.data.systemId !== undefined && parsed.data.systemId !== unit.systemId) {
    if (!(await can(me, parsed.data.systemId, 'ORG_UNIT', 'MANAGE'))) return forbid(res, 'You may not move it there');
  }
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) if (v !== undefined) data[k] = v;
  const updated = await prisma.orgUnit.update({ where: { id }, data });
  await audit(me, unit.systemId, 'ORG_UNIT_UPDATE', `${id}: ${Object.keys(data).join(',')}`);
  res.json({ orgUnit: updated });
});

/* ───────────── memberships ───────────── */

const memberSchema = z.object({
  id: ID.optional(),
  personId: z.string().min(1),
  type: z.string().min(1).max(40),
  label: z.string().max(200).optional(),
  orgUnitId: z.string().nullable().optional(),
  systemId: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'ENDED', 'SUSPENDED']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
});

participationRouter.post('/memberships', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = memberSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const d = parsed.data;
  const me = req.auth!.personId;
  if (!(await can(me, d.systemId, 'MEMBERSHIP', 'MANAGE'))) return forbid(res, 'You may not add members here');
  if (!(await prisma.person.findUnique({ where: { id: d.personId } }))) return res.status(404).json({ error: 'Person not found' });
  const id = d.id ?? `mem-${crypto.randomUUID().slice(0, 8)}`;
  if (await prisma.membership.findUnique({ where: { id } })) return res.status(409).json({ error: 'Already exists' });
  const m = await prisma.membership.create({
    data: {
      id, personId: d.personId, type: d.type, label: d.label ?? d.type,
      orgUnitId: d.orgUnitId ?? null, systemId: d.systemId ?? null,
      status: d.status ?? 'ACTIVE',
      startDate: d.startDate ? new Date(d.startDate) : new Date(),
    },
  });
  await audit(me, d.systemId, 'MEMBERSHIP_CREATE', `${id} ${d.personId} ${d.type}`);
  res.status(201).json({ membership: m });
});

participationRouter.patch('/memberships/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = pathParam(req, 'id')!;
  const parsed = memberSchema.partial().omit({ id: true, personId: true }).safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const m = await prisma.membership.findUnique({ where: { id } });
  if (!m) return res.status(404).json({ error: 'Not found' });
  const me = req.auth!.personId;
  if (!(await can(me, m.systemId, 'MEMBERSHIP', 'MANAGE'))) return forbid(res, 'You may not change this membership');
  if (parsed.data.systemId !== undefined && parsed.data.systemId !== m.systemId) {
    if (!(await can(me, parsed.data.systemId, 'MEMBERSHIP', 'MANAGE'))) return forbid(res, 'You may not move it there');
  }
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    data[k] = k === 'startDate' || k === 'endDate' ? (v ? new Date(v as string) : null) : v;
  }
  const updated = await prisma.membership.update({ where: { id }, data });
  await audit(me, m.systemId, 'MEMBERSHIP_UPDATE', `${id}: ${Object.keys(data).join(',')}`);
  res.json({ membership: updated });
});

/* ───────────── positions ───────────── */

const positionSchema = z.object({
  id: ID.optional(),
  personId: z.string().min(1),
  title: z.string().min(1).max(200),
  orgUnitId: z.string().nullable().optional(),
  systemId: z.string().nullable().optional(),
  systemRole: z.string().nullable().optional(),
  ministryOffice: z.string().nullable().optional(),
  choirOffice: z.string().nullable().optional(),
  choirAdvisorRole: z.string().nullable().optional(),
  worshipOffice: z.string().nullable().optional(),
  protocolOffice: z.string().nullable().optional(),
  deaconOffice: z.string().nullable().optional(),
  systemAdmin: z.boolean().optional(),
  grantsAllSystems: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'ENDED', 'SUSPENDED']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
});

/** Fields that confer church-wide authority: only someone who manages positions in the main church may set them. */
const GOVERNANCE_FIELDS = ['systemRole', 'grantsAllSystems', 'systemAdmin'] as const;
const sets = (data: Record<string, unknown>, k: string) => data[k] !== undefined && data[k] !== null && data[k] !== false;

participationRouter.post('/positions', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = positionSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const d = parsed.data;
  const me = req.auth!.personId;
  if (!(await can(me, d.systemId, 'POSITION', 'MANAGE'))) return forbid(res, 'You may not appoint here');
  if (GOVERNANCE_FIELDS.some((k) => sets(d, k)) && !(await can(me, MAIN, 'POSITION', 'MANAGE'))) {
    return forbid(res, 'Only the church leadership can grant church-wide authority');
  }
  if (!(await prisma.person.findUnique({ where: { id: d.personId } }))) return res.status(404).json({ error: 'Person not found' });
  const id = d.id ?? `pos-${crypto.randomUUID().slice(0, 8)}`;
  if (await prisma.position.findUnique({ where: { id } })) return res.status(409).json({ error: 'Already exists' });
  const p = await prisma.position.create({
    data: {
      id, personId: d.personId, title: d.title,
      orgUnitId: d.orgUnitId ?? null, systemId: d.systemId ?? null,
      systemRole: d.systemRole ?? null, ministryOffice: d.ministryOffice ?? null,
      choirOffice: d.choirOffice ?? null, choirAdvisorRole: d.choirAdvisorRole ?? null,
      worshipOffice: d.worshipOffice ?? null, protocolOffice: d.protocolOffice ?? null,
      deaconOffice: d.deaconOffice ?? null,
      systemAdmin: d.systemAdmin ?? false, grantsAllSystems: d.grantsAllSystems ?? false,
      status: d.status ?? 'ACTIVE',
      startDate: d.startDate ? new Date(d.startDate) : new Date(),
    },
  });
  await audit(me, d.systemId, 'POSITION_CREATE', `${id} ${d.personId} ${d.title}`);
  res.status(201).json({ position: p });
});

participationRouter.patch('/positions/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = pathParam(req, 'id')!;
  const parsed = positionSchema.partial().omit({ id: true, personId: true }).safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const p = await prisma.position.findUnique({ where: { id } });
  if (!p) return res.status(404).json({ error: 'Not found' });
  const me = req.auth!.personId;
  if (!(await can(me, p.systemId, 'POSITION', 'MANAGE'))) return forbid(res, 'You may not change this position');
  const d = parsed.data;
  if (d.systemId !== undefined && d.systemId !== p.systemId && !(await can(me, d.systemId, 'POSITION', 'MANAGE'))) {
    return forbid(res, 'You may not move it there');
  }
  // Changing or removing church-wide authority needs the same power as granting it.
  const touchesGovernance =
    GOVERNANCE_FIELDS.some((k) => sets(d as Record<string, unknown>, k)) ||
    ((p.systemRole || p.grantsAllSystems || p.systemAdmin) && (d.status !== undefined || GOVERNANCE_FIELDS.some((k) => (d as Record<string, unknown>)[k] !== undefined)));
  if (touchesGovernance && !(await can(me, MAIN, 'POSITION', 'MANAGE'))) {
    return forbid(res, 'Only the church leadership can change church-wide authority');
  }
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined) continue;
    data[k] = k === 'startDate' || k === 'endDate' ? (v ? new Date(v as string) : null) : v;
  }
  const updated = await prisma.position.update({ where: { id }, data });
  await audit(me, p.systemId, 'POSITION_UPDATE', `${id}: ${Object.keys(data).join(',')}`);
  res.json({ position: updated });
});
