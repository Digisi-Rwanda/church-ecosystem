/**
 * Access by letters (slice 1.3): appointments, vacancies, delegation, the audit trail
 * and the access explainer. Every answer comes from the letters engine, so what the
 * screens show is what the server enforces.
 *
 * Who may do what here:
 *  - offices are voted in real life, so the system has no election flow: Administrators
 *    (in Media) assign every office to an existing person, the Church Leader's seat included,
 *    and reassign it when it changes hands. An Administrator never ends their own office,
 *    and the church keeps at least two Administrators;
 *  - the Church Leader and the rest only read the roster;
 *  - the Leader, Administrators and the Church Secretary read the audit trail.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { mayReadPeople } from '../lib/peopleScope.js';
import { loadSettings } from '../settings/store.js';
import { requireAuth, pathParam, type AuthedRequest } from '../middleware/http.js';
import {
  explainSystem,
  isLive,
  liveHoldings,
  lettersInSystem,
  reachableSystems,
  type AccessData,
  type DelegationRec,
  type Holding,
  type MembershipRec,
  type PositionRec,
} from '../capabilities/engine.js';
import {
  MEMBER_LETTERS,
  MIN_ADMINISTRATORS,
  MODULE_KEYS,
  OFFICES_BY_KIND,
  OFFICE_LETTERS,
  OFFICE_SCOPE,
  OFFICE_TITLE,
  REQUIRED_OFFICES,
  SOLE_OFFICES,
} from '../shared/accessMatrix.js';
import {
  ACCESS_LETTERS,
  ACCESS_LETTER_MEANING,
  MODULE_LETTERS,
  OFFICE_CODES,
  type AccessLetter,
  type ModuleKey,
  type OfficeCode,
} from '../shared/vocabulary.js';
import { legacyColumnsFor, officeOf, unitKindOf } from '../lib/offices.js';
import { notifySafely } from '../lib/notify.js';
import {
  computeVacancies,
  countLiveAdministrators,
  findClash,
  officeFitsUnit,
  type UnitRec,
} from '../lib/appointments.js';

export const accessRouter = Router();

const MAIN = 'sys-main';
const DAY = 24 * 3600 * 1000;
const bad = (res: any, parsed: any) => res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
const fail = (res: any, status: number, code: string, error: string, extra: object = {}) =>
  res.status(status).json({ error, code, ...extra });
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : typeof d === 'string' ? d : null);
const day = (d: unknown) => iso(d)?.slice(0, 10) ?? null;

/* ───────────── loading ───────────── */

async function load(): Promise<{ data: AccessData; units: UnitRec[] }> {
  const [positions, memberships, delegations, units] = await Promise.all([
    prisma.position.findMany(),
    prisma.membership.findMany(),
    prisma.delegation.findMany(),
    prisma.orgUnit.findMany(),
  ]);
  const unitSystem: Record<string, string | null> = {};
  for (const u of units as UnitRec[]) unitSystem[u.id] = u.systemId ?? null;
  return {
    data: {
      positions: positions as PositionRec[],
      memberships: memberships as MembershipRec[],
      delegations: delegations as DelegationRec[],
      unitSystem,
    },
    units: units as UnitRec[],
  };
}

async function names(ids: string[]): Promise<Map<string, { name: string; code: string | null }>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, { name: string; code: string | null }>();
  if (!uniq.length) return out;
  const rows = await prisma.person.findMany({ where: { id: { in: uniq } } });
  for (const p of rows as Array<{ id: string; fullName: string; memberCode?: string | null }>) {
    out.set(p.id, { name: p.fullName, code: p.memberCode ?? null });
  }
  return out;
}

const own = (hs: Holding[], office: OfficeCode) => hs.some((h) => h.via === 'OFFICE' && h.office === office);

/** What the signed-in person may do on this page, from their own live offices. */
function powers(hs: Holding[]) {
  const admin = own(hs, 'ADMINISTRATOR');
  return {
    // Offices are voted in real life; the system only records who holds them.
    // Administrators assign every office (the Church Leader's too) and reassign it when it changes hands.
    canAppoint: admin,
    canAppointLeader: admin,
    canReadAppointments: admin || hs.some((h) => (h.letters.PEOPLE?.length ?? 0) > 0),
    // The Access page, the rule matrix and the audit trail are Administrator-only, here as on screen.
    canReadAudit: admin,
    canExplainOthers: admin,
    canSeeAllDelegations: admin,
    canReadMatrix: admin,
  };
}

async function audit(
  actorId: string,
  systemId: string | null | undefined,
  action: string,
  detail: string,
  meta: object,
) {
  await prisma.auditEvent.create({
    data: {
      at: new Date(),
      actorId,
      systemId: systemId ?? MAIN,
      action,
      resource: 'OFFICE',
      detail,
      metaJson: JSON.stringify(meta),
    },
  });
}

const titleOf = (o: OfficeCode) => OFFICE_TITLE[o];

/* ───────────── the rule matrix ───────────── */

accessRouter.get('/matrix', requireAuth, async (req: AuthedRequest, res) => {
  const { data } = await load();
  if (!powers(liveHoldings(req.auth!.personId, data, new Date())).canReadMatrix) {
    return fail(res, 403, 'NOT_ALLOWED', 'Only Administrators read the rule matrix');
  }
  res.json({
    letters: ACCESS_LETTERS.map((l) => ({ letter: l, ...ACCESS_LETTER_MEANING[l] })),
    modules: MODULE_KEYS.map((k) => ({ key: k, letters: MODULE_LETTERS[k] })),
    offices: OFFICE_CODES.map((o) => ({
      code: o,
      title: OFFICE_TITLE[o],
      scope: OFFICE_SCOPE[o],
      sole: (SOLE_OFFICES as readonly string[]).includes(o),
      letters: OFFICE_LETTERS[o],
    })),
    member: MEMBER_LETTERS,
    required: REQUIRED_OFFICES,
    placement: OFFICES_BY_KIND,
    limits: { minAdministrators: MIN_ADMINISTRATORS, delegationMaxDays: (await loadSettings())['access.delegationMaxDays'] },
    rules: [
      'W, V, A, S, P and C each include R.',
      'Nobody approves their own entry or request.',
      'A letter exists only while the office that carries it is live, so ending an office removes its letters at once.',
      'A delegation lends only letters the lender holds, never for longer than the lender’s term, and ends with it.',
    ],
  });
});

/* ───────────── explaining one person's access ───────────── */

async function explainPerson(personId: string) {
  const now = new Date();
  const { data } = await load();
  const holdings = liveHoldings(personId, data, now);
  const systems = await prisma.churchSystem.findMany({ orderBy: { code: 'asc' } });
  const rows = [];
  for (const s of systems as Array<{ id: string; name?: string | null; shortName?: string | null; kind?: string | null }>) {
    if ((s.kind ?? 'MINISTRY') === 'SHARED') continue;
    const modules = explainSystem(personId, s.id, data, titleOf, now);
    if (!MODULE_KEYS.some((k) => modules[k].length)) continue;
    rows.push({
      id: s.id,
      name: s.shortName ?? s.name ?? s.id,
      letters: lettersInSystem(personId, s.id, data, now, holdings),
      why: modules,
    });
  }
  const live = data.positions.filter((p) => p.personId === personId && isLive(p, now));
  const people = await names([personId]);
  return {
    person: { id: personId, name: people.get(personId)?.name ?? personId, code: people.get(personId)?.code ?? null },
    offices: live
      .map((p) => ({ id: p.id, office: officeOf(p), title: p.title ?? '', systemId: p.systemId ?? null, orgUnitId: p.orgUnitId ?? null, endDate: day(p.endDate) }))
      .filter((o) => o.office),
    delegated: holdings
      .filter((h) => h.via === 'DELEGATION')
      .map((h) => ({ delegationId: h.delegationId!, office: h.office, fromPersonId: h.fromPersonId! })),
    systems: rows,
  };
}

accessRouter.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const { data } = await load();
  res.json({ ...(await explainPerson(me)), powers: powers(liveHoldings(me, data)) });
});

accessRouter.get('/explain/:personId', requireAuth, async (req: AuthedRequest, res) => {
  const target = pathParam(req, 'personId')!;
  const me = req.auth!.personId;
  if (target !== me) {
    const { data } = await load();
    if (!powers(liveHoldings(me, data)).canExplainOthers) {
      return fail(res, 403, 'NOT_ALLOWED', 'Only Administrators can see another person’s access');
    }
  }
  if (!(await prisma.person.findUnique({ where: { id: target } }))) return fail(res, 404, 'NOT_FOUND', 'Person not found');
  res.json(await explainPerson(target));
});

/* ───────────── appointments ───────────── */

function appointmentRow(
  p: PositionRec & { title?: string },
  unit: UnitRec | undefined,
  who: Map<string, { name: string; code: string | null }>,
  now: Date,
) {
  const end = p.endDate ? new Date(p.endDate as string | Date).getTime() : null;
  return {
    id: p.id,
    personId: p.personId,
    personName: who.get(p.personId)?.name ?? p.personId,
    memberCode: who.get(p.personId)?.code ?? null,
    office: officeOf(p),
    title: p.title ?? '',
    orgUnitId: p.orgUnitId ?? null,
    unitName: unit?.name ?? null,
    unitCode: unit?.code ?? null,
    systemId: p.systemId ?? unit?.systemId ?? null,
    startDate: day(p.startDate),
    endDate: day(p.endDate),
    status: p.status,
    live: isLive(p, now),
    endsSoon: end !== null && isLive(p, now) && end - now.getTime() <= 60 * DAY,
  };
}

accessRouter.get('/appointments', requireAuth, async (req: AuthedRequest, res) => {
  const now = new Date();
  const { data, units } = await load();
  const pw = powers(liveHoldings(req.auth!.personId, data, now));
  if (!pw.canReadAppointments) return fail(res, 403, 'NOT_ALLOWED', 'You may not see appointments');
  const unitId = typeof req.query.unitId === 'string' ? req.query.unitId : undefined;
  const includeEnded = req.query.ended === 'true';
  const byId = new Map(units.map((u) => [u.id, u]));
  /** The unit a position belongs to: its own, else the main unit of its system. */
  const unitFor = (p: PositionRec): UnitRec | undefined => {
    if (p.orgUnitId) return byId.get(p.orgUnitId);
    if (!p.systemId) return undefined;
    const inSystem = units.filter((u) => u.systemId === p.systemId);
    return inSystem.find((u) => !u.parentId) ?? inSystem.find((u) => unitKindOf(u) !== 'TEAM') ?? inSystem[0];
  };
  // Firm walls: an Administrator or the Church Leader see every appointment; anyone else only their own systems'.
  const reach = pw.canAppoint ? null : reachableSystems(req.auth!.personId, data, now);
  const sysOfPos = (p: PositionRec) => p.systemId ?? (p.orgUnitId ? byId.get(p.orgUnitId)?.systemId : null) ?? 'sys-main';
  // Leaders of one system: its own offices only. Central names every leader of the church.
  const named = typeof req.query.systemId === 'string' ? req.query.systemId : '';
  if (named && !pw.canAppoint && !mayReadPeople(req.auth!.personId, named, data, now)) return fail(res, 403, 'NOT_ALLOWED', 'You may not see the leaders of this system');
  const rows = data.positions.filter(
    (p) =>
      officeOf(p) && (includeEnded || isLive(p, now)) && (!unitId || unitFor(p)?.id === unitId) && (reach === null || reach.has(sysOfPos(p))) &&
      (!named || named === 'sys-main' || sysOfPos(p) === named),
  );
  const who = await names(rows.map((r) => r.personId));
  res.json({
    ...pw,
    appointments: rows
      .map((p) => appointmentRow(p, unitFor(p), who, now))
      .sort((a, b) => `${a.unitName ?? ''}${a.office}`.localeCompare(`${b.unitName ?? ''}${b.office}`)),
  });
});

const appointSchema = z.object({
  personId: z.string().min(1),
  orgUnitId: z.string().min(1),
  office: z.enum(OFFICE_CODES),
  title: z.string().min(1).max(200).optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
});

accessRouter.post('/appointments', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = appointSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const d = parsed.data;
  const me = req.auth!.personId;
  const now = new Date();
  const { data, units } = await load();
  const pw = powers(liveHoldings(me, data, now));
  if (!pw.canAppoint) return fail(res, 403, 'NOT_ALLOWED', 'Only an Administrator assigns offices');
  const unit = units.find((u) => u.id === d.orgUnitId);
  if (!unit) return fail(res, 404, 'UNIT_NOT_FOUND', 'Unit not found');
  const person = (await prisma.person.findUnique({ where: { id: d.personId } })) as
    | { id: string; fullName: string; status: string; archivedAt?: Date | null }
    | null;
  if (!person) return fail(res, 404, 'PERSON_NOT_FOUND', 'Person not found');
  if (person.archivedAt || person.status !== 'ACTIVE') {
    return fail(res, 409, 'PERSON_NOT_ACTIVE', 'Only an active person can hold an office');
  }
  if (!officeFitsUnit(d.office, unit)) {
    return fail(res, 400, 'OFFICE_NOT_IN_UNIT', `${OFFICE_TITLE[d.office]} cannot be held in ${unit.name}`);
  }
  const start = d.startDate ? new Date(d.startDate) : now;
  const end = d.endDate ? new Date(d.endDate) : null;
  if (Number.isNaN(start.getTime()) || (end && (Number.isNaN(end.getTime()) || end <= start))) {
    return fail(res, 400, 'BAD_DATES', 'The term must end after it starts');
  }
  const systemId = unit.systemId ?? (unitKindOf(unit) === 'CENTRAL' ? MAIN : null);
  const clash = findClash(data.positions, { personId: d.personId, office: d.office, orgUnitId: unit.id, systemId }, now);
  if (clash) {
    if (clash.code === 'OFFICE_TAKEN') {
      const who = await names([clash.holder.personId]);
      return fail(res, 409, 'OFFICE_TAKEN', `${OFFICE_TITLE[d.office]} is already held by ${who.get(clash.holder.personId)?.name ?? 'someone'}. End that appointment first.`, { positionId: clash.holder.id });
    }
    if (clash.code === 'ALREADY_HOLDS') return fail(res, 409, 'ALREADY_HOLDS', 'This person already holds this office here', { positionId: clash.holder.id });
    return fail(res, 409, 'SEPARATION_OF_DUTIES', 'The President and the Treasurer of one unit cannot be the same person', { positionId: clash.other.id });
  }
  const id = `pos-${crypto.randomUUID().slice(0, 8)}`;
  const legacy = legacyColumnsFor(d.office) as Record<string, string | undefined>;
  const created = await prisma.position.create({
    data: {
      id,
      personId: d.personId,
      orgUnitId: unit.id,
      systemId,
      title: d.title ?? (OFFICE_SCOPE[d.office] === 'CHURCH' ? OFFICE_TITLE[d.office] : `${OFFICE_TITLE[d.office]}, ${unit.name}`),
      office: d.office,
      systemRole: legacy.systemRole ?? null,
      ministryOffice: legacy.ministryOffice ?? null,
      systemAdmin: d.office === 'ADMINISTRATOR',
      grantsAllSystems: d.office === 'CHURCH_LEADER',
      status: 'ACTIVE',
      startDate: start,
      endDate: end,
    },
  });
  await audit(me, systemId, 'APPOINTED', `${person.fullName} as ${OFFICE_TITLE[d.office]} in ${unit.name}`, {
    positionId: id,
    personId: d.personId,
    office: d.office,
    orgUnitId: unit.id,
    startDate: start.toISOString().slice(0, 10),
    endDate: end ? end.toISOString().slice(0, 10) : null,
  });
  await notifySafely(prisma as never, {
    kind: 'FOR_INFORMATION',
    toPersonId: d.personId,
    systemId,
    title: `You are now ${OFFICE_TITLE[d.office]}${OFFICE_SCOPE[d.office] === 'CHURCH' ? '' : ` of ${unit.name}`}`,
    body: 'Your access has changed. See Access to find out what you can do.',
    href: `/s/${MAIN}/people/access`,
    sourceKey: `appointed:${id}`,
    important: true,
  });
  res.status(201).json({ appointment: { ...created, office: d.office } });
});

const endSchema = z.object({ reason: z.string().trim().min(3).max(500) });

accessRouter.post('/appointments/:id/end', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = endSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const id = pathParam(req, 'id')!;
  const me = req.auth!.personId;
  const now = new Date();
  const { data } = await load();
  const pos = data.positions.find((p) => p.id === id);
  const office = pos ? officeOf(pos) : null;
  if (!pos || !office) return fail(res, 404, 'NOT_FOUND', 'Appointment not found');
  if (pos.status !== 'ACTIVE' || !isLive(pos, now)) return fail(res, 409, 'ALREADY_ENDED', 'This appointment has already ended');
  const pw = powers(liveHoldings(me, data, now));
  if (!pw.canAppoint) return fail(res, 403, 'NOT_ALLOWED', 'Only an Administrator ends appointments');
  if (pos.personId === me) return fail(res, 403, 'CANNOT_END_OWN_OFFICE', 'You cannot end your own appointment');
  if (office === 'ADMINISTRATOR' && countLiveAdministrators(data.positions, now, id) < MIN_ADMINISTRATORS) {
    return fail(res, 409, 'NEEDS_TWO_ADMINISTRATORS', `The church keeps at least ${MIN_ADMINISTRATORS} Administrators. Appoint another first.`);
  }
  await prisma.position.update({ where: { id }, data: { status: 'ENDED', endDate: now } });
  const lent = await prisma.delegation.updateMany({
    where: { positionId: id, status: 'ACTIVE' },
    data: { status: 'REVOKED', revokedAt: now, revokedById: me },
  });
  const who = await names([pos.personId]);
  await audit(me, pos.systemId, 'OFFICE_ENDED', `${who.get(pos.personId)?.name ?? pos.personId} no longer ${OFFICE_TITLE[office]}`, {
    positionId: id,
    personId: pos.personId,
    office,
    reason: parsed.data.reason,
    delegationsRevoked: lent.count,
  });
  await notifySafely(prisma as never, {
    kind: 'FOR_INFORMATION',
    toPersonId: pos.personId,
    systemId: pos.systemId,
    title: `You are no longer ${OFFICE_TITLE[office]}`,
    body: 'The access that came with the office has ended.',
    href: `/s/${MAIN}/people/access`,
    sourceKey: `ended:${id}`,
    important: true,
  });
  res.json({ ended: true, delegationsRevoked: lent.count });
});

const termSchema = z.object({ endDate: z.string().nullable() });

accessRouter.post('/appointments/:id/term', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = termSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const id = pathParam(req, 'id')!;
  const me = req.auth!.personId;
  const now = new Date();
  const { data } = await load();
  const pos = data.positions.find((p) => p.id === id);
  const office = pos ? officeOf(pos) : null;
  if (!pos || !office) return fail(res, 404, 'NOT_FOUND', 'Appointment not found');
  if (!isLive(pos, now)) return fail(res, 409, 'ALREADY_ENDED', 'This appointment has already ended');
  const pw = powers(liveHoldings(me, data, now));
  if (!pw.canAppoint) return fail(res, 403, 'NOT_ALLOWED', 'Only an Administrator sets terms');
  const end = parsed.data.endDate ? new Date(parsed.data.endDate) : null;
  if (end && (Number.isNaN(end.getTime()) || end <= now)) return fail(res, 400, 'BAD_DATES', 'A term must end in the future; to end it now, end the appointment');
  await prisma.position.update({ where: { id }, data: { endDate: end } });
  await audit(me, pos.systemId, 'TERM_CHANGED', `${OFFICE_TITLE[office]} term now ${end ? `ends ${end.toISOString().slice(0, 10)}` : 'open-ended'}`, {
    positionId: id,
    office,
    endDate: end ? end.toISOString().slice(0, 10) : null,
  });
  res.json({ endDate: end ? end.toISOString().slice(0, 10) : null });
});

/* ───────────── vacancies ───────────── */

accessRouter.get('/vacancies', requireAuth, async (req: AuthedRequest, res) => {
  const now = new Date();
  const { data, units } = await load();
  const pw = powers(liveHoldings(req.auth!.personId, data, now));
  if (!pw.canReadAppointments) return fail(res, 403, 'NOT_ALLOWED', 'You may not see vacancies');
  const all = computeVacancies(units, data.positions, now, (await loadSettings())['access.termReminderDays']);
  const reach = pw.canAppoint ? null : reachableSystems(req.auth!.personId, data, now);
  const unitSys = (id: string) => units.find((u) => u.id === id)?.systemId ?? 'sys-main';
  const named = typeof req.query.systemId === 'string' ? req.query.systemId : '';
  const mine = (s: string) => (reach === null || reach.has(s)) && (!named || named === 'sys-main' || s === named);
  const vacancies = all.vacancies.filter((v) => mine(unitSys(v.unitId)));
  const conflicts = all.conflicts.filter((c) => mine(unitSys(c.unitId)));
  const who = await names(vacancies.map((v) => v.holderPersonId ?? ''));
  res.json({
    vacancies: vacancies.map((v) => ({ ...v, holderName: v.holderPersonId ? (who.get(v.holderPersonId)?.name ?? null) : null })),
    conflicts,
    administrators: { count: countLiveAdministrators(data.positions, now), minimum: MIN_ADMINISTRATORS },
  });
});

/* ───────────── delegation ───────────── */

const delegateSchema = z.object({
  positionId: z.string().min(1),
  toPersonId: z.string().min(1),
  letters: z.record(z.string(), z.array(z.enum(ACCESS_LETTERS))),
  startDate: z.string().optional(),
  endDate: z.string().min(1),
  note: z.string().max(300).optional(),
});

function delegationRow(d: DelegationRec & { note?: string | null }, who: Map<string, { name: string; code: string | null }>, now: Date) {
  let letters: unknown = {};
  try {
    letters = JSON.parse(d.lettersJson);
  } catch {
    /* an unreadable record lends nothing */
  }
  return {
    id: d.id,
    positionId: d.positionId,
    fromPersonId: d.fromPersonId,
    fromName: who.get(d.fromPersonId)?.name ?? d.fromPersonId,
    toPersonId: d.toPersonId,
    toName: who.get(d.toPersonId)?.name ?? d.toPersonId,
    letters,
    note: d.note ?? null,
    startDate: day(d.startDate),
    endDate: day(d.endDate),
    status: d.status,
    live: isLive(d, now),
  };
}

accessRouter.get('/delegations', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const now = new Date();
  const { data } = await load();
  const pw = powers(liveHoldings(me, data, now));
  const all = req.query.all === 'true' && pw.canSeeAllDelegations;
  const rows = (data.delegations as Array<DelegationRec & { note?: string | null }>).filter(
    (d) => all || d.fromPersonId === me || d.toPersonId === me,
  );
  const who = await names(rows.flatMap((r) => [r.fromPersonId, r.toPersonId]));
  const shaped = rows.map((r) => delegationRow(r, who, now));
  res.json({
    canSeeAll: pw.canSeeAllDelegations,
    given: shaped.filter((r) => r.fromPersonId === me),
    received: shaped.filter((r) => r.toPersonId === me),
    ...(all ? { all: shaped } : {}),
    limits: { maxDays: (await loadSettings())['access.delegationMaxDays'] },
  });
});

accessRouter.post('/delegations', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = delegateSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const d = parsed.data;
  const me = req.auth!.personId;
  const now = new Date();
  const { data } = await load();
  const pos = data.positions.find((p) => p.id === d.positionId);
  const office = pos ? officeOf(pos) : null;
  if (!pos || !office || pos.personId !== me || !isLive(pos, now)) {
    return fail(res, 403, 'NOT_YOUR_OFFICE', 'You can lend letters only from an office you hold now');
  }
  if (office === 'ADMINISTRATOR') return fail(res, 403, 'NOT_DELEGABLE', 'Administrators’ duties are personal and cannot be lent');
  if (d.toPersonId === me) return fail(res, 400, 'SELF', 'Choose someone else');
  const to = (await prisma.person.findUnique({ where: { id: d.toPersonId } })) as
    | { id: string; fullName: string; status: string; archivedAt?: Date | null }
    | null;
  if (!to) return fail(res, 404, 'PERSON_NOT_FOUND', 'Person not found');
  if (to.archivedAt || to.status !== 'ACTIVE') return fail(res, 409, 'PERSON_NOT_ACTIVE', 'Only an active person can receive letters');
  const start = d.startDate ? new Date(d.startDate) : now;
  const end = new Date(d.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return fail(res, 400, 'BAD_DATES', 'The delegation must end after it starts');
  }
  const maxDays = (await loadSettings())['access.delegationMaxDays'];
  if (end.getTime() - start.getTime() > maxDays * DAY) {
    return fail(res, 400, 'DELEGATION_TOO_LONG', `A delegation lasts at most ${maxDays} days`);
  }
  if (pos.endDate && end > new Date(pos.endDate as string | Date)) {
    return fail(res, 400, 'PAST_TERM', 'A delegation cannot outlast the term it is lent from');
  }
  const held = OFFICE_LETTERS[office];
  const lend: Record<string, AccessLetter[]> = {};
  const notHeld: string[] = [];
  for (const [module, letters] of Object.entries(d.letters)) {
    if (!(MODULE_KEYS as readonly string[]).includes(module)) {
      notHeld.push(module);
      continue;
    }
    const have = held[module as ModuleKey] ?? [];
    for (const l of letters) if (!have.includes(l)) notHeld.push(`${module}:${l}`);
    const keep = letters.filter((l) => have.includes(l));
    if (keep.length) lend[module] = [...new Set<AccessLetter>([...keep, 'R'])];
  }
  if (notHeld.length) return fail(res, 400, 'LETTERS_NOT_HELD', `Your office does not carry: ${notHeld.join(', ')}`, { notHeld });
  if (!Object.keys(lend).length) return fail(res, 400, 'NO_LETTERS', 'Choose at least one letter to lend');
  const created = await prisma.delegation.create({
    data: {
      positionId: pos.id,
      fromPersonId: me,
      toPersonId: d.toPersonId,
      lettersJson: JSON.stringify(lend),
      note: d.note ?? null,
      status: 'ACTIVE',
      startDate: start,
      endDate: end,
    },
  });
  await audit(me, pos.systemId, 'DELEGATED', `${OFFICE_TITLE[office]} lends letters to ${to.fullName}`, {
    delegationId: created.id,
    positionId: pos.id,
    toPersonId: d.toPersonId,
    letters: lend,
    endDate: end.toISOString().slice(0, 10),
  });
  await notifySafely(prisma as never, {
    kind: 'FOR_INFORMATION',
    toPersonId: d.toPersonId,
    systemId: pos.systemId,
    title: `${OFFICE_TITLE[office]} has lent you some letters`,
    body: `Until ${day(end)}. See Access for which ones.`,
    href: `/s/${MAIN}/people/access`,
    sourceKey: `delegated:${created.id}`,
    important: true,
  });
  res.status(201).json({ delegation: { id: created.id, letters: lend, endDate: day(end) } });
});

accessRouter.post('/delegations/:id/revoke', requireAuth, async (req: AuthedRequest, res) => {
  const id = pathParam(req, 'id')!;
  const me = req.auth!.personId;
  const now = new Date();
  const { data } = await load();
  const del = data.delegations.find((x) => x.id === id);
  if (!del) return fail(res, 404, 'NOT_FOUND', 'Delegation not found');
  if (del.status !== 'ACTIVE') return fail(res, 409, 'ALREADY_REVOKED', 'This delegation has already ended');
  const pw = powers(liveHoldings(me, data, now));
  if (del.fromPersonId !== me && !pw.canAppoint) return fail(res, 403, 'NOT_ALLOWED', 'Only the lender or an Administrator can take letters back');
  await prisma.delegation.update({ where: { id }, data: { status: 'REVOKED', revokedAt: now, revokedById: me } });
  await audit(me, null, 'DELEGATION_REVOKED', `Delegation ${id} taken back`, { delegationId: id, positionId: del.positionId });
  await notifySafely(prisma as never, {
    kind: 'FOR_INFORMATION',
    toPersonId: del.toPersonId,
    title: 'Letters lent to you have been taken back',
    href: `/s/${MAIN}/people/access`,
    sourceKey: `revoked:${id}`,
    important: true,
  });
  res.json({ revoked: true });
});

/* ───────────── audit ───────────── */

const AUDITED = ['APPOINTED', 'OFFICE_ENDED', 'TERM_CHANGED', 'DELEGATED', 'DELEGATION_REVOKED', 'POSITION_CREATE', 'POSITION_UPDATE'];

accessRouter.get('/audit', requireAuth, async (req: AuthedRequest, res) => {
  const now = new Date();
  const { data } = await load();
  if (!powers(liveHoldings(req.auth!.personId, data, now)).canReadAudit) {
    return fail(res, 403, 'NOT_ALLOWED', 'Only Administrators read the audit trail');
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const rows = (await prisma.auditEvent.findMany({ where: { action: { in: AUDITED } }, orderBy: { at: 'desc' }, take: 500 })) as Array<{
    id: string;
    at: Date;
    actorId?: string | null;
    action: string;
    detail?: string | null;
    metaJson?: string | null;
  }>;
  rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const page = rows.slice(0, limit);
  const who = await names(page.map((r) => r.actorId ?? ''));
  res.json({
    events: page.map((r) => {
      let meta: unknown = null;
      try {
        meta = r.metaJson ? JSON.parse(r.metaJson) : null;
      } catch {
        /* keep null */
      }
      return {
        id: r.id,
        at: iso(r.at),
        action: r.action,
        detail: r.detail ?? '',
        actorId: r.actorId ?? null,
        actorName: r.actorId ? (who.get(r.actorId)?.name ?? r.actorId) : null,
        meta,
      };
    }),
  });
});
