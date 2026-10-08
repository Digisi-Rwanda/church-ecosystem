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
import { isValidUnitCode, suggestUnitCode } from '../lib/codes.js';
import { legacyColumnsFor, officeOf, unitKindOf } from '../lib/offices.js';
import { findClash } from '../lib/appointments.js';
import { OFFICE_TITLE } from '../shared/accessMatrix.js';
import { OFFICE_CODES, UNIT_KINDS } from '../shared/vocabulary.js';
import { authorizePerson } from '../policy/index.js';
import { liveHoldings, reachableSystems } from '../capabilities/engine.js';
import { loadAccessData } from '../notifications/feed.js';
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
  const [allUnits, allMemberships, allPositions] = await Promise.all([
    prisma.orgUnit.findMany({ orderBy: { name: 'asc' } }),
    prisma.membership.findMany({ orderBy: { startDate: 'desc' } }),
    prisma.position.findMany({ orderBy: { startDate: 'desc' } }),
  ]);
  // Firm walls: a system sees only itself (and Central). The Church Leader reaches every system;
  // an Administrator also sees the structure of offices (not who belongs where) so they can appoint.
  const { data: accessData } = await loadAccessData(me);
  const now = new Date();
  const reach = reachableSystems(me, accessData, now);
  const isAdmin = liveHoldings(me, accessData, now).some((h) => h.via === 'OFFICE' && h.office === 'ADMINISTRATOR');
  const unitSys = new Map(allUnits.map((u) => [u.id, u.systemId ?? null]));
  const inReach = (sys: string | null | undefined, unitId?: string | null) => {
    if (reach === null) return true;
    const s = sys ?? (unitId ? unitSys.get(unitId) : null) ?? MAIN;
    return reach.has(s);
  };
  const orgUnits = allUnits.filter((u) => isAdmin || inReach(u.systemId, u.id));
  const memberships = allMemberships.filter((m) => m.personId === me || inReach(m.systemId, m.orgUnitId));
  const positions = allPositions.filter((p) => p.personId === me || isAdmin || inReach(p.systemId, p.orgUnitId));
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
      code: nn(u.code),
      kind: unitKindOf(u),
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
      office: officeOf(p),
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

/** When an office code is given, also fill the older office columns it stands for, unless they were given. */
function withOldColumns<T extends { office?: string | null }>(d: T): T {
  if (!d.office) return d;
  const legacy = legacyColumnsFor(d.office as (typeof OFFICE_CODES)[number]) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...d };
  for (const [k, v] of Object.entries(legacy)) if (out[k] === undefined || out[k] === null) out[k] = v;
  return out as T;
}

/** An active appointment as Church Leader held by someone else (null when the office is vacant). */
async function otherActiveChurchLeader(exceptPositionId?: string): Promise<{ id: string } | null> {
  const rows = await prisma.position.findMany({ where: { systemRole: 'CHURCH_LEADER', status: 'ACTIVE' } });
  const now = Date.now();
  const hit = rows.find((r: { id: string; endDate?: Date | null }) => r.id !== exceptPositionId && (!r.endDate || r.endDate.getTime() > now));
  return hit ? { id: hit.id } : null;
}

/** The rule every appointment obeys (slice 1.3): one live holder of a sole office per place, and no President who is also Treasurer. */
async function officeClashFor(
  d: { personId: string; office?: string | null; systemRole?: string | null; ministryOffice?: string | null; choirOffice?: string | null; worshipOffice?: string | null; protocolOffice?: string | null; deaconOffice?: string | null; systemAdmin?: boolean | null; orgUnitId?: string | null; systemId?: string | null; status?: string },
  exceptId?: string,
) {
  const office = officeOf(d);
  if (!office || (d.status ?? 'ACTIVE') !== 'ACTIVE') return null;
  const rows = await prisma.position.findMany();
  const clash = findClash(rows as never, { personId: d.personId, office, orgUnitId: d.orgUnitId, systemId: d.systemId, exceptId });
  if (!clash) return null;
  if (clash.code === 'SEPARATION_OF_DUTIES') {
    return { error: 'The President and the Treasurer of one unit cannot be the same person', code: clash.code, positionId: clash.other.id };
  }
  if (clash.code === 'ALREADY_HOLDS') {
    return { error: `This person already holds ${OFFICE_TITLE[office]} here`, code: clash.code, positionId: clash.holder.id };
  }
  return { error: `${OFFICE_TITLE[office]} is already held by someone else here. End that appointment first.`, code: clash.code, positionId: clash.holder.id };
}

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
  /** Set once (or left out and suggested from the name); never changes afterwards. */
  code: z.string().optional(),
  kind: z.enum(UNIT_KINDS).optional(),
});

participationRouter.post('/org-units', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = orgSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const d = parsed.data;
  if (!(await can(req.auth!.personId, d.systemId, 'ORG_UNIT', 'MANAGE'))) return forbid(res, 'You may not create org units here');
  const id = d.id ?? `ou-${crypto.randomUUID().slice(0, 8)}`;
  if (await prisma.orgUnit.findUnique({ where: { id } })) return res.status(409).json({ error: 'Already exists' });
  const existingUnits = await prisma.orgUnit.findMany({});
  const taken = new Set<string>(existingUnits.map((u: { code?: string | null }) => u.code).filter(Boolean) as string[]);
  let code: string;
  if (d.code) {
    code = d.code.trim().toUpperCase();
    if (!isValidUnitCode(code)) return res.status(400).json({ error: 'A unit code looks like KAC-MUS-IJWI', code: 'BAD_UNIT_CODE' });
    if (taken.has(code)) return res.status(409).json({ error: 'This unit code is already used', code: 'DUPLICATE_UNIT_CODE' });
  } else {
    const parent = d.parentId ? existingUnits.find((u: { id: string }) => u.id === d.parentId) : undefined;
    code = suggestUnitCode(d.name, (parent as { code?: string | null } | undefined)?.code ?? (d.parentId ? undefined : 'KAC'), taken);
  }
  const unit = await prisma.orgUnit.create({
    data: { id, code, kind: d.kind ?? unitKindOf({ type: d.type, parentId: d.parentId }), name: d.name, type: d.type, parentId: d.parentId ?? null, description: d.description ?? null, systemId: d.systemId ?? null, leaderPersonId: d.leaderPersonId ?? null },
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
  if (parsed.data.code !== undefined) {
    const next = parsed.data.code.trim().toUpperCase();
    if (unit.code && next !== unit.code) return res.status(400).json({ error: 'A unit code never changes', code: 'CODE_IS_FIXED' });
    if (!unit.code) {
      if (!isValidUnitCode(next)) return res.status(400).json({ error: 'A unit code looks like KAC-MUS-IJWI', code: 'BAD_UNIT_CODE' });
      if (await prisma.orgUnit.findFirst({ where: { code: next } })) return res.status(409).json({ error: 'This unit code is already used', code: 'DUPLICATE_UNIT_CODE' });
    }
    parsed.data.code = next;
  }
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
  /** Optional: a membership is simply belonging. The older type column is kept for the old app. */
  type: z.string().min(1).max(40).optional(),
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
  if (!d.systemId && !d.orgUnitId) return res.status(400).json({ error: 'A membership needs a system or a unit', code: 'NEEDS_PLACE' });
  const me = req.auth!.personId;
  if (!(await can(me, d.systemId, 'MEMBERSHIP', 'MANAGE'))) return forbid(res, 'You may not add members here');
  if (!(await prisma.person.findUnique({ where: { id: d.personId } }))) return res.status(404).json({ error: 'Person not found' });
  const id = d.id ?? `mem-${crypto.randomUUID().slice(0, 8)}`;
  if (await prisma.membership.findUnique({ where: { id } })) return res.status(409).json({ error: 'Already exists' });
  const m = await prisma.membership.create({
    data: {
      id, personId: d.personId, type: d.type ?? 'MEMBER', label: d.label ?? d.type ?? 'Member',
      orgUnitId: d.orgUnitId ?? null, systemId: d.systemId ?? null,
      status: d.status ?? 'ACTIVE',
      startDate: d.startDate ? new Date(d.startDate) : new Date(),
    },
  });
  await audit(me, d.systemId, 'MEMBERSHIP_CREATE', `${id} ${d.personId} ${d.type ?? 'MEMBER'}`);
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
  /** The one office record. The older office columns are filled in from it for the old app. */
  office: z.enum(OFFICE_CODES).nullable().optional(),
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
  const d = withOldColumns(parsed.data);
  const me = req.auth!.personId;
  if (!(await can(me, d.systemId, 'POSITION', 'MANAGE'))) return forbid(res, 'You may not appoint here');
  if ((GOVERNANCE_FIELDS.some((k) => sets(d, k)) || d.office === 'ADMINISTRATOR') && !(await can(me, MAIN, 'POSITION', 'MANAGE'))) {
    return forbid(res, 'Only the church leadership can grant church-wide authority');
  }
  if (!(await prisma.person.findUnique({ where: { id: d.personId } }))) return res.status(404).json({ error: 'Person not found' });
  const id = d.id ?? `pos-${crypto.randomUUID().slice(0, 8)}`;
  if (await prisma.position.findUnique({ where: { id } })) return res.status(409).json({ error: 'Already exists' });
  if (d.systemRole === 'CHURCH_LEADER' && (d.status ?? 'ACTIVE') === 'ACTIVE') {
    const clash = await otherActiveChurchLeader();
    if (clash) return res.status(409).json({ error: 'There is already an active Church Leader. End that appointment first.', code: 'ONE_CHURCH_LEADER', positionId: clash.id });
  }
  {
    const clash = await officeClashFor({ ...d, personId: d.personId });
    if (clash) return res.status(409).json(clash);
  }
  const p = await prisma.position.create({
    data: {
      id, personId: d.personId, title: d.title, office: d.office ?? officeOf(d),
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
  parsed.data = withOldColumns(parsed.data);
  const me = req.auth!.personId;
  if (!(await can(me, p.systemId, 'POSITION', 'MANAGE'))) return forbid(res, 'You may not change this position');
  const d = parsed.data;
  if (d.systemId !== undefined && d.systemId !== p.systemId && !(await can(me, d.systemId, 'POSITION', 'MANAGE'))) {
    return forbid(res, 'You may not move it there');
  }
  // Changing or removing church-wide authority needs the same power as granting it.
  const touchesGovernance =
    GOVERNANCE_FIELDS.some((k) => sets(d as Record<string, unknown>, k)) ||
    d.office === 'ADMINISTRATOR' ||
    ((p.systemRole || p.grantsAllSystems || p.systemAdmin) && (d.status !== undefined || GOVERNANCE_FIELDS.some((k) => (d as Record<string, unknown>)[k] !== undefined)));
  if (touchesGovernance && !(await can(me, MAIN, 'POSITION', 'MANAGE'))) {
    return forbid(res, 'Only the church leadership can change church-wide authority');
  }
  const becomesLeader = (d.systemRole ?? p.systemRole) === 'CHURCH_LEADER' && (d.status ?? p.status) === 'ACTIVE';
  if (becomesLeader && (d.systemRole !== undefined || d.status !== undefined)) {
    const clash = await otherActiveChurchLeader(id);
    if (clash) return res.status(409).json({ error: 'There is already an active Church Leader. End that appointment first.', code: 'ONE_CHURCH_LEADER', positionId: clash.id });
  }
  if (d.office !== undefined || d.status !== undefined || d.orgUnitId !== undefined || d.systemId !== undefined || GOVERNANCE_FIELDS.some((k) => (d as Record<string, unknown>)[k] !== undefined)) {
    const merged = { ...p, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) } as Parameters<typeof officeClashFor>[0];
    const clash = await officeClashFor(merged, id);
    if (clash) return res.status(409).json(clash);
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
