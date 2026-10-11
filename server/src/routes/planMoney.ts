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
import { asWorkRow, approversOf, canApprove, canDecideForChurch, canManagePlan, currentLevel, holdersWith, levelsOf, treasurerExists, unitApproverIds, CHURCH_SYSTEM, type PlanRow } from '../work/plan.js';
import { occurrencesIn, churchDay } from '../work/timing.js';
import { BUDGET_CYCLES, CYCLES_MAX, cycleKey, cycleProblem, cyclesOf, isOngoing, isReleased, multiplierOf, overspendByCycle, reduceSources, releasedOnShorten, type BudgetCycle } from '../money/cycles.js';
import { amendProblem, classify, overBy, reserveOf, totalOf, touchedLines } from '../money/amendments.js';
import { SOURCE_KINDS, codeFor, earmarkProblem, potId } from '../money/funds.js';
import { adjustLevels, afterEdit, allVerified, checkNote, figures, liveLines, submitProblem, type MoneyCheck } from '../money/planMoney.js';
import { canReadMoney } from '../money/rules.js';
import { potsOf } from './incomeFunds.js';
import { settleView } from './planSettle.js';
import { finalize, postSettlement, syncFundraising, warnPool } from '../money/settlement.js';
import { settlementLapsed } from '../money/settle.js';

export const planMoneyRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string, extra: object = {}) => res.status(status).json({ error, code, ...extra });

interface Plan extends PlanRow { title: string; moneyCheckJson?: string | null; startsOn?: Date | string | null; endsOn?: Date | string | null; planType?: string | null; timingKind?: string | null; repeatJson?: string | null; budgetCycle?: string | null; budgetCycles?: number | null; fundraising?: boolean | null; fundTarget?: number | null; doneAt?: Date | string | null; settledAt?: Date | string | null; settlementJson?: string | null; createdById: string }
interface Amend { id: string; planId: string; systemId: string; kind: string; status: string; oldTotal: number; newTotal: number; justification: string; linesJson: string; sourcesJson: string; reserveJson: string; requestedById: string; requestedAt: Date | string; decidedById: string | null; decidedAt: Date | string | null; decisionNote: string | null; reviewedAt: Date | string | null }
interface Entry { id: string; planId: string | null; kind: string; status: string; amount: number; occurredOn: Date | string }
interface Line { id: string; planId: string | null; systemId: string; title: string; amount: number; category: string | null; status: string; note: string | null; checkState: string | null; checkedById: string | null; checkedAt: Date | string | null; year: number; createdAt: Date | string }
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
const monthNow = () => churchDay(new Date()).slice(0, 7);
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

/** Cycles, spending against plan, amendments and monthly release: what the page needs after approval. */
async function extras(p: Plan, me: string, data: Awaited<ReturnType<typeof loadAccessData>>['data'], f: { planned: number }, live: Line[]) {
  const manage = canManagePlan(p, me, data);
  const m = mult(p);
  const allowance = totalOf(live);
  const actual = await actualOf(p);
  const spent = actual.reduce((n, e) => n + e.amount, 0);
  const cycle = (BUDGET_CYCLES as readonly string[]).includes(String(p.budgetCycle)) ? (p.budgetCycle as BudgetCycle) : null;
  const ongoing = isOngoing(p as never);
  const perCycle = cycle && p.timingKind === 'REPEAT' ? overspendByCycle(actual.map((e) => ({ amount: e.amount, day: churchDay(e.occurredOn) })), allowance, cycle, occurrenceDays(p)) : [];
  const renewals = ongoing ? ((await prisma.planRenewal.findMany({ where: { planId: p.id } })) as Array<{ planId: string; month: string }>).filter((r) => r.planId === p.id) : [];
  const amends = ((await prisma.budgetAmendment.findMany({ where: { planId: p.id } })) as Amend[]).filter((a) => a.planId === p.id).sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()).slice(0, 10);
  const names = new Map(((await prisma.person.findMany({ where: { id: { in: [...new Set(amends.flatMap((a) => [a.requestedById, a.decidedById ?? '-']))] } } })) as Array<{ id: string; fullName: string }>).map((x) => [x.id, x.fullName]));
  const pending = amends.find((a) => a.status === 'PENDING') ?? null;
  const approved = APPROVED_STATES.includes(p.status);
  const may = (kind: string) => (kind === 'INCREASE' ? canDecideForChurch(me, data) : amendApprover(me, p, data));
  return {
    locked: !OPEN.includes(p.status),
    cycle: { kind: cycle, cycles: cyclesOf(p as never), explicit: p.budgetCycles ?? null, allowance, multiplier: m, ongoing, repeat: p.timingKind === 'REPEAT', problem: cycleProblem(p as never) },
    canSetCycle: manage && !['ENDED', 'CANCELLED'].includes(p.status) && (p.timingKind === 'REPEAT' || p.planType === 'PROGRAM'),
    actual: spent, over: overBy(f.planned, spent), perCycle,
    ongoingMonth: ongoing ? { month: monthNow(), released: isReleased(renewals, monthNow()), renewed: renewals.map((r) => r.month).sort() } : null,
    canRenew: ongoing && approved && canDecideForChurch(me, data),
    canRequestAmendment: manage && approved && !pending,
    canWithdrawAmendment: manage && !!pending,
    pendingAmendment: pending ? amendShape(pending, names, may(pending.kind)) : null,
    amendments: amends.filter((a) => a.status !== 'PENDING').map((a) => amendShape(a, names, false)),
  };
}

/** Who decides a transfer: the unit's President; in the church's own system, or where no President serves, the Church Leader. */
function amendApprover(me: string, p: Plan, data: Awaited<ReturnType<typeof loadAccessData>>['data']): boolean {
  if (canDecideForChurch(me, data)) return true;
  return p.systemId !== CHURCH_SYSTEM && unitApproverIds(p.systemId, data).includes(me);
}

function amendShape(a: Amend, who: Map<string, string>, canDecide: boolean) {
  return {
    id: a.id, kind: a.kind, status: a.status, oldTotal: a.oldTotal, newTotal: a.newTotal, justification: a.justification, requestedByName: who.get(a.requestedById) ?? '',
    requestedAt: new Date(a.requestedAt).toISOString(), decidedByName: a.decidedById ? who.get(a.decidedById) ?? '' : null, decisionNote: a.decisionNote, reviewed: !!a.reviewedAt,
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
  return {
    planId: p.id, status: p.status, open: OPEN.includes(p.status), ...f,
    canEdit: manage && OPEN.includes(p.status),
    canVerify: atTreasurer && canApprove(p, me, data),
    canCheck: atTreasurer && canApprove(p, me, data),
    allVerified: allVerified(lines),
    lines: live.map((l) => ({ id: l.id, title: l.title, amount: l.amount, category: l.category, note: l.note, checkState: l.checkState ?? null })),
    sources: sources.map((s) => ({ kind: s.kind, code: s.code, amount: s.amount, potId: potId(s.kind, s.code) })),
    pots, check: check ? { result: check.result, note: check.note, at: check.at, byName: who.get(check.byId) ?? '' } : null,
    ...(await extras(p, me, data, f, live)),
    ...(await settleView(p, me, data, f.planned, f.earmarked)),
  };
}

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

const lineSchema = z.object({ title: z.string().trim().min(1).max(TITLE_MAX), amount: z.number().int().min(1).max(AMOUNT_MAX), category: z.string().trim().max(60).nullish(), note: z.string().trim().max(NOTE_MAX).nullish() });

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
  await prisma.moneyPlanItem.create({ data: { systemId: got.p.systemId, year: planYear(got.p), title: b.data.title, amount: b.data.amount, category: b.data.category ?? null, note: b.data.note ?? null, planId: got.p.id, createdById: got.me } });
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

const amendSchema = z.object({
  justification: z.string().trim().min(1).max(NOTE_MAX),
  lines: z.array(z.object({ id: z.string().min(1).nullish(), title: z.string().trim().min(1).max(TITLE_MAX), amount: z.number().int().min(1).max(AMOUNT_MAX) })).max(80),
  sources: z.array(z.object({ kind: z.enum(SOURCE_KINDS), code: z.string().max(40).nullish(), amount: z.number().int().min(1).max(AMOUNT_MAX) })).max(40),
});

const tellMany = async (ids: string[], p: Plan, title: string, body: string | null, key: string, important = false) => {
  for (const id of new Set(ids)) await notifySafely(prisma as never, { kind: important ? 'WAITING_FOR_ME' : 'FOR_INFORMATION', toPersonId: id, systemId: p.systemId, title, body, href: `/s/${p.systemId}/work/plans/${p.id}`, important, sourceKey: `${key}:${id}` });
};
/** The unit's President decides transfers; with none, or in the church's own system, the Church Leader does. */
const transferDeciders = (p: Plan, data: Awaited<ReturnType<typeof loadAccessData>>['data']) => {
  const unit = p.systemId === CHURCH_SYSTEM ? [] : unitApproverIds(p.systemId, data);
  return unit.length ? unit : holdersWith(CHURCH_SYSTEM, 'MISSION', 'A', data).filter((id) => canDecideForChurch(id, data));
};

planMoneyRouter.post('/:id/amendments', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, data, p } = got;
  if (!canManagePlan(p, me, data)) return fail(res, 403, 'FORBIDDEN', 'You may not change this activity');
  if (!APPROVED_STATES.includes(p.status)) return fail(res, 409, 'WRONG_STATE', 'Only an approved activity needs an amendment');
  const open = ((await prisma.budgetAmendment.findMany({ where: { planId: p.id } })) as Amend[]).find((a) => a.planId === p.id && a.status === 'PENDING');
  if (open) return fail(res, 409, 'AMENDMENT_OPEN', 'An amendment is already open');
  const b = amendSchema.safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Please give the new lines, the money set aside and a reason');
  const current = liveLines(await linesOf(p.id));
  const known = new Set(current.map((l) => l.id));
  if (b.data.lines.some((l) => l.id && !known.has(l.id))) return fail(res, 400, 'BAD_INPUT', 'Unknown line');
  const sources: Array<{ kind: string; code: string; amount: number }> = [];
  for (const s of b.data.sources) {
    const code = codeFor(s.kind, s.code);
    if (code === null) return fail(res, 400, 'BAD_SOURCE', 'Unknown source');
    sources.push({ kind: s.kind, code, amount: s.amount });
  }
  const m = mult(p);
  const problem = amendProblem(current, b.data.lines, sources, m);
  if (problem === 'NO_CHANGE') return fail(res, 400, 'NO_CHANGE', 'Nothing was changed');
  if (problem === 'GAP') return fail(res, 409, 'FUNDING_GAP', 'The money set aside must match the planned spending');
  const oldTotal = totalOf(current) * m;
  const newTotal = totalOf(b.data.lines) * m;
  const reserve = reserveOf(await sourcesOf(p.id), sources);
  const short = earmarkProblem(await potsOf(p.systemId), reserve);
  if (short) return fail(res, short.code === 'INSUFFICIENT_FUNDS' ? 409 : 400, short.code, 'That is more than is available', short);
  const kind = classify(oldTotal, newTotal);
  const row = (await prisma.budgetAmendment.create({
    data: { planId: p.id, systemId: p.systemId, requestedAt: new Date(), status: 'PENDING', kind, oldTotal, newTotal, justification: b.data.justification, linesJson: JSON.stringify(b.data.lines), sourcesJson: JSON.stringify(sources), reserveJson: JSON.stringify(reserve), requestedById: me },
  })) as Amend;
  await tellMany((kind === 'INCREASE' ? holdersWith(CHURCH_SYSTEM, 'MISSION', 'A', data).filter((id) => canDecideForChurch(id, data)) : transferDeciders(p, data)).filter((id) => id !== me || kind === 'INCREASE'), p, `${kind === 'INCREASE' ? 'Budget increase to approve' : 'Budget transfer to approve'}: ${p.title}`, b.data.justification, `amend-ask:${row.id}`, true);
  await audit(me, p.systemId, 'MONEY_AMENDMENT_REQUESTED', `${kind} for “${p.title}”: ${oldTotal} to ${newTotal}`, { planId: p.id, amendmentId: row.id });
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

planMoneyRouter.post('/:id/amendments/:aid/approve', requireAuth, async (req: AuthedRequest, res) => {
  const got = await pendingFor(req, res);
  if (!got) return;
  const { me, data, p, a } = got;
  const allowed = a.kind === 'INCREASE' ? canDecideForChurch(me, data) : amendApprover(me, p, data);
  if (!allowed) return fail(res, 403, 'FORBIDDEN', a.kind === 'INCREASE' ? 'Only the Church Leader approves a higher total' : 'Only the President approves a transfer');
  const lines = parse<Array<{ id?: string | null; title: string; amount: number }>>(a.linesJson, []);
  const sources = parse<Array<{ kind: string; code: string; amount: number }>>(a.sourcesJson, []);
  // The money must still be there: this plan's own earmark and reservation are set aside when checking.
  const short = earmarkProblem(await potsOf(p.systemId, p.id), sources);
  if (short) return fail(res, 409, short.code, 'The money is no longer available', short);
  const current = liveLines(await linesOf(p.id));
  const t = touchedLines(current, lines);
  for (const id of t.dropped) await prisma.moneyPlanItem.update({ where: { id }, data: { status: 'DROPPED' } });
  const year = p.startsOn ? new Date(p.startsOn).getUTCFullYear() : new Date().getUTCFullYear();
  for (const l of t.changed) {
    if (l.id) await prisma.moneyPlanItem.update({ where: { id: l.id }, data: { title: l.title, amount: l.amount, checkState: 'MODIFIED', checkedById: null, checkedAt: null } });
    else await prisma.moneyPlanItem.create({ data: { systemId: p.systemId, year, title: l.title, amount: l.amount, planId: p.id, createdById: a.requestedById, checkState: 'MODIFIED' } });
  }
  for (const old of await sourcesOf(p.id)) await prisma.planSource.delete({ where: { id: old.id } });
  for (const s of sources) await prisma.planSource.create({ data: { planId: p.id, systemId: p.systemId, kind: s.kind, code: s.code, amount: s.amount, createdById: a.requestedById } });
  const note = z.object({ note: z.string().trim().max(NOTE_MAX).nullish() }).safeParse(req.body ?? {});
  await prisma.budgetAmendment.update({ where: { id: a.id }, data: { status: 'APPROVED', decidedById: me, decidedAt: new Date(), decisionNote: (note.success && note.data.note) || null } });
  await tellMany([a.requestedById, ...holdersWith(p.systemId, 'MONEY', 'W', data)].filter((id) => id !== me), p, `${a.kind === 'INCREASE' ? 'Budget increase approved' : 'Budget transfer approved'}: ${p.title}`, t.changed.length ? 'Changed lines need to be checked again' : null, `amend-done:${a.id}`);
  await audit(me, p.systemId, a.kind === 'INCREASE' ? 'MONEY_BUDGET_INCREASED' : 'MONEY_EXECUTIVE_TRANSFER', `${a.kind} for “${p.title}”: ${a.oldTotal} to ${a.newTotal}`, { planId: p.id, amendmentId: a.id });
  res.json(await view(p, me, data));
});

planMoneyRouter.post('/:id/amendments/:aid/reject', requireAuth, async (req: AuthedRequest, res) => {
  const got = await pendingFor(req, res);
  if (!got) return;
  const { me, data, p, a } = got;
  const allowed = a.kind === 'INCREASE' ? canDecideForChurch(me, data) : amendApprover(me, p, data);
  if (!allowed) return fail(res, 403, 'FORBIDDEN', 'You may not decide this');
  const b = z.object({ reason: z.string().trim().min(1).max(NOTE_MAX) }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'REASON_REQUIRED', 'Please give a reason');
  // The reservation is released at once: a rejected amendment no longer holds any money.
  await prisma.budgetAmendment.update({ where: { id: a.id }, data: { status: 'REJECTED', decidedById: me, decidedAt: new Date(), decisionNote: b.data.reason } });
  await tellMany([a.requestedById].filter((id) => id !== me), p, `Budget change declined: ${p.title}`, b.data.reason, `amend-no:${a.id}`);
  await audit(me, p.systemId, 'MONEY_AMENDMENT_REJECTED', `Declined ${a.kind} for “${p.title}”`, { planId: p.id, amendmentId: a.id, reason: b.data.reason });
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

/** The Church Leader releases an ongoing program's money for one month. */
planMoneyRouter.post('/:id/renew-month', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, data, p } = got;
  if (!isOngoing(p as never) || !APPROVED_STATES.includes(p.status)) return fail(res, 409, 'WRONG_STATE', 'Only an approved ongoing program is renewed');
  if (!canDecideForChurch(me, data)) return fail(res, 403, 'FORBIDDEN', 'Only the Church Leader releases a month');
  const b = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() }).safeParse(req.body ?? {});
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Pick a month');
  const month = b.data.month ?? monthNow();
  const taken = ((await prisma.planRenewal.findMany({ where: { planId: p.id } })) as Array<{ planId: string; month: string }>).some((r) => r.planId === p.id && r.month === month);
  if (taken) return fail(res, 409, 'ALREADY_RENEWED', 'This month is already released');
  await prisma.planRenewal.create({ data: { planId: p.id, month, renewedById: me } });
  await tellMany([p.createdById, p.leaderPersonId, ...holdersWith(p.systemId, 'MONEY', 'W', data)].filter((id) => id !== me), p, `Month released: ${p.title}`, month, `renew:${p.id}:${month}`);
  await audit(me, p.systemId, 'MONEY_MONTH_RELEASED', `Released ${month} for “${p.title}”`, { planId: p.id, month });
  res.json(await view(p, me, data));
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
    const latest = [...days].sort((a, b) => a.day.localeCompare(b.day)).pop();
    if (isOngoing(p as never) && latest) {
      const renewals = ((await prisma.planRenewal.findMany({ where: { planId: p.id } })) as Array<{ planId: string; month: string }>).filter((r) => r.planId === p.id);
      const month = latest.day.slice(0, 7);
      if (!isReleased(renewals, month)) await tellMany([...leaders, ...holdersWith(p.systemId, 'MONEY', 'W', data)].filter((id) => id !== spentBy), p, `Spending in a month that is not released: ${p.title}`, month, `unreleased:${p.id}:${month}:${actual.length}`, true);
    }
    const cycle = (BUDGET_CYCLES as readonly string[]).includes(String(p.budgetCycle)) ? (p.budgetCycle as BudgetCycle) : null;
    let over = 0;
    if (cycle && p.timingKind === 'REPEAT') over = Math.max(0, ...overspendByCycle(days, allowance, cycle, occurrenceDays(p)).map((c) => c.over));
    else if (!isOngoing(p as never)) over = overBy(allowance * mult(p), actual.reduce((n, e) => n + e.amount, 0));
    if (over > 0) await tellMany(unitWise.filter((id) => id !== spentBy), p, `Over plan by ${over.toLocaleString('en')}: ${p.title}`, null, `overspend:${p.id}:${over}`, true);
  } catch {
    /* a notice that cannot be sent never blocks the entry */
  }
}
