/**
 * Full work (slice 3.3): plans that go through approval, set-up, running, closing and a published
 * report. Visibility uses the same four levels as light work. Delete is soft and only for drafts;
 * after submission a plan is cancelled with a reason instead, so its record stays.
 */
import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { liveHoldings } from '../capabilities/engine.js';
import { notifySafely } from '../lib/notify.js';
import { NOTE_MAX, TEXT_MAX, TITLE_MAX, VISIBILITIES, canSee } from '../work/rules.js';
import {
  CHECKS_MAX, ROLE_MAX, TEAM_MAX, approversOf, asWorkRow, buildLevels, canApprove, canComposeReport, canManagePlan, canPublishReport,
  canWritePlan, currentLevel, descendantsOf, indicatorPercent, isOnTeam, levelsOf, parentProblem, parseJson, publishProblem, stateProblem, teamOf, typeProblem, type Action, type Level, type PlanRow,
} from '../work/plan.js';

export const workPlansRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const iso = (v: Date | string | null | undefined) => (v ? (v instanceof Date ? v : new Date(v)).toISOString() : null);

const PLAN_TYPES = ['PROGRAM', 'EVENT', 'PROJECT'] as const;

/** The answers the named screens may hold, by key. Anything else is refused, so the column cannot become a dumping ground. */
const DETAIL_KEYS = ['eventKind', 'outcomes', 'startTime', 'endTime', 'agenda', 'resources'] as const;
const DETAIL_MAX = 2000;
const detailsOf = (p: { detailsJson?: string | null }): Record<string, string> => {
  const v = parseJson<Record<string, unknown>>(p.detailsJson, {});
  return Object.fromEntries(DETAIL_KEYS.filter((k) => typeof v[k] === 'string').map((k) => [k, v[k] as string]));
};

interface Plan extends PlanRow {
  planType?: string | null;
  aim?: string | null; needs?: string | null; location?: string | null; startsOn?: Date | string | null; endsOn?: Date | string | null;
  rejectedReason?: string | null; cancelReason?: string | null; planningSummary?: string | null; executionSummary?: string | null;
  parentId?: string | null; steeringJson?: string | null; detailsJson?: string | null; registrationOpen?: boolean | null; capacity?: number | null; publicToken?: string | null;
  outcome?: string | null; reportComposedAt?: Date | string | null; reportPublishedAt?: Date | string | null; deletedById?: string | null;
}
interface NoteRow { id: string; planId: string; authorId: string; text: string; createdAt: Date | string }
interface CheckRow { id: string; planId: string; label: string; done: boolean; doneById?: string | null; doneAt?: Date | string | null }
interface MilestoneRow { id: string; planId: string; title: string; dueOn?: Date | string | null; done: boolean; doneAt?: Date | string | null }
interface RegRow {
  id: string; planId: string; personId?: string | null; name: string; phone?: string | null; source: string;
  attended: boolean; attendedAt?: Date | string | null; cancelledAt?: Date | string | null; createdAt: Date | string;
}
interface ReviewRow { id: string; planId: string; heldOn: Date | string; summary: string; decision: string; createdById: string }
interface IndicatorRow { id: string; planId: string; name: string; unit: string; target: number }
interface MeasureRow { id: string; indicatorId: string; planId: string; value: number; note?: string | null; byId: string; at: Date | string }
interface UnitRow { id: string; name: string; systemId?: string | null }

async function names(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (!uniq.length) return out;
  const rows = (await prisma.person.findMany({ where: { id: { in: uniq } } })) as Array<{ id: string; fullName: string }>;
  for (const p of rows) out.set(p.id, p.fullName);
  return out;
}

async function audit(actorId: string, systemId: string, action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({
    data: { at: new Date(), actorId, systemId, action, resource: 'MISSION', detail, metaJson: JSON.stringify(meta) },
  });
}

async function ctx(me: string) {
  const { data, units } = await loadAccessData(me);
  return { data, units: units as UnitRow[] };
}
type Ctx = Awaited<ReturnType<typeof ctx>>;

const isAdministrator = (me: string, c: Ctx) => liveHoldings(me, c.data, new Date()).some((h) => h.via === 'OFFICE' && h.office === 'ADMINISTRATOR');

async function systemName(systemId: string): Promise<string> {
  const s = (await prisma.churchSystem.findUnique({ where: { id: systemId } })) as { shortName?: string; name?: string } | null;
  return s?.shortName ?? s?.name ?? systemId;
}

const checksOf = async (planId: string) => ((await prisma.workPlanCheck.findMany()) as CheckRow[]).filter((c) => c.planId === planId);
const notesOf = async (planId: string) =>
  ((await prisma.workPlanNote.findMany()) as NoteRow[]).filter((n) => n.planId === planId).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

const DECISIONS = ['CONTINUE', 'ADJUST', 'CONCLUDE'] as const;
const INDICATORS_MAX = 20;
const reviewsOf = async (planId: string) =>
  ((await prisma.workPlanReview.findMany()) as ReviewRow[]).filter((r) => r.planId === planId).sort((a, b) => new Date(b.heldOn).getTime() - new Date(a.heldOn).getTime());
const indicatorsOf = async (planId: string) => ((await prisma.workPlanIndicator.findMany()) as IndicatorRow[]).filter((i) => i.planId === planId);
const measuresOf = async (planId: string) =>
  ((await prisma.workPlanMeasure.findMany()) as MeasureRow[]).filter((m) => m.planId === planId).sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
const MILESTONES_MAX = 30;
const REGISTRATIONS_MAX = 2000;
const milestonesOf = async (planId: string) =>
  ((await prisma.workPlanMilestone.findMany()) as MilestoneRow[]).filter((m) => m.planId === planId).sort((a, b) => {
    const x = a.dueOn ? new Date(a.dueOn).getTime() : Infinity;
    const y = b.dueOn ? new Date(b.dueOn).getTime() : Infinity;
    return x - y;
  });
export const registrationsOf = async (planId: string) =>
  ((await prisma.workPlanRegistration.findMany()) as RegRow[])
    .filter((r) => r.planId === planId && !r.cancelledAt)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
/** Places left, or null when there is no limit. */
export const spotsLeft = (capacity: number | null | undefined, taken: number) => (capacity ? Math.max(0, capacity - taken) : null);

function flags(p: Plan, c: Ctx, me: string) {
  const manage = canManagePlan(p, me, c.data);
  const team = isOnTeam(p, me);
  const live = ['RUNNING', 'PAUSED', 'CLOSING'].includes(p.status);
  const type = p.planType ?? 'PROJECT';
  return {
    canEdit: manage && p.status === 'DRAFT',
    canSubmit: manage && p.status === 'DRAFT',
    canWithdraw: manage && p.status === 'PENDING_APPROVAL',
    canApprove: canApprove(p, me, c.data),
    canReopen: manage && p.status === 'SETUP',
    canStart: manage && p.status === 'SETUP',
    canClose: manage && p.status === 'RUNNING',
    canPause: manage && p.status === 'RUNNING' && !typeProblem('pause', type),
    canResume: manage && p.status === 'PAUSED' && !typeProblem('resume', type),
    canRenew: manage && p.status === 'CLOSING' && !typeProblem('renew', type),
    canCancel: manage && !['ENDED', 'CANCELLED'].includes(p.status),
    canDelete: manage && p.status === 'DRAFT',
    canNote: (manage || team) && live,
    canCheck: (manage || team) && live,
    canAddCheck: manage && ['DRAFT', 'SETUP', 'RUNNING', 'PAUSED'].includes(p.status),
    canManageRegistration: manage && type === 'EVENT' && ['SETUP', 'RUNNING'].includes(p.status),
    canMarkAttendance: (manage || team) && type === 'EVENT' && ['RUNNING', 'CLOSING'].includes(p.status),
    canMilestone: manage && type === 'PROJECT' && ['DRAFT', 'SETUP', 'RUNNING', 'PAUSED'].includes(p.status),
    canTickMilestone: (manage || team) && type === 'PROJECT' && live,
    canLink: manage && type !== 'PROGRAM' && !['ENDED', 'CANCELLED'].includes(p.status),
    canGovern: manage && type === 'PROGRAM' && !['ENDED', 'CANCELLED'].includes(p.status),
    canReview: manage && type === 'PROGRAM' && ['RUNNING', 'PAUSED', 'CLOSING'].includes(p.status),
    canMeasure: (manage || team) && type === 'PROGRAM' && live,
    canCompose: p.status === 'CLOSING' && canComposeReport(me, p.systemId, c.data),
    canPublish: p.status === 'CLOSING' && canPublishReport(me, p.systemId, c.data),
  };
}

function registrationView(p: Plan, regs: RegRow[], who: Map<string, string>, me: string, fl: ReturnType<typeof flags>) {
  const mine = regs.find((r) => r.personId === me) ?? null;
  const staff = fl.canManageRegistration || fl.canMarkAttendance || canSeeList(p, me);
  const open = !!p.registrationOpen && ['SETUP', 'RUNNING'].includes(p.status);
  const left = spotsLeft(p.capacity, regs.length);
  return {
    open, capacity: p.capacity ?? null, count: regs.length, attended: regs.filter((r) => r.attended).length, spotsLeft: left,
    canRegister: open && !mine && left !== 0,
    mine: mine ? { id: mine.id } : null,
    publicToken: fl.canManageRegistration ? p.publicToken ?? null : null,
    items: staff
      ? regs.map((r) => ({ id: r.id, name: r.personId ? who.get(r.personId) ?? r.name : r.name, phone: r.phone ?? '', source: r.source, attended: r.attended }))
      : [],
  };
}
const canSeeList = (p: Plan, me: string) => isOnTeam(p, me) || p.leaderPersonId === me;

type Brief = { id: string; title: string; planType: string; status: string };
const brief = (r: Plan): Brief => ({ id: r.id, title: r.title, planType: r.planType ?? 'PROJECT', status: r.status });

/** The plan above and the plans below, only those this person may see. */
async function familyOf(p: Plan, c: Ctx, me: string): Promise<{ parent: Brief | null; children: Brief[] }> {
  const all = (await prisma.workPlan.findMany()) as Plan[];
  const seeable = (r: Plan) => !r.deletedAt && canSee(asWorkRow(r), me, c.data);
  const parent = p.parentId ? all.find((r) => r.id === p.parentId && seeable(r)) : undefined;
  return { parent: parent ? brief(parent) : null, children: all.filter((r) => r.parentId === p.id && seeable(r)).map(brief) };
}

async function programView(p: Plan, c: Ctx, me: string) {
  const [reviews, inds, meas] = [await reviewsOf(p.id), await indicatorsOf(p.id), await measuresOf(p.id)];
  const steering = (() => { try { return JSON.parse(p.steeringJson || '[]') as Array<{ personId: string; role: string }>; } catch { return []; } })();
  const who = await names([...steering.map((x) => x.personId), ...reviews.map((r) => r.createdById), ...meas.map((m) => m.byId)]);
  void c; void me;
  return {
    steering: steering.map((x) => ({ personId: x.personId, name: who.get(x.personId) ?? '', role: x.role })),
    reviews: reviews.map((r) => ({ id: r.id, heldOn: iso(r.heldOn), summary: r.summary, decision: r.decision, byName: who.get(r.createdById) ?? '' })),
    indicators: inds.map((i) => {
      const mine = meas.filter((m) => m.indicatorId === i.id);
      const current = mine.length ? mine[mine.length - 1]!.value : null;
      return {
        id: i.id, name: i.name, unit: i.unit, target: i.target, current, percent: indicatorPercent(current, i.target),
        readings: mine.slice(-6).map((m) => ({ value: m.value, at: iso(m.at), note: m.note ?? '', byName: who.get(m.byId) ?? '' })),
      };
    }),
  };
}

async function shape(p: Plan, c: Ctx, me: string, detail: boolean) {
  const team = teamOf(p);
  const levels = levelsOf(p);
  const [notes, checks] = detail ? [await notesOf(p.id), await checksOf(p.id)] : [[], []];
  const fl = flags(p, c, me);
  const type = p.planType ?? 'PROJECT';
  const milestones = detail && type === 'PROJECT' ? await milestonesOf(p.id) : [];
  const regs = detail && type === 'EVENT' ? await registrationsOf(p.id) : [];
  const family = detail ? await familyOf(p, c, me) : { parent: null, children: [] };
  const program = detail && type === 'PROGRAM' ? await programView(p, c, me) : null;
  const who = await names([...regs.map((r) => r.personId), p.leaderPersonId, p.createdById, ...team.map((t) => t.personId), ...levels.map((l) => l.byId), ...notes.map((n) => n.authorId)]);
  const base = {
    id: p.id, title: p.title, status: p.status, systemId: p.systemId, orgUnitId: p.orgUnitId,
    unitName: c.units.find((u) => u.id === p.orgUnitId)?.name ?? '',
    leaderId: p.leaderPersonId, leaderName: who.get(p.leaderPersonId) ?? '',
    startsOn: iso(p.startsOn), endsOn: iso(p.endsOn), visibility: p.visibility, beyondUnit: p.beyondUnit, planType: p.planType ?? 'PROJECT',
    mine: isOnTeam(p, me), waitingLevel: currentLevel(p)?.label ?? null, ...fl,
  };
  if (!detail) return base;
  return {
    ...base,
    aim: p.aim ?? '', needs: p.needs ?? '', location: p.location ?? '', details: detailsOf(p),
    team: team.map((t) => ({ personId: t.personId, name: who.get(t.personId) ?? '', role: t.role })),
    createdByName: who.get(p.createdById) ?? '',
    levels: levels.map((l) => ({ levelKey: l.levelKey, label: l.label, status: l.status, byName: l.byId ? who.get(l.byId) ?? '' : null, at: l.at, note: l.note })),
    rejectedReason: p.rejectedReason ?? null, cancelReason: p.cancelReason ?? null,
    notes: notes.map((n) => ({ id: n.id, authorName: who.get(n.authorId) ?? '', text: n.text, at: iso(n.createdAt) })),
    checks: checks.map((k) => ({ id: k.id, label: k.label, done: k.done, doneAt: iso(k.doneAt) })),
    report: {
      planningSummary: p.planningSummary ?? '', executionSummary: p.executionSummary ?? '', outcome: p.outcome ?? '',
      composedAt: iso(p.reportComposedAt), publishedAt: iso(p.reportPublishedAt), frozen: !!p.reportJson,
    },
    milestones: milestones.map((m) => ({ id: m.id, title: m.title, dueOn: iso(m.dueOn), done: m.done, doneAt: iso(m.doneAt) })),
    parent: family.parent, children: family.children, program,
    registration: type === 'EVENT' ? registrationView(p, regs, who, me, fl) : null,
  };
}

const fields = {
  title: z.string().trim().min(1).max(TITLE_MAX),
  aim: z.string().trim().max(TEXT_MAX).default(''),
  needs: z.string().trim().max(TEXT_MAX).nullish(),
  location: z.string().trim().max(TITLE_MAX).nullish(),
  startsOn: z.string().datetime().nullish(),
  endsOn: z.string().datetime().nullish(),
  leaderId: z.string().min(1),
  team: z.array(z.object({ personId: z.string().min(1), role: z.string().trim().min(1).max(ROLE_MAX) })).max(TEAM_MAX).default([]),
  beyondUnit: z.boolean().default(false),
  visibility: z.enum(VISIBILITIES).default('SYSTEM'),
  planType: z.enum(PLAN_TYPES).default('PROJECT'),
  parentId: z.string().min(1).nullish(),
};

async function peopleProblem(ids: string[]): Promise<boolean> {
  for (const id of ids) {
    const p = (await prisma.person.findUnique({ where: { id } })) as { status?: string } | null;
    if (!p || (p.status && p.status !== 'ACTIVE')) return true;
  }
  return false;
}
const datesProblem = (a?: string | null, b?: string | null) => !!a && !!b && new Date(b).getTime() < new Date(a).getTime();

/** A parent must be of the right kind, in the same system, visible to the person, still alive, and never the plan itself or one of its own descendants. */
async function parentCheck(childType: string, parentId: string, systemId: string, me: string, c: Ctx, selfId: string | null): Promise<'BAD_PARENT' | null> {
  const all = (await prisma.workPlan.findMany()) as Plan[];
  const par = all.find((r) => r.id === parentId && !r.deletedAt);
  if (!par || par.systemId !== systemId || !canSee(asWorkRow(par), me, c.data)) return 'BAD_PARENT';
  if (['CANCELLED', 'ENDED'].includes(par.status)) return 'BAD_PARENT';
  if (selfId && (par.id === selfId || descendantsOf(selfId, all).includes(par.id))) return 'BAD_PARENT';
  return parentProblem(childType, par.planType);
}

workPlansRouter.get('/options', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const c = await ctx(me);
  res.json({
    units: c.units.filter((u) => u.systemId && canWritePlan(me, u.systemId, c.data)).map((u) => ({ id: u.id, name: u.name, systemId: u.systemId! })),
    visibilities: VISIBILITIES,
    limits: { titleMax: TITLE_MAX, textMax: TEXT_MAX, noteMax: NOTE_MAX, teamMax: TEAM_MAX, roleMax: ROLE_MAX, checksMax: CHECKS_MAX },
  });
});

workPlansRouter.get('/deleted', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const c = await ctx(me);
  if (!isAdministrator(me, c)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const rows = ((await prisma.workPlan.findMany()) as Plan[]).filter((r) => !!r.deletedAt).slice(0, 200);
  const who = await names(rows.flatMap((r) => [r.leaderPersonId, r.deletedById]));
  res.json({
    items: rows.map((r) => ({
      id: r.id, title: r.title, status: r.status, systemId: r.systemId, unitName: c.units.find((u) => u.id === r.orgUnitId)?.name ?? '',
      ownerName: who.get(r.leaderPersonId) ?? '', deletedAt: iso(r.deletedAt), deletedByName: who.get(r.deletedById ?? '') ?? '',
    })),
  });
});

workPlansRouter.post('/:id/restore', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const c = await ctx(me);
  if (!isAdministrator(me, c)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const p = (await prisma.workPlan.findUnique({ where: { id: String(req.params.id) } })) as Plan | null;
  if (!p || !p.deletedAt) return fail(res, 404, 'NOT_FOUND', 'Not found');
  await prisma.workPlan.update({ where: { id: p.id }, data: { deletedAt: null, deletedById: null } });
  await audit(me, p.systemId, 'WORKPLAN_RESTORED', `Restored “${p.title}”`, { planId: p.id });
  res.json({ ok: true });
});

workPlansRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const c = await ctx(me);
  const q = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : '');
  const view = q('view') === 'all' ? 'all' : 'mine';
  const status = q('status') || 'open';
  const text = q('q').trim().toLowerCase();
  const rows = ((await prisma.workPlan.findMany()) as Plan[])
    .filter((p) => canSee(asWorkRow(p), me, c.data))
    .filter((p) => !q('systemId') || p.systemId === q('systemId'))
    .filter((p) => !q('type') || (p.planType ?? 'PROJECT') === q('type'))
    .filter((p) => view === 'all' || isOnTeam(p, me))
    .filter((p) => (status === 'open' ? !['ENDED', 'CANCELLED'].includes(p.status) : status === 'all' || p.status === status))
    .filter((p) => !text || p.title.toLowerCase().includes(text))
    .slice(0, 300);
  res.json({ items: await Promise.all(rows.map((p) => shape(p, c, me, false))) });
});

async function visible(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const c = await ctx(me);
  const p = (await prisma.workPlan.findUnique({ where: { id: String(req.params.id) } })) as Plan | null;
  if (!p || !canSee(asWorkRow(p), me, c.data)) {
    fail(res, 404, 'NOT_FOUND', 'Plan not found');
    return null;
  }
  return { me, c, p };
}

workPlansRouter.get('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  res.json({ plan: await shape(got.p, got.c, got.me, true) });
});

workPlansRouter.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  // The leader is optional on a new plan: the person writing it leads it until another is chosen.
  const parsed = z.object({ ...fields, leaderId: z.string().min(1).optional(), unitId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid plan');
  const b = { ...parsed.data, leaderId: parsed.data.leaderId ?? me };
  const c = await ctx(me);
  const unit = c.units.find((u) => u.id === b.unitId);
  if (!unit) return fail(res, 404, 'NOT_FOUND', 'Unit not found');
  if (!unit.systemId) return fail(res, 400, 'UNIT_HAS_NO_SYSTEM', 'This unit has no system yet');
  if (!canWritePlan(me, unit.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not plan work here');
  if (datesProblem(b.startsOn, b.endsOn)) return fail(res, 400, 'BAD_DATES', 'The end must not be before the start');
  if (await peopleProblem([b.leaderId, ...b.team.map((t) => t.personId)])) return fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose people who are active members');
  if (b.parentId) {
    const bad = await parentCheck(b.planType, b.parentId, unit.systemId, me, c, null);
    if (bad) return fail(res, 400, bad, 'That plan cannot be the parent');
  }
  const row = (await prisma.workPlan.create({
    data: {
      parentId: b.parentId || null, orgUnitId: unit.id, systemId: unit.systemId, title: b.title, aim: b.aim, needs: b.needs || null, location: b.location || null,
      startsOn: b.startsOn ? new Date(b.startsOn) : null, endsOn: b.endsOn ? new Date(b.endsOn) : null, leaderPersonId: b.leaderId,
      teamJson: JSON.stringify(b.team), beyondUnit: b.beyondUnit, visibility: b.visibility, planType: b.planType, status: 'DRAFT', approvalsJson: '[]', createdById: me,
    },
  })) as Plan;
  await audit(me, unit.systemId, 'WORKPLAN_CREATED', `Drafted “${row.title}”`, { planId: row.id });
  res.status(201).json({ plan: await shape(row, c, me, true) });
});

workPlansRouter.patch('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (!canManagePlan(p, me, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not change this plan');
  if (stateProblem('edit', p.status)) return fail(res, 409, 'PLAN_LOCKED', 'Only a draft can be changed. Reopen it first.');
  const parsed = z.object({ ...fields, planType: z.enum(PLAN_TYPES).optional() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid plan');
  const b = parsed.data;
  if (datesProblem(b.startsOn, b.endsOn)) return fail(res, 400, 'BAD_DATES', 'The end must not be before the start');
  if (await peopleProblem([b.leaderId, ...b.team.map((t) => t.personId)])) return fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose people who are active members');
  const row = (await prisma.workPlan.update({
    where: { id: p.id },
    data: {
      title: b.title, aim: b.aim, needs: b.needs || null, location: b.location || null, startsOn: b.startsOn ? new Date(b.startsOn) : null,
      endsOn: b.endsOn ? new Date(b.endsOn) : null, leaderPersonId: b.leaderId, teamJson: JSON.stringify(b.team), beyondUnit: b.beyondUnit, visibility: b.visibility,
      planType: b.planType ?? p.planType ?? 'PROJECT',
    },
  })) as Plan;
  await audit(me, p.systemId, 'WORKPLAN_EDITED', `Edited “${row.title}”`, { planId: p.id });
  res.json({ plan: await shape(row, c, me, true) });
});

workPlansRouter.put('/:id/details', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (!canManagePlan(p, me, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not change this plan');
  if (stateProblem('edit', p.status)) return fail(res, 409, 'PLAN_LOCKED', 'Only a draft can be changed. Reopen it first.');
  const shape1 = Object.fromEntries(DETAIL_KEYS.map((k) => [k, z.string().trim().max(DETAIL_MAX).optional()]));
  const parsed = z.object({ details: z.object(shape1).strict() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid details');
  const next = { ...detailsOf(p), ...Object.fromEntries(Object.entries(parsed.data.details).filter(([, v]) => v !== undefined)) };
  const row = (await prisma.workPlan.update({ where: { id: p.id }, data: { detailsJson: JSON.stringify(next) } })) as Plan;
  await audit(me, p.systemId, 'WORKPLAN_EDITED', `Updated the details of “${row.title}”`, { planId: p.id });
  res.json({ plan: await shape(row, c, me, true) });
});

workPlansRouter.delete('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (!canManagePlan(p, me, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not delete this plan');
  if (stateProblem('delete', p.status)) return fail(res, 409, 'PLAN_LOCKED', 'Only a draft can be deleted. Cancel it instead.');
  await prisma.workPlan.update({ where: { id: p.id }, data: { deletedAt: new Date(), deletedById: me } });
  await audit(me, p.systemId, 'WORKPLAN_DELETED', `Deleted “${p.title}”`, { planId: p.id });
  res.json({ ok: true });
});

async function askApprovers(p: Plan, c: Ctx, me: string, why: string) {
  const level = currentLevel(p);
  if (!level) return;
  for (const id of approversOf(p, c.data).filter((x) => x !== me)) {
    await notifySafely(prisma as never, {
      kind: 'WAITING_FOR_ME', toPersonId: id, systemId: p.systemId, title: `${why}: ${p.title}`, body: level.label,
      href: `/s/${p.systemId}/work/plans/${p.id}`, important: true, sourceKey: `plan-ask:${p.id}:${level.levelKey}:${id}`,
    });
  }
}
const tellOne = (to: string, p: Plan, title: string, key: string) =>
  notifySafely(prisma as never, { kind: 'FOR_INFORMATION', toPersonId: to, systemId: p.systemId, title, href: `/s/${p.systemId}/work/plans/${p.id}`, sourceKey: key });

type Step = { action: Action; allow: (p: Plan, me: string, c: Ctx) => boolean };

/** One handler for the simple moves; the status each one leads to, and what it records. */
async function move(req: AuthedRequest, res: Res, step: Step, apply: (p: Plan, me: string, c: Ctx) => Promise<unknown>) {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (!step.allow(p, me, c)) return fail(res, 403, 'FORBIDDEN', 'You may not do this');
  if (stateProblem(step.action, p.status) || typeProblem(step.action, p.planType)) return fail(res, 409, 'WRONG_STATE', 'Not possible in the plan’s current state');
  await apply(p, me, c);
  const row = (await prisma.workPlan.findUnique({ where: { id: p.id } })) as Plan;
  await audit(me, p.systemId, `WORKPLAN_${step.action.toUpperCase()}`, `${step.action} “${p.title}”`, { planId: p.id });
  res.json({ plan: await shape(row, c, me, true) });
}
const managers: Step['allow'] = (p, me, c) => canManagePlan(p, me, c.data);

workPlansRouter.post('/:id/submit', requireAuth, (req: AuthedRequest, res) =>
  move(req, res, { action: 'submit', allow: managers }, async (p, me, c) => {
    const levels = buildLevels(p.systemId, p.beyondUnit, await systemName(p.systemId), p.planType ?? 'PROJECT');
    // Nothing to approve (an event within its unit): the plan goes straight to set-up.
    if (levels.length === 0) {
      await prisma.workPlan.update({ where: { id: p.id }, data: { status: 'SETUP', approvalsJson: '[]', rejectedReason: null } });
      return;
    }
    const row = (await prisma.workPlan.update({ where: { id: p.id }, data: { status: 'PENDING_APPROVAL', approvalsJson: JSON.stringify(levels), rejectedReason: null } })) as Plan;
    await askApprovers(row, c, me, 'Plan to approve');
  }),
);

workPlansRouter.post('/:id/withdraw', requireAuth, (req: AuthedRequest, res) =>
  move(req, res, { action: 'withdraw', allow: managers }, async (p) => {
    await prisma.workPlan.update({ where: { id: p.id }, data: { status: 'DRAFT', approvalsJson: '[]' } });
  }),
);

workPlansRouter.post('/:id/reopen', requireAuth, (req: AuthedRequest, res) =>
  move(req, res, { action: 'reopen', allow: managers }, async (p) => {
    await prisma.workPlan.update({ where: { id: p.id }, data: { status: 'DRAFT', approvalsJson: '[]' } });
  }),
);

workPlansRouter.post('/:id/approve', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (p.status !== 'PENDING_APPROVAL') return fail(res, 409, 'WRONG_STATE', 'This plan is not waiting for approval');
  if (p.createdById === me) return fail(res, 403, 'OWN_ENTRY', 'Nobody approves their own plan');
  if (!canApprove(p, me, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not approve at this level');
  const note = z.object({ note: z.string().trim().max(NOTE_MAX).nullish() }).safeParse(req.body ?? {});
  const levels = levelsOf(p);
  const idx = levels.findIndex((l) => l.status === 'PENDING');
  levels[idx] = { ...levels[idx], status: 'APPROVED', byId: me, at: new Date().toISOString(), note: (note.success && note.data.note) || null };
  const done = levels.every((l) => l.status === 'APPROVED');
  const row = (await prisma.workPlan.update({ where: { id: p.id }, data: { approvalsJson: JSON.stringify(levels), status: done ? 'SETUP' : 'PENDING_APPROVAL' } })) as Plan;
  if (done) {
    for (const to of new Set([p.createdById, p.leaderPersonId, ...teamOf(p).map((t) => t.personId)].filter((x) => x !== me)))
      await tellOne(to, p, `Approved: ${p.title}`, `plan-approved:${p.id}:${to}`);
  } else await askApprovers(row, c, me, 'Plan to approve');
  await audit(me, p.systemId, 'WORKPLAN_APPROVED', `Approved “${p.title}” (${levels[idx].label})`, { planId: p.id, level: levels[idx].levelKey });
  res.json({ plan: await shape(row, c, me, true) });
});

workPlansRouter.post('/:id/reject', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (p.status !== 'PENDING_APPROVAL') return fail(res, 409, 'WRONG_STATE', 'This plan is not waiting for approval');
  if (p.createdById === me) return fail(res, 403, 'OWN_ENTRY', 'Nobody decides on their own plan');
  if (!canApprove(p, me, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not decide at this level');
  const parsed = z.object({ reason: z.string().trim().min(1).max(NOTE_MAX) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'REASON_REQUIRED', 'Please give a reason');
  const row = (await prisma.workPlan.update({ where: { id: p.id }, data: { status: 'DRAFT', approvalsJson: '[]', rejectedReason: parsed.data.reason } })) as Plan;
  await tellOne(p.createdById, p, `Sent back: ${p.title}`, `plan-rejected:${p.id}:${Date.now()}`);
  await audit(me, p.systemId, 'WORKPLAN_REJECTED', `Sent back “${p.title}”`, { planId: p.id, reason: parsed.data.reason });
  res.json({ plan: await shape(row, c, me, true) });
});

workPlansRouter.post('/:id/start', requireAuth, (req: AuthedRequest, res) =>
  move(req, res, { action: 'start', allow: managers }, async (p, me) => {
    await prisma.workPlan.update({ where: { id: p.id }, data: { status: 'RUNNING' } });
    for (const to of new Set(teamOf(p).map((t) => t.personId).filter((x) => x !== me))) await tellOne(to, p, `Started: ${p.title}`, `plan-started:${p.id}:${to}`);
  }),
);

workPlansRouter.post('/:id/close', requireAuth, (req: AuthedRequest, res) =>
  move(req, res, { action: 'close', allow: managers }, async (p) => {
    await prisma.workPlan.update({ where: { id: p.id }, data: { status: 'CLOSING' } });
  }),
);

/** Holding and resuming a project or program; renewing a program after its review. */
workPlansRouter.post('/:id/pause', requireAuth, (req: AuthedRequest, res) =>
  move(req, res, { action: 'pause', allow: managers }, async (p) => {
    await prisma.workPlan.update({ where: { id: p.id }, data: { status: 'PAUSED' } });
  }),
);
workPlansRouter.post('/:id/resume', requireAuth, (req: AuthedRequest, res) =>
  move(req, res, { action: 'resume', allow: managers }, async (p) => {
    await prisma.workPlan.update({ where: { id: p.id }, data: { status: 'RUNNING' } });
  }),
);
workPlansRouter.post('/:id/renew', requireAuth, (req: AuthedRequest, res) =>
  move(req, res, { action: 'renew', allow: managers }, async (p) => {
    await prisma.workPlan.update({ where: { id: p.id }, data: { status: 'RUNNING' } });
  }),
);

workPlansRouter.post('/:id/cancel', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (!canManagePlan(p, me, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not cancel this plan');
  if (stateProblem('cancel', p.status)) return fail(res, 409, 'WRONG_STATE', 'Not possible in the plan’s current state');
  const parsed = z.object({ reason: z.string().trim().min(1).max(NOTE_MAX) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'REASON_REQUIRED', 'Please give a reason');
  const row = (await prisma.workPlan.update({ where: { id: p.id }, data: { status: 'CANCELLED', cancelReason: parsed.data.reason } })) as Plan;
  await audit(me, p.systemId, 'WORKPLAN_CANCELLED', `Cancelled “${p.title}”`, { planId: p.id, reason: parsed.data.reason });
  res.json({ plan: await shape(row, c, me, true) });
});

/* ── Execution: notes and the delivery checklist ── */

workPlansRouter.post('/:id/notes', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (!flags(p, c, me).canNote) return fail(res, 403, 'FORBIDDEN', 'Only the team adds notes, while the work is running');
  const parsed = z.object({ text: z.string().trim().min(1).max(NOTE_MAX) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Write a note first');
  await prisma.workPlanNote.create({ data: { planId: p.id, authorId: me, text: parsed.data.text } });
  res.status(201).json({ plan: await shape(p, c, me, true) });
});

workPlansRouter.post('/:id/checks', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (!flags(p, c, me).canAddCheck) return fail(res, 403, 'FORBIDDEN', 'You may not add checklist items now');
  const parsed = z.object({ label: z.string().trim().min(1).max(TITLE_MAX) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Write the item first');
  if ((await checksOf(p.id)).length >= CHECKS_MAX) return fail(res, 409, 'TOO_MANY', 'The checklist is full');
  await prisma.workPlanCheck.create({ data: { planId: p.id, label: parsed.data.label, done: false } });
  res.status(201).json({ plan: await shape(p, c, me, true) });
});

workPlansRouter.patch('/:id/checks/:checkId', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (!flags(p, c, me).canCheck) return fail(res, 403, 'FORBIDDEN', 'Only the team ticks items, while the work is running');
  const k = ((await checksOf(p.id)).find((x) => x.id === String(req.params.checkId))) ?? null;
  if (!k) return fail(res, 404, 'NOT_FOUND', 'Item not found');
  const parsed = z.object({ done: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid item');
  await prisma.workPlanCheck.update({ where: { id: k.id }, data: { done: parsed.data.done, doneById: parsed.data.done ? me : null, doneAt: parsed.data.done ? new Date() : null } });
  res.json({ plan: await shape(p, c, me, true) });
});

workPlansRouter.delete('/:id/checks/:checkId', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (!flags(p, c, me).canAddCheck) return fail(res, 403, 'FORBIDDEN', 'You may not change the checklist now');
  const k = ((await checksOf(p.id)).find((x) => x.id === String(req.params.checkId))) ?? null;
  if (!k) return fail(res, 404, 'NOT_FOUND', 'Item not found');
  await prisma.workPlanCheck.delete({ where: { id: k.id } });
  res.json({ plan: await shape(p, c, me, true) });
});

/* ── The report: composed in Closing (W), published (P) and frozen ── */

workPlansRouter.put('/:id/report', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (stateProblem('compose', p.status)) return fail(res, 409, 'WRONG_STATE', 'The report is written while the work is closing');
  if (!canComposeReport(me, p.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not write this report');
  const parsed = z
    .object({ planningSummary: z.string().trim().max(TEXT_MAX), executionSummary: z.string().trim().max(TEXT_MAX), outcome: z.string().trim().max(TEXT_MAX) })
    .safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid report');
  const row = (await prisma.workPlan.update({ where: { id: p.id }, data: { ...parsed.data, reportComposedById: me, reportComposedAt: new Date() } })) as Plan;
  await audit(me, p.systemId, 'WORKPLAN_REPORT_COMPOSED', `Wrote the report for “${p.title}”`, { planId: p.id });
  res.json({ plan: await shape(row, c, me, true) });
});

workPlansRouter.post('/:id/publish', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (stateProblem('publish', p.status)) return fail(res, 409, 'WRONG_STATE', 'The report is published while the work is closing');
  if (!canPublishReport(me, p.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not publish this report');
  const checks = await checksOf(p.id);
  const problem = publishProblem(p, checks);
  if (problem) return fail(res, 409, problem, problem === 'CHECKLIST_OPEN' ? 'Finish the checklist first' : 'Write the whole report first');
  const detail = (await shape(p, c, me, true)) as Record<string, unknown>;
  const at = new Date();
  const snapshot = {
    title: p.title, unitName: detail.unitName, aim: detail.aim, needs: detail.needs, location: detail.location, startsOn: detail.startsOn, endsOn: detail.endsOn,
    leaderName: detail.leaderName, team: detail.team, levels: detail.levels, notes: detail.notes, checks: detail.checks,
    planningSummary: p.planningSummary, executionSummary: p.executionSummary, outcome: p.outcome, publishedAt: at.toISOString(),
    milestones: detail.milestones, program: detail.program, children: detail.children, attendance: p.planType === 'EVENT' ? { registered: (detail.registration as { count: number }).count, attended: (detail.registration as { attended: number }).attended } : null,
  };
  const row = (await prisma.workPlan.update({
    where: { id: p.id },
    data: { status: 'ENDED', reportPublishedById: me, reportPublishedAt: at, reportJson: JSON.stringify(snapshot) },
  })) as Plan;
  await audit(me, p.systemId, 'WORKPLAN_REPORT_PUBLISHED', `Published the report for “${p.title}”`, { planId: p.id });
  res.json({ plan: await shape(row, c, me, true) });
});

/* ── Projects: milestones ── */

workPlansRouter.post('/:id/milestones', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (!flags(p, c, me).canMilestone) return fail(res, 403, 'FORBIDDEN', 'You may not add milestones now');
  const parsed = z.object({ title: z.string().trim().min(1).max(TITLE_MAX), dueOn: z.string().datetime().nullish() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Write the milestone first');
  if ((await milestonesOf(p.id)).length >= MILESTONES_MAX) return fail(res, 409, 'TOO_MANY', 'The milestone list is full');
  await prisma.workPlanMilestone.create({ data: { planId: p.id, title: parsed.data.title, dueOn: parsed.data.dueOn ? new Date(parsed.data.dueOn) : null, done: false } });
  res.status(201).json({ plan: await shape(p, c, me, true) });
});

workPlansRouter.patch('/:id/milestones/:mid', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (!flags(p, c, me).canTickMilestone) return fail(res, 403, 'FORBIDDEN', 'Only the team ticks milestones, while the work is running');
  const m = (await milestonesOf(p.id)).find((x) => x.id === String(req.params.mid));
  if (!m) return fail(res, 404, 'NOT_FOUND', 'Milestone not found');
  const parsed = z.object({ done: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid milestone');
  await prisma.workPlanMilestone.update({ where: { id: m.id }, data: { done: parsed.data.done, doneById: parsed.data.done ? me : null, doneAt: parsed.data.done ? new Date() : null } });
  res.json({ plan: await shape(p, c, me, true) });
});

workPlansRouter.delete('/:id/milestones/:mid', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (!flags(p, c, me).canMilestone) return fail(res, 403, 'FORBIDDEN', 'You may not change milestones now');
  const m = (await milestonesOf(p.id)).find((x) => x.id === String(req.params.mid));
  if (!m) return fail(res, 404, 'NOT_FOUND', 'Milestone not found');
  await prisma.workPlanMilestone.delete({ where: { id: m.id } });
  res.json({ plan: await shape(p, c, me, true) });
});

/* ── Events: registration and attendance ── */

async function addRegistration(p: Plan, data: { personId?: string | null; name: string; phone?: string | null; source: string }): Promise<'FULL' | 'DUPLICATE' | 'OK'> {
  const regs = await registrationsOf(p.id);
  if (regs.length >= REGISTRATIONS_MAX) return 'FULL';
  if (spotsLeft(p.capacity, regs.length) === 0) return 'FULL';
  const phone = (data.phone ?? '').replace(/\s+/g, '');
  if (data.personId ? regs.some((r) => r.personId === data.personId) : phone && regs.some((r) => (r.phone ?? '').replace(/\s+/g, '') === phone)) return 'DUPLICATE';
  await prisma.workPlanRegistration.create({ data: { planId: p.id, personId: data.personId ?? null, name: data.name, phone: data.phone || null, source: data.source } });
  return 'OK';
}
const regFailure = (res: Res, r: 'FULL' | 'DUPLICATE') =>
  r === 'FULL' ? fail(res, 409, 'EVENT_FULL', 'There are no places left') : fail(res, 409, 'ALREADY_REGISTERED', 'Already registered');

workPlansRouter.patch('/:id/registration', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (!flags(p, c, me).canManageRegistration) return fail(res, 403, 'FORBIDDEN', 'You may not change registration now');
  const parsed = z
    .object({ open: z.boolean().optional(), capacity: z.number().int().min(1).max(100000).nullable().optional(), publicLink: z.boolean().optional() })
    .safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid registration settings');
  const d = parsed.data;
  const data: Record<string, unknown> = {};
  if (d.open !== undefined) data.registrationOpen = d.open;
  if (d.capacity !== undefined) data.capacity = d.capacity;
  if (d.publicLink === true && !p.publicToken) data.publicToken = randomBytes(18).toString('base64url');
  if (d.publicLink === false) data.publicToken = null;
  const row = (await prisma.workPlan.update({ where: { id: p.id }, data })) as Plan;
  await audit(me, p.systemId, 'WORKPLAN_REGISTRATION_SET', `Changed registration for “${p.title}”`, { planId: p.id, ...d });
  res.json({ plan: await shape(row, c, me, true) });
});

workPlansRouter.post('/:id/register', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if ((p.planType ?? 'PROJECT') !== 'EVENT' || !p.registrationOpen || !['SETUP', 'RUNNING'].includes(p.status)) return fail(res, 409, 'REGISTRATION_CLOSED', 'Registration is not open');
  const who = await names([me]);
  const r = await addRegistration(p, { personId: me, name: who.get(me) ?? '', source: 'MEMBER' });
  if (r !== 'OK') return regFailure(res, r);
  res.status(201).json({ plan: await shape(p, c, me, true) });
});

workPlansRouter.delete('/:id/register', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  const mine = (await registrationsOf(p.id)).find((r) => r.personId === me);
  if (!mine) return fail(res, 404, 'NOT_FOUND', 'You are not registered');
  if (mine.attended) return fail(res, 409, 'ALREADY_ATTENDED', 'Attendance is already marked');
  await prisma.workPlanRegistration.update({ where: { id: mine.id }, data: { cancelledAt: new Date() } });
  res.json({ plan: await shape(p, c, me, true) });
});

workPlansRouter.post('/:id/registrations', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  const f = flags(p, c, me);
  if (!(f.canManageRegistration || f.canMarkAttendance)) return fail(res, 403, 'FORBIDDEN', 'You may not add guests now');
  const parsed = z
    .object({ personId: z.string().min(1).optional(), name: z.string().trim().min(1).max(TITLE_MAX).optional(), phone: z.string().trim().max(30).nullish() })
    .refine((v) => v.personId || v.name)
    .safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Give a member or a name');
  const b = parsed.data;
  if (b.personId && (await peopleProblem([b.personId]))) return fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose an active member');
  const who = b.personId ? await names([b.personId]) : new Map<string, string>();
  const r = await addRegistration(p, { personId: b.personId ?? null, name: b.personId ? who.get(b.personId) ?? '' : b.name!, phone: b.phone, source: 'STAFF' });
  if (r !== 'OK') return regFailure(res, r);
  res.status(201).json({ plan: await shape(p, c, me, true) });
});

workPlansRouter.patch('/:id/registrations/:rid', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (!flags(p, c, me).canMarkAttendance) return fail(res, 403, 'FORBIDDEN', 'Attendance is marked by the team, on the day');
  const r = (await registrationsOf(p.id)).find((x) => x.id === String(req.params.rid));
  if (!r) return fail(res, 404, 'NOT_FOUND', 'Registration not found');
  const parsed = z.object({ attended: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid attendance');
  await prisma.workPlanRegistration.update({ where: { id: r.id }, data: { attended: parsed.data.attended, attendedAt: parsed.data.attended ? new Date() : null } });
  res.json({ plan: await shape(p, c, me, true) });
});

workPlansRouter.delete('/:id/registrations/:rid', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  const f = flags(p, c, me);
  if (!(f.canManageRegistration || f.canMarkAttendance)) return fail(res, 403, 'FORBIDDEN', 'You may not remove registrations now');
  const r = (await registrationsOf(p.id)).find((x) => x.id === String(req.params.rid));
  if (!r) return fail(res, 404, 'NOT_FOUND', 'Registration not found');
  await prisma.workPlanRegistration.update({ where: { id: r.id }, data: { cancelledAt: new Date() } });
  res.json({ plan: await shape(p, c, me, true) });
});

/* ── Optional links between programs, projects and events ── */

workPlansRouter.get('/:id/parent-options', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (!flags(p, c, me).canLink) return res.json({ items: [] });
  const all = (await prisma.workPlan.findMany()) as Plan[];
  const below = descendantsOf(p.id, all);
  const items = all
    .filter((r) => !r.deletedAt && r.systemId === p.systemId && r.id !== p.id && !below.includes(r.id) && !['CANCELLED', 'ENDED'].includes(r.status))
    .filter((r) => canSee(asWorkRow(r), me, c.data) && !parentProblem(p.planType, r.planType))
    .map(brief);
  res.json({ items });
});

workPlansRouter.patch('/:id/parent', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (!flags(p, c, me).canLink) return fail(res, 403, 'FORBIDDEN', 'You may not link this plan now');
  const parsed = z.object({ parentId: z.string().min(1).nullable() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid link');
  if (parsed.data.parentId) {
    const bad = await parentCheck(p.planType ?? 'PROJECT', parsed.data.parentId, p.systemId, me, c, p.id);
    if (bad) return fail(res, 400, bad, 'That plan cannot be the parent');
  }
  const row = (await prisma.workPlan.update({ where: { id: p.id }, data: { parentId: parsed.data.parentId } })) as Plan;
  await audit(me, p.systemId, 'WORKPLAN_LINKED', `${parsed.data.parentId ? 'Linked' : 'Unlinked'} “${p.title}”`, { planId: p.id, parentId: parsed.data.parentId });
  res.json({ plan: await shape(row, c, me, true) });
});

/* ── Programs: steering committee, reviews and indicators ── */

workPlansRouter.put('/:id/steering', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (!flags(p, c, me).canGovern) return fail(res, 403, 'FORBIDDEN', 'You may not change the steering committee');
  const parsed = z.object({ members: z.array(z.object({ personId: z.string().min(1), role: z.string().trim().min(1).max(ROLE_MAX) })).max(TEAM_MAX) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid committee');
  if (await peopleProblem(parsed.data.members.map((m) => m.personId))) return fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose people who are active members');
  const row = (await prisma.workPlan.update({ where: { id: p.id }, data: { steeringJson: JSON.stringify(parsed.data.members) } })) as Plan;
  await audit(me, p.systemId, 'WORKPLAN_STEERING_SET', `Set the steering committee of “${p.title}”`, { planId: p.id });
  res.json({ plan: await shape(row, c, me, true) });
});

workPlansRouter.post('/:id/reviews', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (!flags(p, c, me).canReview) return fail(res, 403, 'FORBIDDEN', 'A review is recorded while the program runs');
  const parsed = z.object({ heldOn: z.string().datetime(), summary: z.string().trim().min(1).max(TEXT_MAX), decision: z.enum(DECISIONS) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Write what the review found and decided');
  await prisma.workPlanReview.create({ data: { planId: p.id, heldOn: new Date(parsed.data.heldOn), summary: parsed.data.summary, decision: parsed.data.decision, createdById: me } });
  await audit(me, p.systemId, 'WORKPLAN_REVIEWED', `Recorded a review of “${p.title}”`, { planId: p.id, decision: parsed.data.decision });
  res.status(201).json({ plan: await shape(p, c, me, true) });
});

workPlansRouter.post('/:id/indicators', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (!flags(p, c, me).canGovern) return fail(res, 403, 'FORBIDDEN', 'You may not add indicators');
  const parsed = z.object({ name: z.string().trim().min(1).max(TITLE_MAX), unit: z.string().trim().max(30).default(''), target: z.number().positive().max(1e12) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Give a name and a target above zero');
  if ((await indicatorsOf(p.id)).length >= INDICATORS_MAX) return fail(res, 409, 'TOO_MANY', 'The indicator list is full');
  await prisma.workPlanIndicator.create({ data: { planId: p.id, name: parsed.data.name, unit: parsed.data.unit, target: parsed.data.target, createdById: me } });
  res.status(201).json({ plan: await shape(p, c, me, true) });
});

workPlansRouter.delete('/:id/indicators/:iid', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (!flags(p, c, me).canGovern) return fail(res, 403, 'FORBIDDEN', 'You may not remove indicators');
  const i = (await indicatorsOf(p.id)).find((x) => x.id === String(req.params.iid));
  if (!i) return fail(res, 404, 'NOT_FOUND', 'Indicator not found');
  await prisma.workPlanIndicator.delete({ where: { id: i.id } });
  res.json({ plan: await shape(p, c, me, true) });
});

workPlansRouter.post('/:id/indicators/:iid/readings', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, p } = got;
  if (!flags(p, c, me).canMeasure) return fail(res, 403, 'FORBIDDEN', 'Readings are added by the team, while the program runs');
  const i = (await indicatorsOf(p.id)).find((x) => x.id === String(req.params.iid));
  if (!i) return fail(res, 404, 'NOT_FOUND', 'Indicator not found');
  const parsed = z.object({ value: z.number().min(0).max(1e12), note: z.string().trim().max(NOTE_MAX).nullish() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Give a number');
  await prisma.workPlanMeasure.create({ data: { indicatorId: i.id, planId: p.id, value: parsed.data.value, note: parsed.data.note || null, byId: me } });
  res.status(201).json({ plan: await shape(p, c, me, true) });
});
