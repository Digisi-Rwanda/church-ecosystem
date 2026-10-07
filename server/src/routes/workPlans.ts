/**
 * Full work (slice 3.3): plans that go through approval, set-up, running, closing and a published
 * report. Visibility uses the same four levels as light work. Delete is soft and only for drafts;
 * after submission a plan is cancelled with a reason instead, so its record stays.
 */
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
  canWritePlan, currentLevel, isOnTeam, levelsOf, publishProblem, stateProblem, teamOf, type Action, type Level, type PlanRow,
} from '../work/plan.js';

export const workPlansRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const iso = (v: Date | string | null | undefined) => (v ? (v instanceof Date ? v : new Date(v)).toISOString() : null);

const PLAN_TYPES = ['PROGRAM', 'EVENT', 'PROJECT'] as const;

interface Plan extends PlanRow {
  planType?: string | null;
  aim?: string | null; needs?: string | null; location?: string | null; startsOn?: Date | string | null; endsOn?: Date | string | null;
  rejectedReason?: string | null; cancelReason?: string | null; planningSummary?: string | null; executionSummary?: string | null;
  outcome?: string | null; reportComposedAt?: Date | string | null; reportPublishedAt?: Date | string | null; deletedById?: string | null;
}
interface NoteRow { id: string; planId: string; authorId: string; text: string; createdAt: Date | string }
interface CheckRow { id: string; planId: string; label: string; done: boolean; doneById?: string | null; doneAt?: Date | string | null }
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

function flags(p: Plan, c: Ctx, me: string) {
  const manage = canManagePlan(p, me, c.data);
  const team = isOnTeam(p, me);
  const live = ['RUNNING', 'CLOSING'].includes(p.status);
  return {
    canEdit: manage && p.status === 'DRAFT',
    canSubmit: manage && p.status === 'DRAFT',
    canWithdraw: manage && p.status === 'PENDING_APPROVAL',
    canApprove: canApprove(p, me, c.data),
    canReopen: manage && p.status === 'SETUP',
    canStart: manage && p.status === 'SETUP',
    canClose: manage && p.status === 'RUNNING',
    canCancel: manage && !['ENDED', 'CANCELLED'].includes(p.status),
    canDelete: manage && p.status === 'DRAFT',
    canNote: (manage || team) && live,
    canCheck: (manage || team) && live,
    canAddCheck: manage && ['DRAFT', 'SETUP', 'RUNNING'].includes(p.status),
    canCompose: p.status === 'CLOSING' && canComposeReport(me, p.systemId, c.data),
    canPublish: p.status === 'CLOSING' && canPublishReport(me, p.systemId, c.data),
  };
}

async function shape(p: Plan, c: Ctx, me: string, detail: boolean) {
  const team = teamOf(p);
  const levels = levelsOf(p);
  const [notes, checks] = detail ? [await notesOf(p.id), await checksOf(p.id)] : [[], []];
  const who = await names([p.leaderPersonId, p.createdById, ...team.map((t) => t.personId), ...levels.map((l) => l.byId), ...notes.map((n) => n.authorId)]);
  const base = {
    id: p.id, title: p.title, status: p.status, systemId: p.systemId, orgUnitId: p.orgUnitId,
    unitName: c.units.find((u) => u.id === p.orgUnitId)?.name ?? '',
    leaderId: p.leaderPersonId, leaderName: who.get(p.leaderPersonId) ?? '',
    startsOn: iso(p.startsOn), endsOn: iso(p.endsOn), visibility: p.visibility, beyondUnit: p.beyondUnit, planType: p.planType ?? 'PROJECT',
    mine: isOnTeam(p, me), waitingLevel: currentLevel(p)?.label ?? null, ...flags(p, c, me),
  };
  if (!detail) return base;
  return {
    ...base,
    aim: p.aim ?? '', needs: p.needs ?? '', location: p.location ?? '',
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
};

async function peopleProblem(ids: string[]): Promise<boolean> {
  for (const id of ids) {
    const p = (await prisma.person.findUnique({ where: { id } })) as { status?: string } | null;
    if (!p || (p.status && p.status !== 'ACTIVE')) return true;
  }
  return false;
}
const datesProblem = (a?: string | null, b?: string | null) => !!a && !!b && new Date(b).getTime() < new Date(a).getTime();

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
  const parsed = z.object({ ...fields, unitId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid plan');
  const b = parsed.data;
  const c = await ctx(me);
  const unit = c.units.find((u) => u.id === b.unitId);
  if (!unit) return fail(res, 404, 'NOT_FOUND', 'Unit not found');
  if (!unit.systemId) return fail(res, 400, 'UNIT_HAS_NO_SYSTEM', 'This unit has no system yet');
  if (!canWritePlan(me, unit.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not plan work here');
  if (datesProblem(b.startsOn, b.endsOn)) return fail(res, 400, 'BAD_DATES', 'The end must not be before the start');
  if (await peopleProblem([b.leaderId, ...b.team.map((t) => t.personId)])) return fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose people who are active members');
  const row = (await prisma.workPlan.create({
    data: {
      orgUnitId: unit.id, systemId: unit.systemId, title: b.title, aim: b.aim, needs: b.needs || null, location: b.location || null,
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
  if (stateProblem(step.action, p.status)) return fail(res, 409, 'WRONG_STATE', 'Not possible in the plan’s current state');
  await apply(p, me, c);
  const row = (await prisma.workPlan.findUnique({ where: { id: p.id } })) as Plan;
  await audit(me, p.systemId, `WORKPLAN_${step.action.toUpperCase()}`, `${step.action} “${p.title}”`, { planId: p.id });
  res.json({ plan: await shape(row, c, me, true) });
}
const managers: Step['allow'] = (p, me, c) => canManagePlan(p, me, c.data);

workPlansRouter.post('/:id/submit', requireAuth, (req: AuthedRequest, res) =>
  move(req, res, { action: 'submit', allow: managers }, async (p, me, c) => {
    const levels = buildLevels(p.systemId, p.beyondUnit, await systemName(p.systemId));
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
  };
  const row = (await prisma.workPlan.update({
    where: { id: p.id },
    data: { status: 'ENDED', reportPublishedById: me, reportPublishedAt: at, reportJson: JSON.stringify(snapshot) },
  })) as Plan;
  await audit(me, p.systemId, 'WORKPLAN_REPORT_PUBLISHED', `Published the report for “${p.title}”`, { planId: p.id });
  res.json({ plan: await shape(row, c, me, true) });
});
