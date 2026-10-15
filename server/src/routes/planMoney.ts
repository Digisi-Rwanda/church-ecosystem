/**
 * Money on an activity's page (slice 4): the spending lines, the money set aside for them, the live gap, and the Treasurer's check.
 * Mounted ahead of the plan routes under /api/work-plans. Money is open to change while an activity is a draft or waiting for
 * approval; changing it while waiting pulls the activity back to the Treasurer. After approval it is locked (slices 5+ add amendments).
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { notifySafely } from '../lib/notify.js';
import { NOTE_MAX, TITLE_MAX, canSee } from '../work/rules.js';
import { buildLevels, catechistStepApplies, skipUnitLevel, type Level } from '../work/plan.js';
import { asWorkRow, approversOf, canApprove, canDecideForChurch, canManagePlan, currentLevel, holdersWith, levelsOf, treasurerExists, unitApproverIds, CHURCH_SYSTEM, type PlanRow } from '../work/plan.js';
import { occurrencesIn, churchDay, postponedOverSixMonths, timingProblem } from '../work/timing.js';
import { BUDGET_CYCLES, CYCLES_MAX, cycleKey, cycleProblem, cyclesOf, isOngoing, multiplierOf, overspendByCycle, reduceSources, releasedOnShorten, type BudgetCycle } from '../money/cycles.js';
import { classify, overBy, reserveOf, totalOf, touchedLines } from '../money/amendments.js';
import { CHANGE_KEYS, fieldDiff, moneySig, scopeOf, type ChangeKey, type StoredSet } from '../money/amendRoute.js';
import { fundraisingProblem } from '../money/settle.js';
import { SOURCE_KINDS, codeFor, earmarkProblem, potId } from '../money/funds.js';
import { adjustLevels, afterEdit, allVerified, checkNote, figures, liveLines, submitProblem, type MoneyCheck } from '../money/planMoney.js';
import { burnOf, phasesOf } from '../money/burn.js';
import { canReadMoney } from '../money/rules.js';
import { potsOf } from './incomeFunds.js';
import { settleView } from './planSettle.js';
import { finalize, postSettlement, syncFundraising, warnPool } from '../money/settlement.js';
import { settlementLapsed } from '../money/settle.js';

export const planMoneyRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string, extra: object = {}) => res.status(status).json({ error, code, ...extra });

export interface Plan extends PlanRow { title: string; moneyCheckJson?: string | null; startsOn?: Date | string | null; endsOn?: Date | string | null; planType?: string | null; timingKind?: string | null; repeatJson?: string | null; budgetCycle?: string | null; budgetCycles?: number | null; fundraising?: boolean | null; fundTarget?: number | null; doneAt?: Date | string | null; settledAt?: Date | string | null; settlementJson?: string | null; createdById: string }
export interface Amend { id: string; planId: string; systemId: string; kind: string; status: string; oldTotal: number; newTotal: number; justification: string; linesJson: string; sourcesJson: string; reserveJson: string; requestedById: string; requestedAt: Date | string; decidedById: string | null; decidedAt: Date | string | null; decisionNote: string | null; reviewedAt: Date | string | null; scope?: string | null; changesJson?: string | null; levelsJson?: string | null }
interface Entry { id: string; planId: string | null; kind: string; status: string; amount: number; occurredOn: Date | string }
interface Line { id: string; planId: string | null; systemId: string; title: string; amount: number; category: string | null; status: string; note: string | null; checkState: string | null; checkedById: string | null; checkedAt: Date | string | null; milestoneId?: string | null; year: number; createdAt: Date | string }
interface Source { id: string; planId: string; systemId: string; kind: string; code: string; amount: number }

/** Money stays open only while the activity is not yet approved. */
const OPEN = ['DRAFT', 'PENDING_APPROVAL'];
const AMOUNT_MAX = 2_000_000_000;

async function load(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const { data } = await loadAccessData(me);
  const p = (await prisma.workPlan.findUnique({ where: { id: String(req.params.id) } })) as Plan | null;
  if (!p || p.deletedAt || !canSee(asWorkRow(p), me, data)) return fail(res, 404, 'NOT_FOUND', 'Plan not found'), null;
  return { me, data, p };
}

export const mult = (p: Plan) => multiplierOf(p as never);
const parse = <T,>(raw: string | null | undefined, fallback: T): T => { try { return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; } };
const APPROVED_STATES = ['SETUP', 'RUNNING', 'PAUSED', 'CLOSING'];

const linesOf = async (planId: string) => ((await prisma.moneyPlanItem.findMany({ where: { planId } })) as Line[]).filter((l) => l.planId === planId).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
const sourcesOf = async (planId: string) => ((await prisma.planSource.findMany({ where: { planId } })) as Source[]).filter((s) => s.planId === planId);

async function audit(actorId: string, systemId: string, action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({ data: { at: new Date(), actorId, systemId, action, resource: 'MONEY', detail, metaJson: JSON.stringify(meta) } });
}

const parseCheck = (s?: string | null): MoneyCheck | null => {
  try { return s ? (JSON.parse(s) as MoneyCheck) : null; } catch { return null; }
};

async function actualOf(p: Plan): Promise<Entry[]> {
  return ((await prisma.moneyEntry.findMany({ where: { planId: p.id } })) as Entry[]).filter((e) => e.planId === p.id && e.kind === 'SPENDING' && e.status !== 'REJECTED' && e.status !== 'VOIDED');
}
const occurrenceDays = (p: Plan): string[] => {
  if (!p.startsOn) return [];
  const out: string[] = [];
  const from = churchDay(p.startsOn).slice(0, 7);
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  for (let i = 0; i < 24; i += 1) {
    out.push(...occurrencesIn(p as never, `${y}-${String(m).padStart(2, '0')}`).map((o) => o.date));
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
};

/** Cycles, spending against plan and amendments: what the page needs after approval. */
async function extras(p: Plan, me: string, data: Awaited<ReturnType<typeof loadAccessData>>['data'], f: { planned: number }, live: Line[]) {
  const manage = canManagePlan(p, me, data);
  const m = mult(p);
  const allowance = totalOf(live);
  const actual = await actualOf(p);
  const spent = actual.reduce((n, e) => n + e.amount, 0);
  const cycle = (BUDGET_CYCLES as readonly string[]).includes(String(p.budgetCycle)) ? (p.budgetCycle as BudgetCycle) : null;
  const ongoing = isOngoing(p as never);
  const perCycle = cycle && p.timingKind === 'REPEAT' ? overspendByCycle(actual.map((e) => ({ amount: e.amount, day: churchDay(e.occurredOn) })), allowance, cycle, occurrenceDays(p)) : [];
  const amends = ((await prisma.budgetAmendment.findMany({ where: { planId: p.id } })) as Amend[]).filter((a) => a.planId === p.id).sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()).slice(0, 10);
  const names = new Map(((await prisma.person.findMany({ where: { id: { in: [...new Set(amends.flatMap((a) => [a.requestedById, a.decidedById ?? '-', ...chainOf(a).map((l) => l.byId ?? '-')]))] } } })) as Array<{ id: string; fullName: string }>).map((x) => [x.id, x.fullName]));
  const pending = amends.find((a) => a.status === 'PENDING') ?? null;
  const approved = APPROVED_STATES.includes(p.status);
  return {
    locked: !OPEN.includes(p.status),
    cycle: { kind: cycle, cycles: cyclesOf(p as never), explicit: p.budgetCycles ?? null, allowance, multiplier: m, ongoing, repeat: p.timingKind === 'REPEAT', problem: cycleProblem(p as never) },
    canSetCycle: manage && !['ENDED', 'CANCELLED'].includes(p.status) && (p.timingKind === 'REPEAT' || p.planType === 'PROGRAM'),
    actual: spent, over: overBy(f.planned, spent), perCycle,
    canRequestAmendment: manage && approved && !pending,
    canWithdrawAmendment: manage && !!pending,
    pendingAmendment: pending ? amendShape(pending, names, mayDecide(pending, p, me, data)) : null,
    amendments: amends.filter((a) => a.status !== 'PENDING').map((a) => amendShape(a, names, false)),
  };
}

type AccessD = Awaited<ReturnType<typeof loadAccessData>>['data'];
const officeHolders = (data: AccessD, systemId: string, office: string): string[] =>
  [...new Set((data.positions as Array<{ personId: string; systemId: string; office?: string | null; status?: string | null }>).filter((x) => x.systemId === systemId && x.office === office && (x.status ?? 'ACTIVE') === 'ACTIVE').map((x) => x.personId))];
const churchLeaders = (data: AccessD) => holdersWith(CHURCH_SYSTEM, 'MISSION', 'A', data).filter((id) => canDecideForChurch(id, data));

/**
 * Who decides a money-only or team-only amendment: the unit's President. When the President is the one asking, the Treasurer;
 * where nobody holds the President's office, the Vice President. In the church's own system, or when none of those exists, the Church Leader.
 */
export function moneyDeciders(p: Plan, requester: string, data: AccessD): { ids: string[]; label: string } {
  if (p.systemId === CHURCH_SYSTEM) return { ids: churchLeaders(data), label: 'Church Leader' };
  const presidents = unitApproverIds(p.systemId, data);
  const others = presidents.filter((id) => id !== requester);
  if (others.length) return { ids: others, label: 'President' };
  if (presidents.includes(requester)) {
    const tr = holdersWith(p.systemId, 'MONEY', 'W', data).filter((id) => id !== requester);
    return tr.length ? { ids: tr, label: 'Treasurer' } : { ids: churchLeaders(data), label: 'Church Leader' };
  }
  const vps = officeHolders(data, p.systemId, 'VICE_PRESIDENT').filter((id) => id !== requester);
  return vps.length ? { ids: vps, label: 'Vice President' } : { ids: churchLeaders(data), label: 'Church Leader' };
}
export const chainOf = (a: Amend): Level[] => parse<Level[]>(a.levelsJson, []);
const isChain = (a: Amend) => (a.scope ?? 'MONEY') === 'GENERAL' && chainOf(a).length > 0;
/** Whether this person may decide the step now waiting. */
export function mayDecide(a: Amend, p: Plan, me: string, data: AccessD): boolean {
  if (a.status !== 'PENDING') return false;
  if (!isChain(a)) return moneyDeciders(p, a.requestedById, data).ids.includes(me);
  return canApprove({ ...p, status: 'PENDING_APPROVAL', approvalsJson: a.levelsJson, createdById: a.requestedById } as PlanRow, me, data);
}
/** Everyone who could decide the step now waiting. */
function decidersOf(a: Amend, p: Plan, data: AccessD): string[] {
  if (!isChain(a)) return moneyDeciders(p, a.requestedById, data).ids;
  return approversOf({ ...p, status: 'PENDING_APPROVAL', approvalsJson: a.levelsJson, createdById: a.requestedById } as PlanRow, data);
}

function amendShape(a: Amend, who: Map<string, string>, canDecide: boolean) {
  return {
    id: a.id, kind: a.kind, status: a.status, oldTotal: a.oldTotal, newTotal: a.newTotal, justification: a.justification, requestedByName: who.get(a.requestedById) ?? '',
    requestedAt: new Date(a.requestedAt).toISOString(), decidedByName: a.decidedById ? who.get(a.decidedById) ?? '' : null, decisionNote: a.decisionNote, reviewed: !!a.reviewedAt,
    scope: a.scope ?? 'MONEY', changes: parse<{ keys: string[]; set: StoredSet } | null>(a.changesJson, null), levels: chainOf(a).map((l) => ({ levelKey: l.levelKey, label: l.label, status: l.status, byName: l.byId ? who.get(l.byId) ?? '' : null, note: l.note })),
    lines: parse<Array<{ id?: string | null; title: string; amount: number }>>(a.linesJson, []), sources: parse<Array<{ kind: string; code: string; amount: number }>>(a.sourcesJson, []), canDecide,
  };
}

async function view(p: Plan, me: string, data: Awaited<ReturnType<typeof loadAccessData>>['data']) {
  const lines = await linesOf(p.id);
  const sources = await sourcesOf(p.id);
  const live = liveLines(lines);
  const f = figures(lines, sources, mult(p));
  const level = p.status === 'PENDING_APPROVAL' ? currentLevel(p) : null;
  const manage = canManagePlan(p, me, data);
  const pots = await potsOf(p.systemId, OPEN.includes(p.status) ? p.id : undefined);
  const check = parseCheck(p.moneyCheckJson);
  const who = new Map(((await prisma.person.findMany({ where: { id: { in: [check?.byId ?? '-'] } } })) as Array<{ id: string; fullName: string }>).map((x) => [x.id, x.fullName]));
  const atTreasurer = level?.levelKey === 'TREASURER';
  const lineSpent = new Map<string, number>();
  for (const e of (await prisma.moneyEntry.findMany({ where: { planId: p.id } })) as { kind: string; status: string; lineId?: string | null; amount: number }[])
    if (e.kind === 'SPENDING' && e.lineId && e.status !== 'REJECTED' && e.status !== 'VOIDED') lineSpent.set(e.lineId, (lineSpent.get(e.lineId) ?? 0) + e.amount);
  const totalSpent = [...lineSpent.values()].reduce((n, x) => n + x, 0);
  const allSpent = (await actualOf(p)).reduce((n, e) => n + e.amount, 0);
  const miles = p.planType === 'PROJECT' ? ((await prisma.workPlanMilestone.findMany({ where: { planId: p.id } })) as Array<{ id: string; planId: string; title: string; dueOn: Date | null; createdAt: Date }>).filter((x) => x.planId === p.id).sort((a, b) => new Date(a.dueOn ?? a.createdAt).getTime() - new Date(b.dueOn ?? b.createdAt).getTime()) : [];
  const phases = p.planType === 'PROJECT' ? phasesOf(miles, live.map((l) => ({ milestoneId: l.milestoneId, amount: l.amount * mult(p), spent: lineSpent.get(l.id) ?? 0 })), Math.max(0, allSpent - totalSpent)) : null;
  const burn = p.planType === 'PROGRAM' && !OPEN.includes(p.status) ? burnOf({ planned: f.planned, spent: allSpent, startsOn: p.startsOn ? new Date(p.startsOn) : null, endsOn: p.endsOn ? new Date(p.endsOn) : null, now: new Date() }) : null;
  return {
    planId: p.id, status: p.status, planType: p.planType ?? 'EVENT', phases, burn, open: OPEN.includes(p.status), ...f,
    canEdit: manage && OPEN.includes(p.status),
    canVerify: atTreasurer && canApprove(p, me, data),
    canCheck: atTreasurer && canApprove(p, me, data),
    allVerified: allVerified(lines),
    lines: live.map((l) => {
      const spent = lineSpent.get(l.id) ?? 0;
      const allowed = l.amount * mult(p);
      return { id: l.id, milestoneId: l.milestoneId ?? null, title: l.title, amount: l.amount, category: l.category, note: l.note, checkState: l.checkState ?? null, spent, remaining: Math.max(0, allowed - spent) };
    }),
    sources: sources.map((s) => ({ kind: s.kind, code: s.code, amount: s.amount, potId: potId(s.kind, s.code) })),
    pots, check: check ? { result: check.result, note: check.note, at: check.at, byName: who.get(check.byId) ?? '' } : null,
    ...(await extras(p, me, data, f, live)),
    ...(await settleView(p, me, data, f.planned, f.earmarked)),
  };
}

const phaseOk = async (planId: string, id: string | null | undefined) => !id || ((await prisma.workPlanMilestone.findMany({ where: { planId } })) as Array<{ id: string; planId: string }>).some((m) => m.id === id && m.planId === planId);

const planYear = (p: Plan) => (p.startsOn ? new Date(p.startsOn).getUTCFullYear() : new Date().getUTCFullYear());

/** After money changed: keep the Treasurer's step in line with the spending, and pull a checked activity back. */
async function changed(p: Plan, me: string, data: Awaited<ReturnType<typeof loadAccessData>>['data']) {
  if (p.status !== 'PENDING_APPROVAL') return;
  const f = figures(await linesOf(p.id), await sourcesOf(p.id), mult(p));
  const planned = treasurerExists(p.createdById, p.systemId, data) ? f.planned : 0;
  const adj = adjustLevels(levelsOf(p), planned, true, p.systemId);
  const same = JSON.stringify(adj.levels) === JSON.stringify(levelsOf(p));
  if (!same || adj.pulledBack) {
    const row = (await prisma.workPlan.update({ where: { id: p.id }, data: { approvalsJson: JSON.stringify(adj.levels), moneyCheckJson: adj.pulledBack || planned === 0 ? null : p.moneyCheckJson ?? null } })) as Plan;
    if (adj.pulledBack || adj.added) {
      for (const id of approversOf(row, data).filter((x) => x !== me))
        await notifySafely(prisma as never, { kind: 'WAITING_FOR_ME', toPersonId: id, systemId: p.systemId, title: `${adj.pulledBack ? 'Money changed, please check again' : 'Figures to check'}: ${p.title}`, body: 'Treasurer', href: `/s/${p.systemId}/work/plans/${p.id}`, important: true, sourceKey: `plan-money:${p.id}:${Date.now()}:${id}` });
    }
  }
}

planMoneyRouter.get('/money-queue', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const { data } = await loadAccessData(me);
  const rows = ((await prisma.workPlan.findMany({ where: { status: 'PENDING_APPROVAL' } })) as Plan[]).filter((p) => !p.deletedAt && currentLevel(p)?.levelKey === 'TREASURER' && canApprove(p, me, data));
  const items = [];
  for (const p of rows) items.push({ id: p.id, systemId: p.systemId, title: p.title, planned: figures(await linesOf(p.id), [], mult(p)).planned });
  res.json({ items });
});

planMoneyRouter.get('/:id/money', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  // The figures are for those who run the activity, hold the unit's money letters, or are asked to decide on it.
  const allowed = canManagePlan(got.p, got.me, got.data) || canReadMoney(got.me, got.p.systemId, got.data) || canApprove(got.p, got.me, got.data);
  if (!allowed) return fail(res, 404, 'NOT_FOUND', 'Not found');
  res.json(await view(got.p, got.me, got.data));
});

const lineSchema = z.object({ title: z.string().trim().min(1).max(TITLE_MAX), amount: z.number().int().min(1).max(AMOUNT_MAX), category: z.string().trim().max(60).nullish(), note: z.string().trim().max(NOTE_MAX).nullish(), milestoneId: z.string().max(60).nullish() });

async function editable(req: AuthedRequest, res: Res) {
  const got = await load(req, res);
  if (!got) return null;
  if (!canManagePlan(got.p, got.me, got.data)) return fail(res, 403, 'FORBIDDEN', 'You may not change this activity'), null;
  if (!OPEN.includes(got.p.status)) return fail(res, 409, 'MONEY_LOCKED', 'The money is locked once the activity is approved'), null;
  return got;
}

planMoneyRouter.post('/:id/lines', requireAuth, async (req: AuthedRequest, res) => {
  const got = await editable(req, res);
  if (!got) return;
  const b = lineSchema.safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Please give what it is for and an amount');
  // A repeat cannot hold spending until it says how its allowance is counted and how long it runs.
  const cp = cycleProblem(got.p as never);
  if (cp) return fail(res, 409, cp, 'Say how the allowance is counted and for how long');
  if (!(await phaseOk(got.p.id, b.data.milestoneId))) return fail(res, 400, 'BAD_MILESTONE', 'That phase does not belong to this project');
  await prisma.moneyPlanItem.create({ data: { milestoneId: b.data.milestoneId ?? null, systemId: got.p.systemId, year: planYear(got.p), title: b.data.title, amount: b.data.amount, category: b.data.category ?? null, note: b.data.note ?? null, planId: got.p.id, createdById: got.me } });
  await audit(got.me, got.p.systemId, 'MONEY_LINE_ADDED', `Added “${b.data.title}” to “${got.p.title}”`, { planId: got.p.id });
  await changed(got.p, got.me, got.data);
  res.json(await view((await prisma.workPlan.findUnique({ where: { id: got.p.id } })) as Plan, got.me, got.data));
});

planMoneyRouter.patch('/:id/lines/:lineId', requireAuth, async (req: AuthedRequest, res) => {
  const got = await editable(req, res);
  if (!got) return;
  const line = (await prisma.moneyPlanItem.findUnique({ where: { id: String(req.params.lineId) } })) as Line | null;
  if (!line || line.planId !== got.p.id || line.status === 'DROPPED') return fail(res, 404, 'NOT_FOUND', 'Line not found');
  const b = lineSchema.partial().safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Invalid line');
  if (b.data.milestoneId !== undefined && !(await phaseOk(got.p.id, b.data.milestoneId))) return fail(res, 400, 'BAD_MILESTONE', 'That phase does not belong to this project');
  // Any edit takes the Treasurer's tick away: the line is "modified, pending re-verification".
  await prisma.moneyPlanItem.update({ where: { id: line.id }, data: { ...b.data, checkState: afterEdit(line.checkState), checkedById: null, checkedAt: null } });
  await audit(got.me, got.p.systemId, 'MONEY_LINE_CHANGED', `Changed “${line.title}” in “${got.p.title}”`, { planId: got.p.id, lineId: line.id });
  await changed(got.p, got.me, got.data);
  res.json(await view((await prisma.workPlan.findUnique({ where: { id: got.p.id } })) as Plan, got.me, got.data));
});

planMoneyRouter.delete('/:id/lines/:lineId', requireAuth, async (req: AuthedRequest, res) => {
  const got = await editable(req, res);
  if (!got) return;
  const line = (await prisma.moneyPlanItem.findUnique({ where: { id: String(req.params.lineId) } })) as Line | null;
  if (!line || line.planId !== got.p.id || line.status === 'DROPPED') return fail(res, 404, 'NOT_FOUND', 'Line not found');
  await prisma.moneyPlanItem.update({ where: { id: line.id }, data: { status: 'DROPPED' } });
  await audit(got.me, got.p.systemId, 'MONEY_LINE_REMOVED', `Removed “${line.title}” from “${got.p.title}”`, { planId: got.p.id, lineId: line.id });
  await changed(got.p, got.me, got.data);
  res.json(await view((await prisma.workPlan.findUnique({ where: { id: got.p.id } })) as Plan, got.me, got.data));
});

/** Set the money aside. The only refusal in the money rules: more than a pot has available is turned away. */
planMoneyRouter.put('/:id/sources', requireAuth, async (req: AuthedRequest, res) => {
  const got = await editable(req, res);
  if (!got) return;
  const b = z.object({ sources: z.array(z.object({ kind: z.enum(SOURCE_KINDS), code: z.string().max(40).nullish(), amount: z.number().int().min(0).max(AMOUNT_MAX) })).max(40) }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Invalid sources');
  const wanted: Array<{ kind: string; code: string; amount: number }> = [];
  for (const s of b.data.sources.filter((x) => x.amount > 0)) {
    const code = codeFor(s.kind, s.code);
    if (code === null) return fail(res, 400, 'BAD_SOURCE', 'Unknown source');
    wanted.push({ kind: s.kind, code, amount: s.amount });
  }
  const problem = earmarkProblem(await potsOf(got.p.systemId, got.p.id), wanted);
  if (problem) return fail(res, problem.code === 'INSUFFICIENT_FUNDS' ? 409 : 400, problem.code, 'That is more than is available', problem);
  for (const old of await sourcesOf(got.p.id)) await prisma.planSource.delete({ where: { id: old.id } });
  for (const w of wanted) await prisma.planSource.create({ data: { planId: got.p.id, systemId: got.p.systemId, kind: w.kind, code: w.code, amount: w.amount, createdById: got.me } });
  await audit(got.me, got.p.systemId, 'MONEY_EARMARKED', `Set money aside for “${got.p.title}”`, { planId: got.p.id, sources: wanted });
  await changed(got.p, got.me, got.data);
  res.json(await view((await prisma.workPlan.findUnique({ where: { id: got.p.id } })) as Plan, got.me, got.data));
});

/** The Treasurer ticks or un-ticks one line. */
planMoneyRouter.post('/:id/lines/:lineId/verify', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const level = got.p.status === 'PENDING_APPROVAL' ? currentLevel(got.p) : null;
  if (level?.levelKey !== 'TREASURER' || !canApprove(got.p, got.me, got.data)) return fail(res, 403, 'FORBIDDEN', 'Only the Treasurer checks the figures');
  const line = (await prisma.moneyPlanItem.findUnique({ where: { id: String(req.params.lineId) } })) as Line | null;
  if (!line || line.planId !== got.p.id || line.status === 'DROPPED') return fail(res, 404, 'NOT_FOUND', 'Line not found');
  const on = z.object({ verified: z.boolean() }).safeParse(req.body ?? {});
  const verified = on.success ? on.data.verified : true;
  await prisma.moneyPlanItem.update({ where: { id: line.id }, data: verified ? { checkState: 'VERIFIED', checkedById: got.me, checkedAt: new Date() } : { checkState: null, checkedById: null, checkedAt: null } });
  res.json(await view(got.p, got.me, got.data));
});

/** The Treasurer's answer: figures checked, or a problem flagged. A flag never stops the activity; it travels with it. */
planMoneyRouter.post('/:id/money-check', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, data, p } = got;
  const levels = levelsOf(p);
  const idx = levels.findIndex((l) => l.status === 'PENDING');
  if (p.status !== 'PENDING_APPROVAL' || idx < 0 || levels[idx]!.levelKey !== 'TREASURER') return fail(res, 409, 'WRONG_STATE', 'There is nothing to check now');
  if (!canApprove(p, me, data)) return p.createdById === me ? fail(res, 403, 'OWN_ENTRY', 'Nobody checks their own figures') : fail(res, 403, 'FORBIDDEN', 'Only the Treasurer checks the figures');
  const b = z.object({ result: z.enum(['CHECKED', 'FLAGGED']), note: z.string().trim().max(NOTE_MAX).nullish() }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Invalid answer');
  const note = b.data.note || null;
  if (b.data.result === 'FLAGGED' && !note) return fail(res, 400, 'NOTE_REQUIRED', 'Please say what the problem is');
  if (b.data.result === 'CHECKED' && !allVerified(await linesOf(p.id))) return fail(res, 409, 'LINES_NOT_VERIFIED', 'Tick every line first');
  const at = new Date().toISOString();
  levels[idx] = { ...levels[idx]!, status: 'APPROVED', byId: me, at, note: checkNote(b.data.result, note) };
  const check: MoneyCheck = { result: b.data.result, note, byId: me, at };
  const row = (await prisma.workPlan.update({ where: { id: p.id }, data: { approvalsJson: JSON.stringify(levels), moneyCheckJson: JSON.stringify(check) } })) as Plan;
  for (const id of approversOf(row, data).filter((x) => x !== me))
    await notifySafely(prisma as never, { kind: 'WAITING_FOR_ME', toPersonId: id, systemId: p.systemId, title: `${b.data.result === 'FLAGGED' ? 'Plan to approve, figures flagged' : 'Plan to approve'}: ${p.title}`, body: currentLevel(row)?.label ?? '', href: `/s/${p.systemId}/work/plans/${p.id}`, important: true, sourceKey: `plan-ask:${p.id}:${currentLevel(row)?.levelKey}:${id}` });
  await audit(me, p.systemId, b.data.result === 'FLAGGED' ? 'MONEY_FLAGGED' : 'MONEY_CHECKED', `${b.data.result === 'FLAGGED' ? 'Flagged' : 'Checked'} the figures of “${p.title}”`, { planId: p.id, note });
  res.json(await view(row, me, data));
});


/* ───────────── slice 5: budget amendments ───────────── */

const lineIn = z.object({ id: z.string().min(1).nullish(), title: z.string().trim().min(1).max(TITLE_MAX), amount: z.number().int().min(1).max(AMOUNT_MAX), category: z.string().trim().max(60).nullish() });
const changesIn = z
  .object({
    title: z.string().trim().min(1).max(TITLE_MAX), aim: z.string().trim().max(4000), needs: z.string().trim().max(4000).nullable(), location: z.string().trim().max(TITLE_MAX).nullable(),
    startsOn: z.string().datetime().nullable(), endsOn: z.string().datetime().nullable(), timingKind: z.enum(['DATE', 'RANGE', 'REPEAT']), startTime: z.string().max(5).nullable(), endTime: z.string().max(5).nullable(),
    repeat: z.unknown(), fundraising: z.boolean(), fundTarget: z.number().int().min(0).max(AMOUNT_MAX).nullable(), leaderId: z.string().min(1),
    team: z.array(z.object({ personId: z.string().min(1), role: z.string().trim().min(1).max(80) })).max(40),
  })
  .partial()
  .strict();
const amendSchema = z.object({
  justification: z.string().trim().min(1).max(NOTE_MAX),
  lines: z.array(lineIn).max(80).optional(),
  sources: z.array(z.object({ kind: z.enum(SOURCE_KINDS), code: z.string().max(40).nullish(), amount: z.number().int().min(1).max(AMOUNT_MAX) })).max(40).optional(),
  changes: changesIn.optional(),
});

const tellMany = async (ids: string[], p: Plan, title: string, body: string | null, key: string, important = false) => {
  for (const id of new Set(ids)) await notifySafely(prisma as never, { kind: important ? 'WAITING_FOR_ME' : 'FOR_INFORMATION', toPersonId: id, systemId: p.systemId, title, body, href: `/s/${p.systemId}/work/plans/${p.id}`, important, sourceKey: `${key}:${id}` });
};

const SCOPE_NOTE: Record<string, string> = { MONEY: 'Budget change', TEAM: 'Leader or team change', GENERAL: 'Change to the plan' };
export const amendTitle = (a: { scope?: string | null; kind: string }) => (a.scope === 'MONEY' || !a.scope ? (a.kind === 'INCREASE' ? 'Budget increase' : a.kind === 'TRANSFER' ? 'Budget transfer' : 'Budget change') : SCOPE_NOTE[a.scope] ?? 'Change');

planMoneyRouter.post('/:id/amendments', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, data, p } = got;
  if (!canManagePlan(p, me, data)) return fail(res, 403, 'FORBIDDEN', 'You may not change this activity');
  if (!APPROVED_STATES.includes(p.status)) return fail(res, 409, 'WRONG_STATE', 'Only an approved activity needs an amendment');
  const open = ((await prisma.budgetAmendment.findMany({ where: { planId: p.id } })) as Amend[]).find((a) => a.planId === p.id && a.status === 'PENDING');
  if (open) return fail(res, 409, 'AMENDMENT_OPEN', 'An amendment is already open');
  const b = amendSchema.safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Please say what changes and why');
  const current = liveLines(await linesOf(p.id));
  const known = new Map(current.map((l) => [l.id, l]));
  const lines = b.data.lines ?? current.map((l) => ({ id: l.id, title: l.title, amount: l.amount, category: l.category }));
  if (lines.some((l) => l.id && !known.has(l.id))) return fail(res, 400, 'BAD_INPUT', 'Unknown line');
  const have = await sourcesOf(p.id);
  const sources: Array<{ kind: string; code: string; amount: number }> = [];
  for (const s of b.data.sources ?? have.map((x) => ({ kind: x.kind as never, code: x.code, amount: x.amount }))) {
    const code = codeFor(s.kind, s.code);
    if (code === null) return fail(res, 400, 'BAD_SOURCE', 'Unknown source');
    sources.push({ kind: s.kind, code, amount: s.amount });
  }
  const m = mult(p);
  const t = touchedLines(current, lines);
  const money = t.changed.length > 0 || t.dropped.length > 0 || moneySig(sources) !== moneySig(have);
  const category = lines.some((l) => l.id && l.category !== undefined && (l.category ?? null) !== (known.get(l.id)?.category ?? null));
  const diff = b.data.changes ? fieldDiff(p as never, b.data.changes as never) : { keys: [] as ChangeKey[], set: {} as StoredSet };
  const scope = scopeOf(money, category, diff.keys);
  if (!scope) return fail(res, 400, 'NO_CHANGE', 'Nothing was changed');
  if (money && totalOf(lines) * m !== sources.reduce((n, s) => n + s.amount, 0)) return fail(res, 409, 'FUNDING_GAP', 'The money set aside must match the planned spending');
  if (diff.keys.length) {
    const next = { ...p, ...diff.set } as Plan;
    const tp = timingProblem({ timingKind: next.timingKind, startsOn: next.startsOn, endsOn: next.endsOn, startTime: (next as never as {startTime:string|null}).startTime, endTime: (next as never as {endTime:string|null}).endTime, repeatJson: next.repeatJson } as never, { needDate: true });
    if (tp) return fail(res, 400, tp, 'Check the dates and times');
    const fbad = fundraisingProblem(!!next.fundraising, next.fundTarget ?? null, p.planType ?? 'PROJECT');
    if (fbad) return fail(res, 400, fbad, fbad === 'TARGET_NEEDED' ? 'Set a target above zero for a fundraising event' : 'Only an event can be a fundraiser');
    if (diff.set.leaderPersonId || diff.set.teamJson) {
      const ids = [diff.set.leaderPersonId ?? p.leaderPersonId, ...(JSON.parse(diff.set.teamJson ?? p.teamJson ?? '[]') as Array<{ personId: string }>).map((x) => x.personId)];
      const people = (await prisma.person.findMany({ where: { id: { in: ids } } })) as Array<{ id: string; status?: string }>;
      if (ids.some((id) => (people.find((x) => x.id === id)?.status ?? 'ACTIVE') !== 'ACTIVE' || !people.some((x) => x.id === id))) return fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose people who are active members');
    }
  }
  const oldTotal = totalOf(current) * m;
  const newTotal = totalOf(lines) * m;
  const reserve = money ? reserveOf(have, sources) : [];
  const short = earmarkProblem(await potsOf(p.systemId), reserve);
  if (short) return fail(res, short.code === 'INSUFFICIENT_FUNDS' ? 409 : 400, short.code, 'That is more than is available', short);
  const kind = money ? classify(oldTotal, newTotal) : 'CHANGE';
  const levels = scope === 'GENERAL'
    ? buildLevels(p.systemId, skipUnitLevel(me, p.systemId, data), money && treasurerExists(me, p.systemId, data), catechistStepApplies(me, p.systemId, data))
    : [];
  const row = (await prisma.budgetAmendment.create({
    data: {
      planId: p.id, systemId: p.systemId, requestedAt: new Date(), status: 'PENDING', kind, scope, oldTotal, newTotal, justification: b.data.justification,
      linesJson: JSON.stringify(lines), sourcesJson: JSON.stringify(sources), reserveJson: JSON.stringify(reserve), requestedById: me,
      changesJson: diff.keys.length ? JSON.stringify({ keys: diff.keys, set: diff.set }) : null, levelsJson: levels.length ? JSON.stringify(levels) : null,
    },
  })) as Amend;
  const title = amendTitle(row);
  const askers = decidersOf(row, p, data).filter((id) => id !== me);
  await tellMany(askers, p, `${title} to approve: ${p.title}`, b.data.justification, `amend-ask:${row.id}`, true);
  // The Church Leader hears of every amendment at once, whether or not they decide it.
  await tellMany(churchLeaders(data).filter((id) => id !== me && !askers.includes(id)), p, `${title} asked for: ${p.title}`, b.data.justification, `amend-cl:${row.id}`);
  await audit(me, p.systemId, 'MONEY_AMENDMENT_REQUESTED', `${scope} amendment for “${p.title}”: ${oldTotal} to ${newTotal}`, { planId: p.id, amendmentId: row.id, scope, keys: diff.keys });
  res.status(201).json(await view(p, me, data));
});

async function pendingFor(req: AuthedRequest, res: Res) {
  const got = await load(req, res);
  if (!got) return null;
  const a = (await prisma.budgetAmendment.findUnique({ where: { id: String(req.params.aid) } })) as Amend | null;
  if (!a || a.planId !== got.p.id) return fail(res, 404, 'NOT_FOUND', 'Amendment not found'), null;
  if (a.status !== 'PENDING') return fail(res, 409, 'WRONG_STATE', 'This amendment is already decided'), null;
  return { ...got, a };
}

/** Put an approved amendment into effect: the lines and sources, the categories, and the plan's own fields. Returns a problem code instead if the money has gone. */
async function applyAmendment(p: Plan, a: Amend): Promise<{ code: string; short?: object } | null> {
  const lines = parse<Array<{ id?: string | null; title: string; amount: number; category?: string | null }>>(a.linesJson, []);
  const sources = parse<Array<{ kind: string; code: string; amount: number }>>(a.sourcesJson, []);
  const have = await sourcesOf(p.id);
  const current = liveLines(await linesOf(p.id));
  const t = touchedLines(current, lines);
  const money = t.changed.length > 0 || t.dropped.length > 0 || moneySig(sources) !== moneySig(have);
  if (money) {
    // The money must still be there: this plan's own earmark and reservation are set aside when checking.
    const short = earmarkProblem(await potsOf(p.systemId, p.id), sources);
    if (short) return { code: short.code, short };
    for (const id of t.dropped) await prisma.moneyPlanItem.update({ where: { id }, data: { status: 'DROPPED' } });
    const year = p.startsOn ? new Date(p.startsOn).getUTCFullYear() : new Date().getUTCFullYear();
    for (const l of t.changed) {
      const cat = l.category === undefined ? {} : { category: l.category ?? null };
      if (l.id) await prisma.moneyPlanItem.update({ where: { id: l.id }, data: { title: l.title, amount: l.amount, ...cat, checkState: 'MODIFIED', checkedById: null, checkedAt: null } });
      else await prisma.moneyPlanItem.create({ data: { systemId: p.systemId, year, title: l.title, amount: l.amount, ...cat, planId: p.id, createdById: a.requestedById, checkState: 'MODIFIED' } });
    }
    for (const old of have) await prisma.planSource.delete({ where: { id: old.id } });
    for (const s of sources) await prisma.planSource.create({ data: { planId: p.id, systemId: p.systemId, kind: s.kind, code: s.code, amount: s.amount, createdById: a.requestedById } });
  }
  const changed = new Set(t.changed.map((l) => l.id).filter(Boolean));
  for (const l of lines) {
    if (!l.id || changed.has(l.id) || l.category === undefined) continue;
    const old = current.find((x) => x.id === l.id);
    if (old && (old.category ?? null) !== (l.category ?? null)) await prisma.moneyPlanItem.update({ where: { id: l.id }, data: { category: l.category ?? null } });
  }
  const ch = parse<{ keys: string[]; set: StoredSet } | null>(a.changesJson, null);
  if (ch && ch.keys.length) {
    const { startsOn, endsOn, ...rest } = ch.set;
    const data: Record<string, unknown> = { ...rest };
    if (startsOn !== undefined) data.startsOn = startsOn ? new Date(startsOn) : null;
    if (endsOn !== undefined) data.endsOn = endsOn ? new Date(endsOn) : null;
    const moved = ch.keys.some((k) => ['startsOn', 'endsOn', 'timingKind', 'startTime', 'endTime', 'repeat'].includes(k));
    if (moved) {
      data.dateChangeJson = JSON.stringify({
        fromStart: p.startsOn ? churchDay(p.startsOn) : null, fromEnd: p.endsOn ? churchDay(p.endsOn) : null,
        toStart: startsOn ? churchDay(startsOn) : null, toEnd: endsOn ? churchDay(endsOn) : null, at: new Date().toISOString(), byId: a.requestedById,
      });
      if (startsOn !== undefined && postponedOverSixMonths(p.startsOn, startsOn)) data.reviewDue = true;
    }
    await prisma.workPlan.update({ where: { id: p.id }, data });
  }
  return null;
}

planMoneyRouter.post('/:id/amendments/:aid/approve', requireAuth, async (req: AuthedRequest, res) => {
  const got = await pendingFor(req, res);
  if (!got) return;
  const { me, data, p, a } = got;
  if (!mayDecide(a, p, me, data)) return fail(res, 403, 'FORBIDDEN', 'You may not decide this step');
  const note = z.object({ note: z.string().trim().max(NOTE_MAX).nullish() }).safeParse(req.body ?? {});
  const said = (note.success && note.data.note) || null;
  if (isChain(a)) {
    const levels = chainOf(a);
    const at = levels.findIndex((l) => l.status === 'PENDING');
    levels[at] = { ...levels[at], status: 'APPROVED', byId: me, at: new Date().toISOString(), note: said };
    if (levels.some((l) => l.status === 'PENDING')) {
      const row = (await prisma.budgetAmendment.update({ where: { id: a.id }, data: { levelsJson: JSON.stringify(levels) } })) as Amend;
      await tellMany(decidersOf(row, p, data).filter((id) => id !== me), p, `${amendTitle(row)} to approve: ${p.title}`, row.justification, `amend-ask:${a.id}:${at + 1}`, true);
      await audit(me, p.systemId, 'MONEY_AMENDMENT_STEP', `${levels[at].label} approved the change to “${p.title}”`, { planId: p.id, amendmentId: a.id });
      return res.json(await view(p, me, data));
    }
    a.levelsJson = JSON.stringify(levels);
  }
  const bad = await applyAmendment(p, a);
  if (bad) return fail(res, 409, bad.code, 'The money is no longer available', bad.short ?? {});
  await prisma.budgetAmendment.update({ where: { id: a.id }, data: { status: 'APPROVED', decidedById: me, decidedAt: new Date(), decisionNote: said, ...(isChain(a) ? { levelsJson: a.levelsJson } : {}) } });
  const ch = parse<{ keys: string[] } | null>(a.changesJson, null);
  await tellMany([a.requestedById, ...holdersWith(p.systemId, 'MONEY', 'W', data), ...churchLeaders(data)].filter((id) => id !== me), p, `${amendTitle(a)} approved: ${p.title}`, ch?.keys.length ? `Changed: ${ch.keys.join(', ')}` : 'Changed lines need to be checked again', `amend-done:${a.id}`);
  await audit(me, p.systemId, a.kind === 'INCREASE' ? 'MONEY_BUDGET_INCREASED' : a.kind === 'TRANSFER' ? 'MONEY_EXECUTIVE_TRANSFER' : 'WORKPLAN_AMENDED', `${a.scope ?? 'MONEY'} amendment for “${p.title}”: ${a.oldTotal} to ${a.newTotal}`, { planId: p.id, amendmentId: a.id, keys: ch?.keys });
  res.json(await view((await prisma.workPlan.findUnique({ where: { id: p.id } })) as Plan, me, data));
});

planMoneyRouter.post('/:id/amendments/:aid/reject', requireAuth, async (req: AuthedRequest, res) => {
  const got = await pendingFor(req, res);
  if (!got) return;
  const { me, data, p, a } = got;
  if (!mayDecide(a, p, me, data)) return fail(res, 403, 'FORBIDDEN', 'You may not decide this');
  const b = z.object({ reason: z.string().trim().min(1).max(NOTE_MAX) }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'REASON_REQUIRED', 'Please give a reason');
  // The reservation is released at once: a rejected amendment no longer holds any money. It goes back to whoever asked, with the reason.
  await prisma.budgetAmendment.update({ where: { id: a.id }, data: { status: 'REJECTED', decidedById: me, decidedAt: new Date(), decisionNote: b.data.reason } });
  await tellMany([a.requestedById, ...churchLeaders(data)].filter((id) => id !== me), p, `${amendTitle(a)} declined: ${p.title}`, b.data.reason, `amend-no:${a.id}`);
  await audit(me, p.systemId, 'MONEY_AMENDMENT_REJECTED', `Declined ${a.scope ?? 'MONEY'} amendment for “${p.title}”`, { planId: p.id, amendmentId: a.id, reason: b.data.reason });
  res.json(await view(p, me, data));
});

planMoneyRouter.post('/:id/amendments/:aid/withdraw', requireAuth, async (req: AuthedRequest, res) => {
  const got = await pendingFor(req, res);
  if (!got) return;
  const { me, data, p, a } = got;
  if (!canManagePlan(p, me, data)) return fail(res, 403, 'FORBIDDEN', 'You may not do this');
  await prisma.budgetAmendment.update({ where: { id: a.id }, data: { status: 'WITHDRAWN', decidedById: me, decidedAt: new Date() } });
  await audit(me, p.systemId, 'MONEY_AMENDMENT_WITHDRAWN', `Withdrew ${a.kind} for “${p.title}”`, { planId: p.id, amendmentId: a.id });
  res.json(await view(p, me, data));
});

/** Executive transfers the President approved, for the Church Leader's monthly review. */
planMoneyRouter.get('/transfers-review', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const { data } = await loadAccessData(me);
  if (!canDecideForChurch(me, data)) return res.json({ items: [] });
  const rows = ((await prisma.budgetAmendment.findMany({ where: { kind: 'TRANSFER' } })) as Amend[]).filter((a) => a.kind === 'TRANSFER' && a.status === 'APPROVED' && !a.reviewedAt);
  const plans = new Map(((await prisma.workPlan.findMany()) as Plan[]).map((p) => [p.id, p]));
  const who = new Map(((await prisma.person.findMany({ where: { id: { in: [...new Set(rows.map((a) => a.decidedById ?? '-'))] } } })) as Array<{ id: string; fullName: string }>).map((x) => [x.id, x.fullName]));
  res.json({ items: rows.map((a) => ({ id: a.id, planId: a.planId, systemId: a.systemId, title: plans.get(a.planId)?.title ?? '', justification: a.justification, oldTotal: a.oldTotal, newTotal: a.newTotal, decidedByName: a.decidedById ? who.get(a.decidedById) ?? '' : '', decidedAt: a.decidedAt ? new Date(a.decidedAt).toISOString() : null })) });
});
planMoneyRouter.post('/amendments/:aid/reviewed', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const { data } = await loadAccessData(me);
  if (!canDecideForChurch(me, data)) return fail(res, 403, 'FORBIDDEN', 'Only the Church Leader reviews transfers');
  const a = (await prisma.budgetAmendment.findUnique({ where: { id: String(req.params.aid) } })) as Amend | null;
  if (!a || a.kind !== 'TRANSFER' || a.status !== 'APPROVED') return fail(res, 404, 'NOT_FOUND', 'Not found');
  await prisma.budgetAmendment.update({ where: { id: a.id }, data: { reviewedById: me, reviewedAt: new Date() } });
  res.json({ ok: true });
});

/* ───────────── slice 6: budget cycles and ongoing programs ───────────── */

planMoneyRouter.put('/:id/cycle', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, data, p } = got;
  if (!canManagePlan(p, me, data)) return fail(res, 403, 'FORBIDDEN', 'You may not change this activity');
  if (['ENDED', 'CANCELLED'].includes(p.status) || (p.timingKind !== 'REPEAT' && p.planType !== 'PROGRAM')) return fail(res, 409, 'WRONG_STATE', 'A budget cycle belongs to a repeat or an ongoing program');
  const b = z.object({ cycle: z.enum(BUDGET_CYCLES), cycles: z.number().int().min(1).max(CYCLES_MAX).nullish(), confirm: z.boolean().optional() }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Choose how the allowance is counted and for how long');
  const next = { ...p, budgetCycle: b.data.cycle, budgetCycles: b.data.cycles ?? null };
  const problem = p.timingKind === 'REPEAT' || next.budgetCycles ? cycleProblem({ ...next, timingKind: next.timingKind ?? 'REPEAT' } as never) : null;
  if (problem || (!next.budgetCycles && !next.endsOn && !isOngoing(next as never))) return fail(res, 409, problem ?? 'CYCLE_REQUIRED', 'Say how the allowance is counted and for how long');
  if (OPEN.includes(p.status)) {
    await prisma.workPlan.update({ where: { id: p.id }, data: { budgetCycle: next.budgetCycle, budgetCycles: next.budgetCycles } });
    await changed({ ...p, budgetCycle: next.budgetCycle, budgetCycles: next.budgetCycles }, me, data);
    return res.json(await view((await prisma.workPlan.findUnique({ where: { id: p.id } })) as Plan, me, data));
  }
  // After approval the money is locked; a repeat can only be shortened, and the unused cycles go back to their sources.
  const had = cyclesOf(p as never);
  if (!had || !next.budgetCycles || next.budgetCycle !== p.budgetCycle || next.budgetCycles >= had) return fail(res, 409, 'MONEY_LOCKED', 'The money is locked once the activity is approved');
  const open = ((await prisma.budgetAmendment.findMany({ where: { planId: p.id } })) as Amend[]).find((a) => a.planId === p.id && a.status === 'PENDING');
  if (open) return fail(res, 409, 'AMENDMENT_OPEN', 'An amendment is already open');
  const allowance = totalOf(liveLines(await linesOf(p.id)));
  const release = releasedOnShorten(allowance, had, next.budgetCycles);
  if (!b.data.confirm) return fail(res, 409, 'CONFIRM_REQUIRED', 'Shortening gives money back to its sources', { release, from: had, to: next.budgetCycles });
  const old = await sourcesOf(p.id);
  const left = reduceSources(old, release);
  for (const o of old) await prisma.planSource.delete({ where: { id: o.id } });
  for (const s of left) await prisma.planSource.create({ data: { planId: p.id, systemId: p.systemId, kind: s.kind, code: s.code, amount: s.amount, createdById: me } });
  await prisma.workPlan.update({ where: { id: p.id }, data: { budgetCycles: next.budgetCycles } });
  await tellMany(holdersWith(p.systemId, 'MONEY', 'W', data).filter((id) => id !== me), p, `Repeat shortened: ${p.title}`, `${release} RWF went back to its sources`, `cycle-short:${p.id}:${next.budgetCycles}`);
  await audit(me, p.systemId, 'MONEY_REPEAT_SHORTENED', `Shortened “${p.title}” from ${had} to ${next.budgetCycles} cycles`, { planId: p.id, release });
  res.json(await view((await prisma.workPlan.findUnique({ where: { id: p.id } })) as Plan, me, data));
});

/**
 * Spending is always recorded. After it is saved, this tells the right people when it took the activity past its plan: the whole activity
 * for a one-off, each cycle's allowance for a repeat, and any spending in an ongoing program's month that was not released.
 */
export async function flagOverspend(planId: string | null | undefined, spentBy: string, entry?: { id: string; amount: number }): Promise<void> {
  try {
    if (!planId) return;
    let p = (await prisma.workPlan.findUnique({ where: { id: planId } })) as Plan | null;
    if (!p || p.deletedAt || !['SETUP', 'RUNNING', 'PAUSED', 'CLOSING', 'ENDED'].includes(p.status)) return;
    // The settlement period may have run out without anyone finalizing: settle first, leaving this entry out of it.
    if (p.status === 'ENDED' && settlementLapsed(p)) { await finalize(p, p.createdById, 'PERIOD', entry?.id); p = (await prisma.workPlan.findUnique({ where: { id: planId } })) as Plan; }
    if (p.status === 'ENDED' && p.settledAt) { if (entry) await postSettlement(p, entry, spentBy); return; }
    if (p.status === 'ENDED' && p.fundraising && p.doneAt) { await syncFundraising(p, spentBy); await warnPool(p, spentBy); }
    const { data } = await loadAccessData(spentBy);
    const live = liveLines(await linesOf(p.id));
    const actual = await actualOf(p);
    const allowance = totalOf(live);
    const unitWise = [...unitApproverIds(p.systemId, data), ...holdersWith(p.systemId, 'MONEY', 'W', data)];
    const leaders = holdersWith(CHURCH_SYSTEM, 'MISSION', 'A', data).filter((id) => canDecideForChurch(id, data));
    const days = actual.map((e) => ({ amount: e.amount, day: churchDay(e.occurredOn) }));
    const cycle = (BUDGET_CYCLES as readonly string[]).includes(String(p.budgetCycle)) ? (p.budgetCycle as BudgetCycle) : null;
    let over = 0;
    if (cycle && p.timingKind === 'REPEAT') over = Math.max(0, ...overspendByCycle(days, allowance, cycle, occurrenceDays(p)).map((c) => c.over));
    else if (!isOngoing(p as never)) over = overBy(allowance * mult(p), actual.reduce((n, e) => n + e.amount, 0));
    if (over > 0) await tellMany(unitWise.filter((id) => id !== spentBy), p, `Over plan by ${over.toLocaleString('en')}: ${p.title}`, null, `overspend:${p.id}:${over}`, true);
  } catch {
    /* a notice that cannot be sent never blocks the entry */
  }
}
