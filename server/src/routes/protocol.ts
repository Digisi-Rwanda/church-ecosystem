/**
 * Protocol (slice 3.16): the old team engine on the server.
 * Roster, the month's teams built from Music's planned month, review and publish, then the service life:
 * excuses, fill-ins, swaps, attendance with scores, and the service report that Deacon reads.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { notifySafely } from '../lib/notify.js';
import { officeOf } from '../lib/offices.js';
import { getPlanned, loadChoirs } from '../music/store.js';
import { parse } from '../music/schedule.js';
import {
  buildProtocolTeams, canServeKind, musicConflictCode, musicRequirements, scoreAttendanceRow, validateProtocolTeamsDetailed,
} from '../protocol/engine.js';
import type {
  ProtocolIssue, ProtocolRosterMember, ProtocolSchedulingRules, ProtocolService, ProtocolServiceKind, ProtocolTeamSlot,
} from '../protocol/types.js';
import {
  ATTENDANCE, KINDS, OFFICES, PROTOCOL, REASON_MAX, REASON_MIN, ROSTER_STATUS, SERVE_DAYS, TEXT_MAX, canReadPlan, canReadReports, canReadRoster,
  canWriteRoster, hasOffice, isCoordinator, isMonth, mayReview, rulesFor,
} from '../protocol/rules.js';

export const protocolRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const iso = (v: Date | string | null | undefined) => (v ? (v instanceof Date ? v : new Date(v)).toISOString() : null);
const today = () => new Date().toISOString().slice(0, 10);
const OVERRIDABLE = new Set(['CHOIR_NOT_SCHEDULED', 'WORSHIP_NOT_SCHEDULED']);
const SERVICE_PREFIX = 'psvc-';

interface RosterRow { id: string; personId: string; office: string; serveDays: string; status: string; unavailableJson: string; allowedKindsJson: string; onlyServicesJson: string; notes?: string | null }
interface PlanRow {
  id: string; monthKey: string; status: string; version: number; notesJson: string; generatedAt?: Date | string | null; submittedAt?: Date | string | null; submittedById?: string | null;
  reviewedAt?: Date | string | null; reviewedById?: string | null; publishedAt?: Date | string | null; publishedById?: string | null; musicVersionBuiltOn?: number | null;
  musicSnapshotJson?: string | null; musicStaleNotified?: boolean; overridesJson: string; relaxTuesday: boolean; relaxReason?: string | null; relaxedById?: string | null; relaxedAt?: Date | string | null;
}
interface SlotRow { id: string; monthKey: string; serviceId: string; personId: string; source: string; role: string; recommendedRole?: string | null; roleStatus?: string | null; slotKind: string; replacedPersonId?: string | null }
interface PersonRow { id: string; fullName: string; status?: string; archivedAt?: Date | string | null }
interface Override { issueKey: string; reason: string; byPersonId: string; at: string }

const accessOf = async (me: string) => (await loadAccessData(me)).data;
async function audit(actorId: string, action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({ data: { at: new Date(), actorId, systemId: PROTOCOL, action, resource: 'SCHEDULING', detail, metaJson: JSON.stringify(meta) } });
}
async function names(ids: string[]) {
  const out = new Map<string, string>();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return out;
  for (const p of (await prisma.person.findMany({ where: { id: { in: uniq } } })) as PersonRow[]) out.set(p.id, p.fullName);
  return out;
}
const activePerson = async (id: string) => {
  const p = (await prisma.person.findUnique({ where: { id } })) as PersonRow | null;
  return p && !p.archivedAt && (!p.status || p.status === 'ACTIVE') ? p : null;
};
const tell = (toPersonId: string, kind: 'FOR_INFORMATION' | 'WAITING_FOR_ME', title: string, body: string, key: string, href = '/s/sys-protocol/mine') =>
  notifySafely(prisma as never, { kind, toPersonId, systemId: PROTOCOL, title, body, href, sourceKey: `${key}:${toPersonId}` });
const tellOffice = (toOffice: string, kind: 'FOR_INFORMATION' | 'WAITING_FOR_ME', title: string, body: string, key: string, href = '/s/sys-protocol/teams') =>
  notifySafely(prisma as never, { kind, toOffice, toSystemId: PROTOCOL, systemId: PROTOCOL, title, body, href, sourceKey: key });

/* ───────────── Loading ───────────── */

/** Live Protocol positions decide the office; otherwise the roster's own office stands. */
async function rosterMembers(): Promise<{ rows: RosterRow[]; members: ProtocolRosterMember[] }> {
  const rows = (await prisma.protocolRoster.findMany()) as RosterRow[];
  const now = new Date();
  const live = new Map<string, string>();
  const positions = (await prisma.position.findMany({ where: { systemId: PROTOCOL } })) as Array<Record<string, unknown> & { personId: string; status?: string; startDate: Date; endDate?: Date | null }>;
  for (const p of positions) {
    if (p.status !== 'ACTIVE' || new Date(p.startDate) > now || (p.endDate && new Date(p.endDate) < now)) continue;
    const code = officeOf(p as never);
    const mapped = code === 'VICE_PRESIDENT' ? 'VP' : code;
    if (mapped && (OFFICES as readonly string[]).includes(mapped)) live.set(p.personId, mapped);
  }
  const members = rows.map((r) => ({
    id: r.id, personId: r.personId, office: (live.get(r.personId) ?? r.office) as ProtocolRosterMember['office'], serveDays: r.serveDays as ProtocolRosterMember['serveDays'],
    status: r.status as ProtocolRosterMember['status'], unavailableDates: parse<string[]>(r.unavailableJson, []),
    allowedServiceKinds: parse<ProtocolServiceKind[]>(r.allowedKindsJson, []), onlyServices: parse<Array<{ date: string; kind: ProtocolServiceKind }>>(r.onlyServicesJson, []),
    notes: r.notes ?? undefined,
  }));
  return { rows, members };
}

const slotOf = (r: SlotRow): ProtocolTeamSlot => ({
  id: r.id, serviceId: r.serviceId, personId: r.personId, source: r.source as ProtocolTeamSlot['source'], role: r.role as ProtocolTeamSlot['role'],
  recommendedRole: (r.recommendedRole ?? undefined) as ProtocolTeamSlot['recommendedRole'], roleStatus: (r.roleStatus ?? undefined) as ProtocolTeamSlot['roleStatus'],
  slotKind: r.slotKind as ProtocolTeamSlot['slotKind'], replacedPersonId: r.replacedPersonId ?? undefined,
});

const serviceId = (musicId: string) => `${SERVICE_PREFIX}${musicId}`;
const monthOfService = (sid: string) => /(\d{4}-\d{2})-\d{2}/.exec(sid)?.[1] ?? '';
const snapKey = (date: string, kind: string) => `${date}|${kind}`;

async function monthCtx(month: string) {
  const planned = await getPlanned(month);
  const planRow = ((await prisma.protocolPlan.findMany()) as PlanRow[]).find((p) => p.monthKey === month) ?? null;
  const { rows, members } = await rosterMembers();
  const slotRows = ((await prisma.protocolSlot.findMany()) as SlotRow[]).filter((s) => s.monthKey === month);
  const choirs = await loadChoirs();
  const kindById = new Map(choirs.map((c) => [c.id, c.role]));
  const choirUnits = new Map<string, Set<string>>();
  for (const m of (await prisma.musicChoirMember.findMany()) as Array<{ choirId: string; personId: string; status: string }>) {
    if (m.status !== 'ACTIVE') continue;
    if (!choirUnits.has(m.personId)) choirUnits.set(m.personId, new Set());
    choirUnits.get(m.personId)!.add(m.choirId);
  }
  const unitsOnService = new Map<string, Set<string>>();
  for (const a of planned?.assignments ?? []) {
    if (!unitsOnService.has(a.serviceId)) unitsOnService.set(a.serviceId, new Set());
    unitsOnService.get(a.serviceId)!.add(a.unitId);
  }
  const services: ProtocolService[] = (planned?.services ?? [])
    .filter((s) => (KINDS as readonly string[]).includes(s.kind))
    .map((s) => ({ id: serviceId(s.id), musicServiceId: s.id, monthKey: month, date: s.date, kind: s.kind as ProtocolServiceKind, label: s.label, targetTeamSize: 10 }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  const rules = rulesFor(planRow?.relaxTuesday ?? false);
  return { month, planned, planRow, rosterRows: rows, roster: members, slotRows, slots: slotRows.map(slotOf), services, rules, choirUnits, unitsOnService, kindOf: (u: string) => kindById.get(u) };
}
type Ctx = Awaited<ReturnType<typeof monthCtx>>;

const overridesOf = (c: Ctx) => parse<Override[]>(c.planRow?.overridesJson, []);
function issuesOf(c: Ctx): Array<ProtocolIssue & { overridden: boolean; canOverride: boolean }> {
  const ov = new Set(overridesOf(c).map((o) => o.issueKey));
  return validateProtocolTeamsDetailed({
    services: c.services, roster: c.roster, slots: c.slots, rules: c.rules, choirUnits: c.choirUnits, unitsOnService: c.unitsOnService, kindOf: c.kindOf,
  }).map((i) => ({ ...i, canOverride: OVERRIDABLE.has(i.code), overridden: OVERRIDABLE.has(i.code) && ov.has(i.key) }));
}
const blockingOf = (c: Ctx) => issuesOf(c).filter((i) => i.severity === 'BLOCKING' && !i.overridden);

/** What Music looked like when the teams were built, to see later what moved. */
const snapshotOf = (c: Ctx) => {
  const out: Record<string, string[]> = {};
  for (const s of c.services) out[snapKey(s.date, s.kind)] = [...(c.unitsOnService.get(s.musicServiceId ?? s.id) ?? [])].sort();
  return out;
};
function staleOf(c: Ctx): string[] {
  const base = parse<Record<string, string[]> | null>(c.planRow?.musicSnapshotJson, null);
  if (!base) return [];
  const now = snapshotOf(c);
  const out: string[] = [];
  for (const k of new Set([...Object.keys(base), ...Object.keys(now)])) {
    if (JSON.stringify(base[k] ?? null) !== JSON.stringify(now[k] ?? null)) out.push(k);
  }
  return out.sort();
}

async function ensurePlan(month: string): Promise<PlanRow> {
  const found = ((await prisma.protocolPlan.findMany()) as PlanRow[]).find((p) => p.monthKey === month);
  if (found) return found;
  return (await prisma.protocolPlan.create({ data: { monthKey: month, status: 'OPEN', version: 0, notesJson: '[]', overridesJson: '[]', updatedAt: new Date() } })) as PlanRow;
}
const setPlan = async (id: string, data: Record<string, unknown>) => prisma.protocolPlan.update({ where: { id }, data: { ...data, updatedAt: new Date() } });

const monthlyLoad = (c: Ctx, personId: string) => c.slots.filter((s) => s.personId === personId && s.slotKind === 'REGULAR').length;
/** Why this person may not be put on this service (hard rules only); Music clashes are flagged, not refused. */
function whyNot(c: Ctx, svc: ProtocolService, personId: string, ignoreSlotId?: string): string | null {
  const m = c.roster.find((r) => r.personId === personId);
  if (!m) return 'UNKNOWN_PERSON';
  if (m.status !== 'ACTIVE') return 'NOT_ACTIVE';
  const others = c.slots.filter((s) => s.id !== ignoreSlotId);
  if (others.some((s) => s.serviceId === svc.id && s.personId === personId)) return 'ALREADY';
  if (!canServeKind(m, svc.kind, svc.date) || m.unavailableDates.includes(svc.date)) return 'CANNOT_SERVE';
  const svcById = new Map(c.services.map((s) => [s.id, s]));
  const sunday = (k: string) => k === 'SS1' || k === 'SS2';
  if (sunday(svc.kind) && others.some((s) => s.personId === personId && s.slotKind !== 'FILL_IN' && svcById.get(s.serviceId)?.date === svc.date && sunday(svcById.get(s.serviceId)!.kind))) return 'DOUBLE_SUNDAY';
  if (others.filter((s) => s.personId === personId && s.slotKind === 'REGULAR' || s.personId === personId && s.slotKind === 'EXTRA').length >= c.rules.hardMax) return 'OVER_MAX';
  return null;
}
const musicClash = (c: Ctx, svc: ProtocolService, personId: string) => {
  const m = c.roster.find((r) => r.personId === personId);
  if (!m) return undefined;
  const req = musicRequirements(c.rules as ProtocolSchedulingRules, svc.kind);
  return musicConflictCode(m, svc, c.choirUnits, c.unitsOnService, req.choir, req.worship, c.kindOf);
};

/* ───────────── Gates ───────────── */

async function gateRead(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  if (!canReadPlan(me, data)) { fail(res, 404, 'NOT_FOUND', 'Not found'); return null; }
  return { me, data };
}
async function gateCoordinator(req: AuthedRequest, res: Res) {
  const g = await gateRead(req, res);
  if (!g) return null;
  if (!isCoordinator(g.me, g.data)) { fail(res, 403, 'FORBIDDEN', 'Only the Coordinator builds and edits the teams'); return null; }
  return g;
}
const monthParam = (req: AuthedRequest, res: Res) => {
  const m = String(req.params.month);
  if (!isMonth(m)) { fail(res, 400, 'BAD_MONTH', 'Use YYYY-MM'); return null; }
  return m;
};
const editable = (p: PlanRow | null) => !p || p.status === 'OPEN' || p.status === 'DRAFT';
const needMusic = (c: Ctx, res: Res) => {
  if (!c.planned) { fail(res, 409, 'NO_MUSIC', 'Music has not confirmed this month yet'); return false; }
  return true;
};

/* ───────────── Roster ───────────── */

const rosterBody = z.object({
  office: z.enum(OFFICES).optional(), serveDays: z.enum(SERVE_DAYS).optional(), status: z.enum(ROSTER_STATUS).optional(),
  unavailableDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(80).optional(),
  allowedServiceKinds: z.array(z.enum(KINDS)).max(4).optional(),
  onlyServices: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), kind: z.enum(KINDS) })).max(60).optional(),
  notes: z.string().max(300).optional(),
});

protocolRouter.get('/roster', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  if (!canReadRoster(me, data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const { rows, members } = await rosterMembers();
  const nm = await names(rows.map((r) => r.personId));
  const choirs = await loadChoirs();
  const choirName = new Map(choirs.map((ch) => [ch.id, ch.name]));
  const inChoir = new Map<string, string[]>();
  for (const m of (await prisma.musicChoirMember.findMany()) as Array<{ choirId: string; personId: string; status: string }>) {
    if (m.status === 'ACTIVE') inChoir.set(m.personId, [...(inChoir.get(m.personId) ?? []), choirName.get(m.choirId) ?? m.choirId]);
  }
  res.json({
    canWrite: canWriteRoster(me, data),
    members: members.map((m) => ({
      id: m.id, personId: m.personId, name: nm.get(m.personId) ?? m.personId, office: m.office, serveDays: m.serveDays, status: m.status,
      unavailableDates: m.unavailableDates, allowedServiceKinds: m.allowedServiceKinds ?? [], onlyServices: m.onlyServices ?? [], notes: m.notes ?? '', choirs: inChoir.get(m.personId) ?? [],
    })).sort((a, b) => a.name.localeCompare(b.name)),
  });
});

protocolRouter.post('/roster', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  if (!canWriteRoster(me, data)) return fail(res, canReadRoster(me, data) ? 403 : 404, canReadRoster(me, data) ? 'FORBIDDEN' : 'NOT_FOUND', 'Not allowed');
  const parsed = rosterBody.extend({ personId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the roster details');
  const b = parsed.data;
  if (!(await activePerson(b.personId))) return fail(res, 404, 'NO_PERSON', 'That person is not active');
  const existing = ((await prisma.protocolRoster.findMany()) as RosterRow[]).find((r) => r.personId === b.personId);
  const fields = {
    office: b.office ?? existing?.office ?? 'MEMBER', serveDays: b.serveDays ?? existing?.serveDays ?? 'BOTH', status: 'ACTIVE', notes: b.notes ?? existing?.notes ?? null,
    unavailableJson: JSON.stringify(b.unavailableDates ?? parse(existing?.unavailableJson, [])), allowedKindsJson: JSON.stringify(b.allowedServiceKinds ?? parse(existing?.allowedKindsJson, [])),
    onlyServicesJson: JSON.stringify(b.onlyServices ?? parse(existing?.onlyServicesJson, [])), updatedAt: new Date(),
  };
  if (existing) {
    if (existing.status === 'ACTIVE') return fail(res, 409, 'DUPLICATE', 'Already on the roster');
    await prisma.protocolRoster.update({ where: { id: existing.id }, data: fields });
    await audit(me, 'PROTOCOL_ROSTER_REJOIN', `Rejoined ${b.personId}`, { personId: b.personId });
    return res.status(201).json({ id: existing.id });
  }
  const created = (await prisma.protocolRoster.create({ data: { personId: b.personId, ...fields } })) as { id: string };
  await audit(me, 'PROTOCOL_ROSTER_ADD', `Added ${b.personId}`, { personId: b.personId });
  res.status(201).json({ id: created.id });
});

protocolRouter.patch('/roster/:id', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  if (!canWriteRoster(me, data)) return fail(res, canReadRoster(me, data) ? 403 : 404, canReadRoster(me, data) ? 'FORBIDDEN' : 'NOT_FOUND', 'Not allowed');
  const parsed = rosterBody.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the roster details');
  const row = ((await prisma.protocolRoster.findMany()) as RosterRow[]).find((r) => r.id === String(req.params.id));
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const b = parsed.data;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (b.office) patch.office = b.office;
  if (b.serveDays) patch.serveDays = b.serveDays;
  if (b.status) patch.status = b.status;
  if (b.unavailableDates) patch.unavailableJson = JSON.stringify([...new Set(b.unavailableDates)].sort());
  if (b.allowedServiceKinds) patch.allowedKindsJson = JSON.stringify(b.allowedServiceKinds);
  if (b.onlyServices) patch.onlyServicesJson = JSON.stringify(b.onlyServices);
  if (b.notes !== undefined) patch.notes = b.notes || null;
  await prisma.protocolRoster.update({ where: { id: row.id }, data: patch });
  await audit(me, 'PROTOCOL_ROSTER_EDIT', `Edited ${row.personId}`, { personId: row.personId, fields: Object.keys(patch) });
  res.json({ ok: true });
});

/* ───────────── Months ───────────── */

function stepOf(c: Ctx): 'WAIT_MUSIC' | 'BUILD' | 'SEND' | 'WAIT_PRESIDENT' | 'DONE' {
  if (!c.planned) return 'WAIT_MUSIC';
  const st = c.planRow?.status ?? 'OPEN';
  if (st === 'PUBLISHED') return 'DONE';
  if (st === 'REVIEW') return 'WAIT_PRESIDENT';
  return c.slots.length ? 'SEND' : 'BUILD';
}

protocolRouter.get('/months', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gateRead(req, res);
  if (!g) return;
  const musicMonths = ((await prisma.musicMonth.findMany()) as Array<{ periodKey: string; state: string }>).filter((m) => m.periodKey >= today().slice(0, 7));
  const plans = (await prisma.protocolPlan.findMany()) as PlanRow[];
  const keys = [...new Set([...musicMonths.map((m) => m.periodKey), ...plans.filter((p) => p.monthKey >= today().slice(0, 7)).map((p) => p.monthKey)])].sort();
  res.json({
    months: keys.map((k) => ({
      month: k, music: musicMonths.find((m) => m.periodKey === k)?.state ?? null, status: plans.find((p) => p.monthKey === k)?.status ?? 'OPEN', version: plans.find((p) => p.monthKey === k)?.version ?? 0,
    })),
  });
});

protocolRouter.get('/months/:month', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gateRead(req, res);
  const month = g && monthParam(req, res);
  if (!g || !month) return;
  const c = await monthCtx(month);
  const stale = staleOf(c);
  if (c.planRow && stale.length && !c.planRow.musicStaleNotified && c.planRow.status !== 'OPEN') {
    await setPlan(c.planRow.id, { musicStaleNotified: true });
    await tellOffice('COORDINATOR', 'WAITING_FOR_ME', `Music changed ${month}`, 'Music changed this month after the teams were built. Check the teams, then confirm you have seen it.', `protocol:stale:${month}:${c.planned?.version ?? 0}`);
  }
  const issues = issuesOf(c);
  const nm = await names([...c.slots.map((s) => s.personId), ...c.roster.map((r) => r.personId)]);
  const presidentActive = c.roster.some((r) => r.office === 'PRESIDENT' && r.status === 'ACTIVE');
  const planned = c.planned;
  const units = new Map((await loadChoirs()).map((x) => [x.id, x.name]));
  const count = new Map<string, number>();
  for (const s of c.slots) if (s.slotKind !== 'FILL_IN') count.set(s.personId, (count.get(s.personId) ?? 0) + 1);
  const status = c.planRow?.status ?? 'OPEN';
  res.json({
    month, step: stepOf(c), status, version: c.planRow?.version ?? 0, music: planned ? { state: planned.state, version: planned.version } : null,
    builtOnMusicVersion: c.planRow?.musicVersionBuiltOn ?? null, stale, notes: parse<string[]>(c.planRow?.notesJson, []),
    relax: { tuesday: c.planRow?.relaxTuesday ?? false, reason: c.planRow?.relaxReason ?? null },
    rules: { target: c.rules.preferTarget, hardMax: c.rules.hardMax, teamSize: c.rules.defaultTeamSize },
    services: c.services.map((s) => ({
      id: s.id, date: s.date, kind: s.kind, label: s.label, target: s.targetTeamSize,
      music: [...(c.unitsOnService.get(s.musicServiceId ?? s.id) ?? [])].map((u) => units.get(u) ?? u),
      team: c.slots.filter((x) => x.serviceId === s.id).sort((a, b) => (a.role === b.role ? 0 : a.role === 'TEAM_LEADER' ? -1 : b.role === 'TEAM_LEADER' ? 1 : a.role === 'VICE_LEADER' ? -1 : 1))
        .map((x) => ({ id: x.id, personId: x.personId, name: nm.get(x.personId) ?? x.personId, role: x.role, recommendedRole: x.recommendedRole ?? null, slotKind: x.slotKind, source: x.source, load: count.get(x.personId) ?? 0 })),
    })),
    issues: issues.map((i) => ({ key: i.key, code: i.code, severity: i.severity, message: i.message, serviceId: i.serviceId ?? null, personId: i.personId ?? null, overridden: i.overridden, canOverride: i.canOverride })),
    overrides: overridesOf(c),
    roster: c.roster.filter((r) => r.status === 'ACTIVE').map((r) => ({ personId: r.personId, name: nm.get(r.personId) ?? r.personId, load: count.get(r.personId) ?? 0 })).sort((a, b) => a.name.localeCompare(b.name)),
    can: {
      build: isCoordinator(g.me, g.data) && editable(c.planRow) && !!planned,
      edit: isCoordinator(g.me, g.data) && editable(c.planRow),
      reopen: isCoordinator(g.me, g.data) && (status === 'REVIEW' || status === 'PUBLISHED'),
      review: mayReview(g.me, g.data, presidentActive) && status === 'REVIEW' && c.planRow?.submittedById !== g.me,
    },
  });
});

/** One build per month at a time: a second click (or a retry while the first still runs) would double every duty. */
const building = new Set<string>();

protocolRouter.post('/months/:month/generate', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gateCoordinator(req, res);
  const month = g && monthParam(req, res);
  if (!g || !month) return;
  if (building.has(month)) return fail(res, 409, 'BUSY', 'The teams for this month are being built. Wait a moment and look again.');
  building.add(month);
  try {
    await generateMonth(req, res, g, month);
  } finally {
    building.delete(month);
  }
});

async function generateMonth(req: AuthedRequest, res: Res, g: { me: string }, month: string) {
  void req;
  const c = await monthCtx(month);
  if (!needMusic(c, res)) return;
  if (!editable(c.planRow)) return fail(res, 409, 'LOCKED', 'Return the month to draft first');
  const active = c.roster.filter((r) => r.status === 'ACTIVE');
  if (!active.length) return fail(res, 409, 'NO_ROSTER', 'Add people to the roster first');
  const { slots, warnings } = buildProtocolTeams({ services: c.services, roster: active, rules: c.rules, choirUnits: c.choirUnits, unitsOnService: c.unitsOnService, kindOf: c.kindOf });
  await prisma.protocolSlot.deleteMany({ where: { monthKey: month } });
  for (const s of slots) {
    await prisma.protocolSlot.create({
      data: {
        monthKey: month, serviceId: s.serviceId, personId: s.personId, source: 'ENGINE', role: 'MEMBER', recommendedRole: s.recommendedRole ?? null,
        roleStatus: s.recommendedRole && s.recommendedRole !== 'MEMBER' ? 'RECOMMENDED' : null, slotKind: s.slotKind,
      },
    });
  }
  const plan = await ensurePlan(month);
  await setPlan(plan.id, {
    status: 'DRAFT', generatedAt: new Date(), notesJson: JSON.stringify(warnings), musicVersionBuiltOn: c.planned!.version,
    musicSnapshotJson: JSON.stringify(snapshotOf(c)), musicStaleNotified: false, overridesJson: '[]', submittedAt: null, submittedById: null,
  });
  await audit(g.me, 'PROTOCOL_TEAMS_BUILT', `Built the teams for ${month}`, { month, slots: slots.length });
  res.json({ ok: true, slots: slots.length });
}

const slotBody = z.object({ serviceId: z.string().min(1), personId: z.string().min(1) });

protocolRouter.post('/months/:month/slots', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gateCoordinator(req, res);
  const month = g && monthParam(req, res);
  if (!g || !month) return;
  const parsed = slotBody.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Pick a service and a person');
  const c = await monthCtx(month);
  if (!editable(c.planRow)) return fail(res, 409, 'LOCKED', 'Return the month to draft first');
  const svc = c.services.find((s) => s.id === parsed.data.serviceId);
  if (!svc) return fail(res, 404, 'NO_SERVICE', 'No such service');
  const why = whyNot(c, svc, parsed.data.personId);
  if (why) return fail(res, 409, why, 'This person cannot be put on that service');
  await ensurePlan(month);
  await prisma.protocolSlot.create({ data: { monthKey: month, serviceId: svc.id, personId: parsed.data.personId, source: 'MANUAL', role: 'MEMBER', slotKind: monthlyLoad(c, parsed.data.personId) >= c.rules.softMax ? 'EXTRA' : 'REGULAR' } });
  const plan = await ensurePlan(month);
  if (plan.status === 'OPEN') await setPlan(plan.id, { status: 'DRAFT' });
  await audit(g.me, 'PROTOCOL_SLOT_ADD', `Added ${parsed.data.personId} to ${svc.label}`, { month, serviceId: svc.id, personId: parsed.data.personId });
  res.status(201).json({ ok: true });
});

protocolRouter.delete('/months/:month/slots/:id', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gateCoordinator(req, res);
  const month = g && monthParam(req, res);
  if (!g || !month) return;
  const c = await monthCtx(month);
  if (!editable(c.planRow)) return fail(res, 409, 'LOCKED', 'Return the month to draft first');
  const row = c.slotRows.find((s) => s.id === String(req.params.id));
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Not found');
  await prisma.protocolSlot.delete({ where: { id: row.id } });
  await audit(g.me, 'PROTOCOL_SLOT_REMOVE', `Removed ${row.personId}`, { month, serviceId: row.serviceId, personId: row.personId });
  res.json({ ok: true });
});

protocolRouter.post('/months/:month/slots/:id/replace', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gateCoordinator(req, res);
  const month = g && monthParam(req, res);
  if (!g || !month) return;
  const parsed = z.object({ personId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Pick a person');
  const c = await monthCtx(month);
  if (!editable(c.planRow)) return fail(res, 409, 'LOCKED', 'Return the month to draft first');
  const row = c.slotRows.find((s) => s.id === String(req.params.id));
  const svc = row && c.services.find((s) => s.id === row.serviceId);
  if (!row || !svc) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const why = whyNot(c, svc, parsed.data.personId, row.id);
  if (why) return fail(res, 409, why, 'This person cannot take that place');
  const kind = c.slots.filter((s) => s.id !== row.id && s.personId === parsed.data.personId && s.slotKind === 'REGULAR').length >= c.rules.softMax ? 'EXTRA' : 'REGULAR';
  await prisma.protocolSlot.update({ where: { id: row.id }, data: { personId: parsed.data.personId, source: 'MANUAL', role: 'MEMBER', recommendedRole: null, roleStatus: null, slotKind: kind } });
  await audit(g.me, 'PROTOCOL_SLOT_REPLACE', `Replaced ${row.personId} with ${parsed.data.personId}`, { month, serviceId: row.serviceId });
  res.json({ ok: true });
});

protocolRouter.post('/months/:month/slots/:id/role', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gateCoordinator(req, res);
  const month = g && monthParam(req, res);
  if (!g || !month) return;
  const parsed = z.object({ role: z.enum(['MEMBER', 'TEAM_LEADER', 'VICE_LEADER']) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Pick a role');
  const c = await monthCtx(month);
  if (!editable(c.planRow)) return fail(res, 409, 'LOCKED', 'Return the month to draft first');
  const row = c.slotRows.find((s) => s.id === String(req.params.id));
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (parsed.data.role !== 'MEMBER') {
    for (const o of c.slotRows.filter((s) => s.serviceId === row.serviceId && s.role === parsed.data.role && s.id !== row.id)) await prisma.protocolSlot.update({ where: { id: o.id }, data: { role: 'MEMBER', roleStatus: 'MANUAL' } });
  }
  await prisma.protocolSlot.update({ where: { id: row.id }, data: { role: parsed.data.role, roleStatus: 'MANUAL' } });
  res.json({ ok: true });
});

protocolRouter.post('/months/:month/roles/approve', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gateCoordinator(req, res);
  const month = g && monthParam(req, res);
  if (!g || !month) return;
  const c = await monthCtx(month);
  if (!editable(c.planRow)) return fail(res, 409, 'LOCKED', 'Return the month to draft first');
  let n = 0;
  for (const s of c.slotRows.filter((x) => x.roleStatus === 'RECOMMENDED' && x.recommendedRole)) {
    await prisma.protocolSlot.update({ where: { id: s.id }, data: { role: s.recommendedRole ?? 'MEMBER', roleStatus: 'APPROVED' } });
    n += 1;
  }
  res.json({ ok: true, approved: n });
});

protocolRouter.post('/months/:month/overrides', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gateCoordinator(req, res);
  const month = g && monthParam(req, res);
  if (!g || !month) return;
  const parsed = z.object({ issueKey: z.string().min(1), reason: z.string().trim().min(REASON_MIN).max(REASON_MAX) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'REASON', 'Give a reason of at least five characters');
  const c = await monthCtx(month);
  if (!editable(c.planRow)) return fail(res, 409, 'LOCKED', 'Return the month to draft first');
  const issue = issuesOf(c).find((i) => i.key === parsed.data.issueKey);
  if (!issue) return fail(res, 404, 'NOT_FOUND', 'No such issue');
  if (!issue.canOverride) return fail(res, 409, 'NOT_OVERRIDABLE', 'Only the Music clashes can be overridden');
  const next = [...overridesOf(c).filter((o) => o.issueKey !== issue.key), { issueKey: issue.key, reason: parsed.data.reason, byPersonId: g.me, at: new Date().toISOString() }];
  await setPlan((await ensurePlan(month)).id, { overridesJson: JSON.stringify(next) });
  await audit(g.me, 'PROTOCOL_OVERRIDE', `Allowed: ${issue.message}`, { month, key: issue.key, reason: parsed.data.reason });
  res.json({ ok: true });
});

protocolRouter.post('/months/:month/relax', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gateCoordinator(req, res);
  const month = g && monthParam(req, res);
  if (!g || !month) return;
  const parsed = z.object({ on: z.boolean(), reason: z.string().trim().max(REASON_MAX).optional() }).safeParse(req.body);
  if (!parsed.success || (parsed.data.on && (parsed.data.reason ?? '').length < REASON_MIN)) return fail(res, 400, 'REASON', 'Give a reason of at least five characters');
  const c = await monthCtx(month);
  if (!editable(c.planRow)) return fail(res, 409, 'LOCKED', 'Return the month to draft first');
  const plan = await ensurePlan(month);
  await setPlan(plan.id, parsed.data.on
    ? { relaxTuesday: true, relaxReason: parsed.data.reason, relaxedById: g.me, relaxedAt: new Date() }
    : { relaxTuesday: false, relaxReason: null, relaxedById: null, relaxedAt: null });
  await audit(g.me, 'PROTOCOL_RELAX', parsed.data.on ? 'Relaxed the Tuesday choir rule' : 'Restored the Tuesday choir rule', { month, reason: parsed.data.reason ?? null });
  res.json({ ok: true });
});

protocolRouter.post('/months/:month/acknowledge-music', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gateCoordinator(req, res);
  const month = g && monthParam(req, res);
  if (!g || !month) return;
  const c = await monthCtx(month);
  if (!c.planRow || !c.planned) return fail(res, 409, 'NO_MUSIC', 'Nothing to confirm');
  await setPlan(c.planRow.id, { musicSnapshotJson: JSON.stringify(snapshotOf(c)), musicVersionBuiltOn: c.planned.version, musicStaleNotified: false });
  res.json({ ok: true });
});

protocolRouter.post('/months/:month/submit', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gateCoordinator(req, res);
  const month = g && monthParam(req, res);
  if (!g || !month) return;
  const c = await monthCtx(month);
  if (!c.planRow || c.planRow.status !== 'DRAFT' || !c.slots.length) return fail(res, 409, 'NOT_DRAFT', 'Build the teams first');
  if (blockingOf(c).length) return fail(res, 409, 'BLOCKING', 'Fix or allow the blocking issues first');
  await setPlan(c.planRow.id, { status: 'REVIEW', submittedAt: new Date(), submittedById: g.me });
  await tellOffice('PRESIDENT', 'WAITING_FOR_ME', `Protocol teams for ${month}`, 'The Coordinator sent the teams for your review.', `protocol:review:${month}:${c.planRow.version}`);
  await audit(g.me, 'PROTOCOL_SUBMIT', `Sent ${month} for review`, { month });
  res.json({ ok: true });
});

protocolRouter.post('/months/:month/return', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gateRead(req, res);
  const month = g && monthParam(req, res);
  if (!g || !month) return;
  const c = await monthCtx(month);
  const status = c.planRow?.status;
  const presidentActive = c.roster.some((r) => r.office === 'PRESIDENT' && r.status === 'ACTIVE');
  const coord = isCoordinator(g.me, g.data);
  const reviewer = mayReview(g.me, g.data, presidentActive);
  const ok = (status === 'REVIEW' && (coord || reviewer)) || (status === 'PUBLISHED' && coord);
  if (!c.planRow || !ok) return fail(res, 403, 'FORBIDDEN', 'You cannot return this month to draft');
  await setPlan(c.planRow.id, { status: 'DRAFT', submittedAt: null, submittedById: null });
  if (reviewer && !coord) await tellOffice('COORDINATOR', 'WAITING_FOR_ME', `Protocol teams for ${month} returned`, 'The reviewer sent the teams back to draft.', `protocol:return:${month}:${Date.now()}`);
  await audit(g.me, 'PROTOCOL_RETURN', `Returned ${month} to draft`, { month, from: status });
  res.json({ ok: true });
});

protocolRouter.post('/months/:month/publish', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gateRead(req, res);
  const month = g && monthParam(req, res);
  if (!g || !month) return;
  const c = await monthCtx(month);
  const presidentActive = c.roster.some((r) => r.office === 'PRESIDENT' && r.status === 'ACTIVE');
  if (!mayReview(g.me, g.data, presidentActive)) return fail(res, 403, 'FORBIDDEN', 'Only the President reviews and publishes');
  if (!c.planRow || c.planRow.status !== 'REVIEW') return fail(res, 409, 'NOT_IN_REVIEW', 'Nothing waiting for review');
  if (c.planRow.submittedById === g.me) return fail(res, 409, 'SAME_PERSON', 'The reviewer must not be the person who sent it');
  if (!c.planned || c.planned.state !== 'PUBLISHED') return fail(res, 409, 'MUSIC_NOT_PUBLISHED', 'Music must publish the month first');
  if (staleOf(c).length) return fail(res, 409, 'MUSIC_CHANGED', 'Music changed since the teams were built');
  if (blockingOf(c).length) return fail(res, 409, 'BLOCKING', 'There are still blocking issues');
  const version = c.planRow.version + 1;
  await prisma.protocolHistory.create({ data: { monthKey: month, version, publishedAt: new Date(), publishedById: g.me, slotsJson: JSON.stringify(c.slots), notesJson: c.planRow.notesJson } });
  await setPlan(c.planRow.id, { status: 'PUBLISHED', version, reviewedAt: new Date(), reviewedById: g.me, publishedAt: new Date(), publishedById: g.me });
  for (const id of new Set(c.slots.map((s) => s.personId))) await tell(id, 'FOR_INFORMATION', `Your Protocol duties for ${month}`, 'The month is published. Open My duties to see your services.', `protocol:published:${month}:${version}`);
  await tellOffice('COORDINATOR', 'FOR_INFORMATION', `Protocol teams for ${month} published`, `Version ${version} is out.`, `protocol:publishedc:${month}:${version}`);
  await audit(g.me, 'PROTOCOL_PUBLISH', `Published ${month} v${version}`, { month, version });
  res.json({ ok: true, version });
});

protocolRouter.get('/months/:month/history', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gateRead(req, res);
  const month = g && monthParam(req, res);
  if (!g || !month) return;
  const rows = ((await prisma.protocolHistory.findMany()) as Array<{ monthKey: string; version: number; publishedAt: Date | string; publishedById: string; slotsJson: string }>).filter((h) => h.monthKey === month);
  const nm = await names(rows.map((r) => r.publishedById));
  res.json({ versions: rows.sort((a, b) => b.version - a.version).map((r) => ({ version: r.version, publishedAt: iso(r.publishedAt), by: nm.get(r.publishedById) ?? r.publishedById, slots: parse<unknown[]>(r.slotsJson, []).length })) });
});

/* ───────────── Service life: mine, excuses, fill-ins, swaps ───────────── */

async function serviceCtx(sid: string) {
  const month = monthOfService(sid);
  if (!month) return null;
  const c = await monthCtx(month);
  const svc = c.services.find((s) => s.id === sid);
  return svc ? { c, svc } : null;
}
const isLeaderOf = (c: Ctx, sid: string, personId: string) => c.slots.some((s) => s.serviceId === sid && s.personId === personId && (s.role === 'TEAM_LEADER' || s.role === 'VICE_LEADER'));
const publishedCtx = (x: NonNullable<Awaited<ReturnType<typeof serviceCtx>>>) => x.c.planRow?.status === 'PUBLISHED';
const leadersOf = (c: Ctx, sid: string) => c.slots.filter((s) => s.serviceId === sid && (s.role === 'TEAM_LEADER' || s.role === 'VICE_LEADER')).map((s) => s.personId);

protocolRouter.get('/mine', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const from = today().slice(0, 7);
  const plans = ((await prisma.protocolPlan.findMany()) as PlanRow[]).filter((p) => p.status === 'PUBLISHED' && p.monthKey >= from);
  const absences = (await prisma.protocolAbsence.findMany()) as Array<{ id: string; serviceId: string; personId: string; reason: string; status: string }>;
  const fillIns = (await prisma.protocolFillIn.findMany()) as Array<{ id: string; serviceId: string; excusedPersonId: string; candidatePersonId: string; status: string }>;
  const swaps = (await prisma.protocolSwapProposal.findMany()) as Array<{ id: string; serviceId: string; proposerId: string; targetId: string; status: string }>;
  const attendance = (await prisma.protocolAttendance.findMany()) as Array<{ serviceId: string; personId: string; status: string; slotKind?: string | null }>;
  const duties: unknown[] = [];
  const leading: unknown[] = [];
  const want = new Set<string>([me]);
  const ctxs: Ctx[] = [];
  for (const p of plans.sort((a, b) => a.monthKey.localeCompare(b.monthKey))) {
    const c = await monthCtx(p.monthKey);
    ctxs.push(c);
    for (const s of c.slots) want.add(s.personId);
  }
  const nm = await names([...want, ...fillIns.flatMap((f) => [f.excusedPersonId, f.candidatePersonId]), ...swaps.flatMap((s) => [s.proposerId, s.targetId])]);
  for (const c of ctxs) {
    for (const svc of c.services) {
      const mine = c.slots.find((s) => s.serviceId === svc.id && s.personId === me);
      const att = attendance.find((a) => a.serviceId === svc.id && a.personId === me);
      if (mine) {
        duties.push({
          serviceId: svc.id, date: svc.date, kind: svc.kind, label: svc.label, role: mine.role, slotKind: mine.slotKind, attendance: att?.status ?? null,
          absence: absences.find((a) => a.serviceId === svc.id && a.personId === me)?.status ?? null,
          swapOffers: swaps.filter((w) => w.serviceId === svc.id && w.targetId === me && w.status === 'PENDING').map((w) => ({ id: w.id, from: nm.get(w.proposerId) ?? w.proposerId })),
        });
      }
      if (isLeaderOf(c, svc.id, me)) {
        leading.push({
          serviceId: svc.id, date: svc.date, kind: svc.kind, label: svc.label,
          team: c.slots.filter((s) => s.serviceId === svc.id).map((s) => ({
            personId: s.personId, name: nm.get(s.personId) ?? s.personId, role: s.role, slotKind: s.slotKind, attendance: attendance.find((a) => a.serviceId === svc.id && a.personId === s.personId)?.status ?? null,
            absence: absences.find((a) => a.serviceId === svc.id && a.personId === s.personId) ?? null,
          })),
          fillIns: fillIns.filter((f) => f.serviceId === svc.id).map((f) => ({ id: f.id, excused: nm.get(f.excusedPersonId) ?? '', candidate: nm.get(f.candidatePersonId) ?? '', status: f.status })),
        });
      }
    }
  }
  const others: unknown[] = [];
  let pool: Array<{ personId: string; name: string }> = [];
  const todayDay = today();
  const poolIds = new Set<string>();
  for (const c of ctxs) {
    if (!c.roster.some((r) => r.personId === me && r.status === 'ACTIVE')) continue;
    for (const svc of c.services) {
      if (svc.date < todayDay) continue;
      const team = c.slots.filter((s) => s.serviceId === svc.id && s.slotKind !== 'FILL_IN');
      if (team.length && !c.slots.some((s) => s.serviceId === svc.id && s.personId === me)) {
        others.push({ serviceId: svc.id, date: svc.date, kind: svc.kind, label: svc.label, team: team.map((s) => ({ personId: s.personId, name: nm.get(s.personId) ?? s.personId })) });
      }
    }
  }
  if ((leading as unknown[]).length) {
    for (const c of ctxs) for (const r of c.roster) if (r.status === 'ACTIVE') poolIds.add(r.personId);
    const pn = await names([...poolIds]);
    pool = [...poolIds].map((id) => ({ personId: id, name: pn.get(id) ?? id })).sort((a, b) => a.name.localeCompare(b.name));
  }
  const asked = fillIns.filter((f) => f.candidatePersonId === me && f.status === 'PENDING').map((f) => ({ id: f.id, serviceId: f.serviceId, excused: nm.get(f.excusedPersonId) ?? f.excusedPersonId }));
  res.json({
    duties, leading, others, pool, fillInOffers: asked,
    absencesToDecide: absences.filter((a) => a.status === 'PENDING' && (leading as Array<{ serviceId: string }>).some((l) => l.serviceId === a.serviceId) && a.personId !== me)
      .map((a) => ({ id: a.id, serviceId: a.serviceId, person: nm.get(a.personId) ?? a.personId, reason: a.reason })),
  });
});

protocolRouter.post('/absences', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z.object({ serviceId: z.string().min(1), reason: z.string().trim().min(REASON_MIN).max(REASON_MAX) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'REASON', 'Give a reason of at least five characters');
  const x = await serviceCtx(parsed.data.serviceId);
  if (!x || !publishedCtx(x)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (x.svc.date < today()) return fail(res, 409, 'PAST', 'That service has passed');
  if (!x.c.slots.some((s) => s.serviceId === x.svc.id && s.personId === me)) return fail(res, 403, 'NOT_ON_TEAM', 'You are not on that team');
  const dup = ((await prisma.protocolAbsence.findMany()) as Array<{ serviceId: string; personId: string; status: string }>).some((a) => a.serviceId === x.svc.id && a.personId === me && a.status !== 'DENIED');
  if (dup) return fail(res, 409, 'DUPLICATE', 'You already asked for this service');
  const created = (await prisma.protocolAbsence.create({ data: { serviceId: x.svc.id, personId: me, reason: parsed.data.reason, status: 'PENDING', createdAt: new Date() } })) as { id: string };
  for (const l of leadersOf(x.c, x.svc.id)) if (l !== me) await tell(l, 'WAITING_FOR_ME', 'A team member asks to be excused', `${x.svc.label}: ${parsed.data.reason}`, `protocol:absence:${created.id}`);
  res.status(201).json({ id: created.id });
});

protocolRouter.post('/absences/:id/decide', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z.object({ decision: z.enum(['EXCUSE', 'DENY']) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Excuse or deny');
  const row = ((await prisma.protocolAbsence.findMany()) as Array<{ id: string; serviceId: string; personId: string; status: string }>).find((a) => a.id === String(req.params.id));
  const x = row && (await serviceCtx(row.serviceId));
  if (!row || !x) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!isLeaderOf(x.c, x.svc.id, me) || row.personId === me) return fail(res, 403, 'FORBIDDEN', 'Only the team leader decides, and not on their own request');
  if (row.status !== 'PENDING') return fail(res, 409, 'DECIDED', 'Already decided');
  await prisma.protocolAbsence.update({ where: { id: row.id }, data: { status: parsed.data.decision === 'EXCUSE' ? 'EXCUSED' : 'DENIED', decidedById: me, decidedAt: new Date() } });
  if (parsed.data.decision === 'EXCUSE') await upsertAttendance(x.svc.id, row.personId, 'EXCUSED', x.c, me);
  await tell(row.personId, 'FOR_INFORMATION', parsed.data.decision === 'EXCUSE' ? 'You are excused' : 'Your request was not accepted', x.svc.label, `protocol:absence-decided:${row.id}`);
  res.json({ ok: true });
});

const sundayDouble = (c: Ctx, svc: ProtocolService, personId: string) => {
  const sunday = (k: string) => k === 'SS1' || k === 'SS2';
  const byId = new Map(c.services.map((s) => [s.id, s]));
  return sunday(svc.kind) && c.slots.some((s) => s.personId === personId && s.slotKind !== 'FILL_IN' && s.serviceId !== svc.id && byId.get(s.serviceId)?.date === svc.date && sunday(byId.get(s.serviceId)!.kind));
};
/** The checks the old fill-in and swap flows skipped: roster, days, Music, same-day Sunday, the monthly maximum. */
function whyCannotTake(c: Ctx, svc: ProtocolService, personId: string, leaving?: string): string | null {
  const m = c.roster.find((r) => r.personId === personId);
  if (!m) return 'UNKNOWN_PERSON';
  if (m.status !== 'ACTIVE') return 'NOT_ACTIVE';
  if (c.slots.some((s) => s.serviceId === svc.id && s.personId === personId)) return 'ALREADY';
  if (!canServeKind(m, svc.kind, svc.date) || m.unavailableDates.includes(svc.date)) return 'CANNOT_SERVE';
  if (sundayDouble(c, svc, personId)) return 'DOUBLE_SUNDAY';
  const clash = musicClash(c, svc, personId);
  if (clash) return clash;
  const load = c.slots.filter((s) => s.personId === personId && s.slotKind !== 'FILL_IN').length;
  // Taking a place always adds one duty to the taker, whoever else is leaving it.
  if (load >= c.rules.hardMax) return 'OVER_MAX';
  return null;
}

protocolRouter.post('/fillins', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z.object({ serviceId: z.string().min(1), excusedPersonId: z.string().min(1), candidatePersonId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Pick the excused person and a candidate');
  const x = await serviceCtx(parsed.data.serviceId);
  if (!x || !publishedCtx(x)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!isLeaderOf(x.c, x.svc.id, me)) return fail(res, 403, 'FORBIDDEN', 'Only the team leader offers fill-ins');
  if (x.svc.date < today()) return fail(res, 409, 'PAST', 'That service has passed');
  const excused = ((await prisma.protocolAbsence.findMany()) as Array<{ serviceId: string; personId: string; status: string }>).some((a) => a.serviceId === x.svc.id && a.personId === parsed.data.excusedPersonId && a.status === 'EXCUSED');
  if (!excused) return fail(res, 409, 'NOT_EXCUSED', 'That person is not excused');
  const why = whyCannotTake(x.c, x.svc, parsed.data.candidatePersonId);
  if (why) return fail(res, 409, why, 'This person cannot fill in');
  const dup = ((await prisma.protocolFillIn.findMany()) as Array<{ serviceId: string; excusedPersonId: string; candidatePersonId: string; status: string }>).some((f) => f.serviceId === x.svc.id && f.excusedPersonId === parsed.data.excusedPersonId && f.status === 'PENDING' && f.candidatePersonId === parsed.data.candidatePersonId);
  if (dup) return fail(res, 409, 'DUPLICATE', 'Already offered');
  const created = (await prisma.protocolFillIn.create({ data: { serviceId: x.svc.id, excusedPersonId: parsed.data.excusedPersonId, candidatePersonId: parsed.data.candidatePersonId, offeredById: me, status: 'PENDING', createdAt: new Date() } })) as { id: string };
  await tell(parsed.data.candidatePersonId, 'WAITING_FOR_ME', 'You are asked to fill in', x.svc.label, `protocol:fillin:${created.id}`);
  res.status(201).json({ id: created.id });
});

protocolRouter.post('/fillins/:id/respond', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z.object({ accept: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Accept or decline');
  const row = ((await prisma.protocolFillIn.findMany()) as Array<{ id: string; serviceId: string; excusedPersonId: string; candidatePersonId: string; offeredById: string; status: string }>).find((f) => f.id === String(req.params.id));
  const x = row && (await serviceCtx(row.serviceId));
  if (!row || !x) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (row.candidatePersonId !== me) return fail(res, 403, 'FORBIDDEN', 'This offer is not yours');
  if (row.status !== 'PENDING') return fail(res, 409, 'DECIDED', 'Already answered');
  if (parsed.data.accept) {
    const why = whyCannotTake(x.c, x.svc, me);
    if (why) return fail(res, 409, why, 'You can no longer take this place');
    await prisma.protocolSlot.create({ data: { monthKey: x.c.month, serviceId: x.svc.id, personId: me, source: 'FILL_IN', role: 'MEMBER', slotKind: 'FILL_IN', replacedPersonId: row.excusedPersonId } });
  }
  await prisma.protocolFillIn.update({ where: { id: row.id }, data: { status: parsed.data.accept ? 'ACCEPTED' : 'DECLINED', respondedAt: new Date() } });
  await tell(row.offeredById, 'FOR_INFORMATION', parsed.data.accept ? 'Fill-in accepted' : 'Fill-in declined', x.svc.label, `protocol:fillin-answer:${row.id}`);
  res.json({ ok: true });
});

protocolRouter.post('/swaps', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z.object({ serviceId: z.string().min(1), targetPersonId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Pick a service and a person');
  const x = await serviceCtx(parsed.data.serviceId);
  if (!x || !publishedCtx(x)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (x.svc.date < today()) return fail(res, 409, 'PAST', 'That service has passed');
  if (me === parsed.data.targetPersonId) return fail(res, 400, 'SELF', 'Pick someone else');
  if (!x.c.slots.some((s) => s.serviceId === x.svc.id && s.personId === parsed.data.targetPersonId && s.slotKind !== 'FILL_IN')) return fail(res, 409, 'NOT_ON_TEAM', 'That person is not on this team');
  const why = whyCannotTake(x.c, x.svc, me, parsed.data.targetPersonId);
  if (why) return fail(res, 409, why, 'You cannot take this place');
  const dup = ((await prisma.protocolSwapProposal.findMany()) as Array<{ serviceId: string; proposerId: string; targetId: string; status: string }>).some((w) => w.serviceId === x.svc.id && w.proposerId === me && w.targetId === parsed.data.targetPersonId && w.status === 'PENDING');
  if (dup) return fail(res, 409, 'DUPLICATE', 'Already proposed');
  const created = (await prisma.protocolSwapProposal.create({ data: { serviceId: x.svc.id, proposerId: me, targetId: parsed.data.targetPersonId, status: 'PENDING', createdAt: new Date() } })) as { id: string };
  await tell(parsed.data.targetPersonId, 'WAITING_FOR_ME', 'Someone offers to take your place', x.svc.label, `protocol:swap:${created.id}`);
  res.status(201).json({ id: created.id });
});

protocolRouter.post('/swaps/:id/respond', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z.object({ accept: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Accept or decline');
  const row = ((await prisma.protocolSwapProposal.findMany()) as Array<{ id: string; serviceId: string; proposerId: string; targetId: string; status: string }>).find((w) => w.id === String(req.params.id));
  const x = row && (await serviceCtx(row.serviceId));
  if (!row || !x) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (row.targetId !== me) return fail(res, 403, 'FORBIDDEN', 'This is not yours to answer');
  if (row.status !== 'PENDING') return fail(res, 409, 'DECIDED', 'Already answered');
  if (parsed.data.accept) {
    const slot = x.c.slotRows.find((s) => s.serviceId === x.svc.id && s.personId === me);
    if (!slot) return fail(res, 409, 'NOT_ON_TEAM', 'You are no longer on this team');
    const why = whyCannotTake(x.c, x.svc, row.proposerId, me);
    if (why) return fail(res, 409, why, 'The other person can no longer take this place');
    const kind = x.c.slots.filter((s) => s.id !== slot.id && s.personId === row.proposerId && s.slotKind === 'REGULAR').length >= x.c.rules.softMax ? 'EXTRA' : 'REGULAR';
    await prisma.protocolSlot.update({ where: { id: slot.id }, data: { personId: row.proposerId, source: 'SWAP', role: slot.role, slotKind: kind } });
  }
  await prisma.protocolSwapProposal.update({ where: { id: row.id }, data: { status: parsed.data.accept ? 'ACCEPTED' : 'DECLINED', respondedAt: new Date() } });
  await tell(row.proposerId, 'FOR_INFORMATION', parsed.data.accept ? 'Swap accepted' : 'Swap declined', x.svc.label, `protocol:swap-answer:${row.id}`);
  res.json({ ok: true });
});

protocolRouter.post('/swaps/:id/cancel', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const row = ((await prisma.protocolSwapProposal.findMany()) as Array<{ id: string; proposerId: string; status: string }>).find((w) => w.id === String(req.params.id));
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (row.proposerId !== me) return fail(res, 403, 'FORBIDDEN', 'Only the person who proposed can cancel');
  if (row.status !== 'PENDING') return fail(res, 409, 'DECIDED', 'Already answered');
  await prisma.protocolSwapProposal.update({ where: { id: row.id }, data: { status: 'CANCELLED', respondedAt: new Date() } });
  res.json({ ok: true });
});

/* ───────────── Attendance, scores and the report ───────────── */

async function upsertAttendance(sid: string, personId: string, status: string, c: Ctx, by: string, notes?: string) {
  const slot = c.slots.find((s) => s.serviceId === sid && s.personId === personId);
  const found = ((await prisma.protocolAttendance.findMany()) as Array<{ id: string; serviceId: string; personId: string }>).find((a) => a.serviceId === sid && a.personId === personId);
  const data = { status, slotKind: slot?.slotKind ?? null, notes: notes ?? null, recordedById: by, recordedAt: new Date() };
  if (found) await prisma.protocolAttendance.update({ where: { id: found.id }, data });
  else await prisma.protocolAttendance.create({ data: { serviceId: sid, personId, ...data } });
}

protocolRouter.post('/services/:sid/attendance', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  const parsed = z.object({ personId: z.string().min(1), status: z.enum(ATTENDANCE), notes: z.string().max(300).optional() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Pick a person and a status');
  const x = await serviceCtx(String(req.params.sid));
  if (!x || !publishedCtx(x)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const may = isLeaderOf(x.c, x.svc.id, me) || hasOffice(me, 'PRESIDENT', data) || isCoordinator(me, data);
  if (!may) return fail(res, 403, 'FORBIDDEN', 'Only the team leader, Coordinator or President records attendance');
  if (x.svc.date > today()) return fail(res, 409, 'FUTURE', 'That service has not happened yet');
  if (!x.c.slots.some((s) => s.serviceId === x.svc.id && s.personId === parsed.data.personId)) return fail(res, 404, 'NOT_ON_TEAM', 'That person is not on this team');
  await upsertAttendance(x.svc.id, parsed.data.personId, parsed.data.status, x.c, me, parsed.data.notes);
  res.json({ ok: true });
});

protocolRouter.get('/services/:sid/attendance', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  const x = await serviceCtx(String(req.params.sid));
  if (!x) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!(isLeaderOf(x.c, x.svc.id, me) || canReadPlan(me, data))) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const rows = ((await prisma.protocolAttendance.findMany()) as Array<{ serviceId: string; personId: string; status: string; slotKind?: string | null }>).filter((a) => a.serviceId === x.svc.id);
  const team = x.c.slots.filter((s) => s.serviceId === x.svc.id);
  const nm = await names(team.map((s) => s.personId));
  res.json({
    service: { id: x.svc.id, date: x.svc.date, kind: x.svc.kind, label: x.svc.label },
    team: team.map((s) => ({ personId: s.personId, name: nm.get(s.personId) ?? s.personId, role: s.role, slotKind: s.slotKind, status: rows.find((a) => a.personId === s.personId)?.status ?? null })),
  });
});

protocolRouter.get('/scores', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  if (!canReadRoster(me, data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const month = String(req.query.month ?? '');
  if (month && !isMonth(month)) return fail(res, 400, 'BAD_MONTH', 'Use YYYY-MM');
  const rows = ((await prisma.protocolAttendance.findMany()) as Array<{ serviceId: string; personId: string; status: string; slotKind?: string | null }>).filter((a) => !month || monthOfService(a.serviceId) === month);
  const per = new Map<string, { points: number; services: number; absent: number }>();
  for (const a of rows) {
    const cur = per.get(a.personId) ?? { points: 0, services: 0, absent: 0 };
    cur.points += scoreAttendanceRow({ status: a.status as never, slotKind: (a.slotKind ?? undefined) as never });
    cur.services += 1;
    if (a.status === 'ABSENT') cur.absent += 1;
    per.set(a.personId, cur);
  }
  const nm = await names([...per.keys()]);
  res.json({ scores: [...per.entries()].map(([personId, v]) => ({ personId, name: nm.get(personId) ?? personId, ...v })).sort((a, b) => b.points - a.points) });
});

const reportBody = z.object({
  challenges: z.string().max(TEXT_MAX).default(''), solutions: z.string().max(TEXT_MAX).default(''), issues: z.string().max(TEXT_MAX).default(''), recommendations: z.string().max(TEXT_MAX).default(''),
});

protocolRouter.get('/services/:sid/report', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  const x = await serviceCtx(String(req.params.sid));
  if (!x) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!(isLeaderOf(x.c, x.svc.id, me) || canReadReports(me, data))) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const r = ((await prisma.protocolServiceReport.findMany()) as Array<Record<string, string | Date>>).find((q) => q.serviceId === x.svc.id);
  res.json({ service: { id: x.svc.id, date: x.svc.date, kind: x.svc.kind, label: x.svc.label }, canWrite: isLeaderOf(x.c, x.svc.id, me), report: r ? { challenges: r.challenges, solutions: r.solutions, issues: r.issues, recommendations: r.recommendations, submittedAt: iso(r.submittedAt as Date) } : null });
});

protocolRouter.put('/services/:sid/report', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = reportBody.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Keep each part under 2000 characters');
  const x = await serviceCtx(String(req.params.sid));
  if (!x || !publishedCtx(x)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!isLeaderOf(x.c, x.svc.id, me)) return fail(res, 403, 'FORBIDDEN', 'Only the team leader writes the report');
  if (x.svc.date > today()) return fail(res, 409, 'FUTURE', 'That service has not happened yet');
  const found = ((await prisma.protocolServiceReport.findMany()) as Array<{ id: string; serviceId: string }>).find((r) => r.serviceId === x.svc.id);
  const data = { ...parsed.data, authorId: me, submittedAt: new Date() };
  if (found) await prisma.protocolServiceReport.update({ where: { id: found.id }, data });
  else await prisma.protocolServiceReport.create({ data: { serviceId: x.svc.id, monthKey: x.c.month, ...data } });
  res.json({ ok: true });
});

/** Deacon and Protocol's officers read the reports of a month. */
protocolRouter.get('/reports', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  if (!canReadReports(me, data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const month = String(req.query.month ?? today().slice(0, 7));
  if (!isMonth(month)) return fail(res, 400, 'BAD_MONTH', 'Use YYYY-MM');
  const c = await monthCtx(month);
  const rows = ((await prisma.protocolServiceReport.findMany()) as Array<Record<string, string | Date>>).filter((r) => r.monthKey === month);
  const nm = await names(rows.map((r) => String(r.authorId)));
  res.json({
    month,
    reports: rows.map((r) => {
      const s = c.services.find((x) => x.id === r.serviceId);
      return { serviceId: r.serviceId, date: s?.date ?? '', kind: s?.kind ?? '', label: s?.label ?? '', author: nm.get(String(r.authorId)) ?? '', challenges: r.challenges, solutions: r.solutions, issues: r.issues, recommendations: r.recommendations, submittedAt: iso(r.submittedAt as Date) };
    }).sort((a, b) => String(a.date).localeCompare(String(b.date))),
  });
});

