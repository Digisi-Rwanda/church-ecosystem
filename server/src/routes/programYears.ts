/**
 * The yearly life of a program (slice B): the Church Leader's annual review, and the President's funding of the year that follows.
 *
 * The money of a program is cumulative: its lines and its set-aside move together. At a review the unspent part of the year goes back to
 * the pots (lines and set-aside both shrink to what was spent); the Church Leader sets the Next Year Budget; until the President sets aside
 * funds that match it the program shows "Needs funding"; then one new line and the new set-aside bring the totals level again and the year begins.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { notifySafely } from '../lib/notify.js';
import { NOTE_MAX, canSee } from '../work/rules.js';
import { asWorkRow, canDecideForChurch, canManagePlan, holdersWith, unitApproverIds } from '../work/plan.js';
import { canApproveSpending } from '../money/rules.js';
import { SOURCE_INPUT_KINDS, earmarkProblem, normSource, shareProportional } from '../money/funds.js';
import { reduceProportional } from '../money/cycles.js';
import { liveLines } from '../money/planMoney.js';
import { potsOf } from './incomeFunds.js';
import { onDone } from './planSettle.js';

export const programYearsRouter = Router();
type Res = import('express').Response;
type Data = Awaited<ReturnType<typeof loadAccessData>>['data'];
const fail = (res: Res, status: number, code: string, error: string, extra: object = {}) => res.status(status).json({ error, code, ...extra });

interface PlanRow {
  id: string; systemId: string; title: string; status: string; planType?: string | null; programKind?: string | null; hasMoney?: boolean | null;
  startsOn?: Date | string | null; endsOn?: Date | string | null; kindJson?: string | null; leaderPersonId: string; createdById: string; deletedAt?: Date | string | null;
  visibility: string; orgUnitId: string; beyondUnit: boolean; teamJson: string; approvalsJson: string; status2?: never;
}
export interface YearRow {
  id: string; planId: string; systemId: string; year: number; status: string; amount: number; spent: number | null; returned: number | null; attendance: number | null;
  decision: string | null; note: string | null; decidedAt: Date | string | null; fundedAt: Date | string | null;
}
interface Line { id: string; planId: string | null; amount: number; status: string; title: string }
interface Src { id: string; planId: string; kind: string; code: string; amount: number }
interface Ent { planId: string | null; kind: string; status: string; amount: number; occurredOn: Date | string }

const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);
const startYearOf = (p: PlanRow) => (p.startsOn ? new Date(p.startsOn).getUTCFullYear() : new Date().getUTCFullYear());
const endYearOf = (p: PlanRow): number | null => {
  if (p.programKind !== 'FIXED_TERM') return null;
  try { const k = JSON.parse(p.kindJson ?? '{}') as { endYear?: number | null }; return k.endYear ?? (p.endsOn ? new Date(p.endsOn).getUTCFullYear() : null); } catch { return null; }
};
export const yearsOf = async (planId: string): Promise<YearRow[]> =>
  ((await prisma.programYear.findMany({ where: { planId } })) as YearRow[]).filter((y) => y.planId === planId).sort((a, b) => a.year - b.year);
/** The year the program is in: the latest one that has begun (or was skipped), else the year it started. */
export const currentYearOf = (p: PlanRow, rows: YearRow[]): number => Math.max(startYearOf(p), ...rows.filter((r) => r.status === 'ACTIVE' || r.status === 'SKIPPED' || r.status === 'CLOSED').map((r) => r.year));
const linesOf = async (planId: string) => liveLines(((await prisma.moneyPlanItem.findMany({ where: { planId } })) as Line[]).filter((l) => l.planId === planId)) as Line[];
const sourcesOf = async (planId: string) => ((await prisma.planSource.findMany({ where: { planId } })) as Src[]).filter((s) => s.planId === planId);
const entriesOf = async (planId: string) => ((await prisma.moneyEntry.findMany({ where: { planId } })) as Ent[]).filter((e) => e.planId === planId && e.kind === 'SPENDING' && e.status !== 'REJECTED' && e.status !== 'VOIDED');
const sum = (xs: Array<{ amount: number }>) => xs.reduce((n, x) => n + x.amount, 0);

async function audit(actorId: string, systemId: string, action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({ data: { at: new Date(), actorId, systemId, action, resource: 'MONEY', detail, metaJson: JSON.stringify(meta) } });
}
const tell = async (ids: Iterable<string>, p: PlanRow, me: string, title: string, body: string | null, key: string, important = false) => {
  for (const id of new Set(ids)) if (id !== me) await notifySafely(prisma as never, { kind: important ? 'WAITING_FOR_ME' : 'FOR_INFORMATION', toPersonId: id, systemId: p.systemId, title, body, href: `/s/${p.systemId}/work/plans/${p.id}`, important, sourceKey: `${key}:${id}` });
};

/** Return the unspent part of the budget: the lines and the set-aside shrink together to what has been spent. */
async function giveBackUnspent(p: PlanRow, by: string, year: number): Promise<{ allowance: number; spent: number; returned: number }> {
  const lines = await linesOf(p.id);
  const allowance = sum(lines);
  const entries = await entriesOf(p.id);
  const spent = sum(entries);
  const returned = Math.max(0, allowance - spent);
  if (returned > 0 && p.hasMoney !== false) {
    for (const s of shareProportional(lines, returned)) {
      const left = s.item.amount - s.amount;
      await prisma.moneyPlanItem.update({ where: { id: s.item.id }, data: left > 0 ? { amount: left } : { status: 'DROPPED' } });
    }
    const srcs = await sourcesOf(p.id);
    const next = reduceProportional(srcs, returned);
    for (const old of srcs) await prisma.planSource.delete({ where: { id: old.id } });
    for (const n of next) await prisma.planSource.create({ data: { planId: p.id, systemId: p.systemId, kind: n.kind, code: n.code, amount: n.amount, createdById: by } });
    await audit(by, p.systemId, 'PROGRAM_YEAR_RETURNED', `Returned ${returned} RWF unspent from “${p.title}” (${year})`, { planId: p.id, year, returned });
  }
  return { allowance, spent, returned };
}

/** A year that is over: keep what it cost and what went back. */
async function closeYear(p: PlanRow, year: number, by: string, decision: string, note: string | null, money: { allowance: number; spent: number; returned: number }) {
  const spentThatYear = sum((await entriesOf(p.id)).filter((e) => new Date(e.occurredOn).getUTCFullYear() === year));
  const existing = (await yearsOf(p.id)).find((r) => r.year === year);
  const data = { status: 'CLOSED', amount: existing?.amount || money.allowance, spent: spentThatYear, returned: money.returned, decision, note, decidedById: by, decidedAt: new Date() };
  if (existing) await prisma.programYear.update({ where: { id: existing.id }, data });
  else await prisma.programYear.create({ data: { planId: p.id, systemId: p.systemId, year, ...data } });
}

/** The program's calendar moves to the year that begins (a fixed term keeps its own dates). */
async function beginYear(p: PlanRow, row: YearRow) {
  await prisma.programYear.update({ where: { id: row.id }, data: { status: 'ACTIVE' } });
  if (p.programKind !== 'FIXED_TERM') await prisma.workPlan.update({ where: { id: p.id }, data: { startsOn: new Date(Date.UTC(row.year, 0, 1)), endsOn: new Date(Date.UTC(row.year, 11, 31)) } });
}

async function end(p: PlanRow, me: string, outcome: string) {
  await prisma.workPlan.update({ where: { id: p.id }, data: { status: 'ENDED', outcome, reportPublishedAt: new Date(), reportPublishedById: me } });
  await onDone(p.id, me);
}

const LIVE = ['SETUP', 'RUNNING', 'PAUSED'];
const optionsOf = (p: PlanRow, year: number, endYear: number | null): string[] => {
  switch (p.programKind) {
    case 'FIXED_TERM': return endYear !== null && year >= endYear ? ['CLOSE'] : ['CONTINUE', 'END_EARLY'];
    case 'COHORT': return ['CONTINUE', 'CLOSE'];
    case 'SEASONAL': return ['PREPARE', 'SKIP'];
    default: return ['CONTINUE', 'CLOSE'];
  }
};

async function load(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const { data } = await loadAccessData(me);
  const p = (await prisma.workPlan.findUnique({ where: { id: String(req.params.id) } })) as PlanRow | null;
  if (!p || p.deletedAt || !canSee(asWorkRow(p as never), me, data)) return fail(res, 404, 'NOT_FOUND', 'Plan not found'), null;
  if (p.planType !== 'PROGRAM' || !p.programKind) return fail(res, 409, 'NOT_A_KIND_PROGRAM', 'Only a program with a kind has an annual review'), null;
  return { me, data, p };
}

export async function reviewView(p: PlanRow, me: string, data: Data) {
  const rows = await yearsOf(p.id);
  const year = currentYearOf(p, rows);
  const endYear = endYearOf(p);
  const pending = rows.find((r) => r.status === 'PLANNED') ?? null;
  const lines = await linesOf(p.id);
  const allowance = sum(lines);
  const spent = sum(await entriesOf(p.id));
  const live = LIVE.includes(p.status) && !(p as { suspendedAt?: unknown }).suspendedAt;
  const money = p.hasMoney !== false;
  return {
    year, kind: p.programKind, hasMoney: money, endYear, yearsRemaining: endYear !== null ? Math.max(0, endYear - year) : null,
    canReview: canDecideForChurch(me, data) && live && !pending,
    canFund: !!pending && money && canApproveSpending(me, p.systemId, data) && LIVE.includes(p.status),
    options: optionsOf(p, year, endYear),
    actuals: { budget: allowance, spent, unspent: Math.max(0, allowance - spent), overspent: Math.max(0, spent - allowance) },
    needsFunding: pending ? { year: pending.year, amount: pending.amount } : null,
    years: rows.filter((r) => r.status !== 'PLANNED').map((r) => ({ year: r.year, status: r.status, budget: r.amount, spent: r.spent, returned: r.returned, attendance: r.attendance, decision: r.decision, note: r.note })),
  };
}

programYearsRouter.get('/:id/annual-review', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  let { p } = got;
  // A fixed term ends by itself once its last year is over, and its money settles as for any program that closes.
  const endYear = endYearOf(p);
  if (endYear !== null && p.status === 'RUNNING' && new Date().getUTCFullYear() > endYear) {
    const money = await giveBackUnspent(p, got.me, endYear);
    await closeYear(p, endYear, got.me, 'CLOSE', 'The term ended', money);
    await end(p, got.me, 'The program reached the end of its term');
    p = (await prisma.workPlan.findUnique({ where: { id: p.id } })) as PlanRow;
  }
  res.json(await reviewView(p, got.me, got.data));
});

const DECISIONS = ['CONTINUE', 'PREPARE', 'CLOSE', 'END_EARLY', 'SKIP'] as const;
programYearsRouter.post('/:id/annual-review', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, data, p } = got;
  if (!canDecideForChurch(me, data)) return fail(res, 403, 'FORBIDDEN', 'Only the Church Leader does the annual review');
  const b = z.object({ decision: z.enum(DECISIONS), nextBudget: z.number().int().min(0).max(2_000_000_000).nullish(), note: z.string().trim().max(NOTE_MAX).nullish(), attendance: z.number().int().min(0).max(1_000_000).nullish() }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Check the decision and the amount');
  const rows = await yearsOf(p.id);
  if (!LIVE.includes(p.status) || rows.some((r) => r.status === 'PLANNED')) return fail(res, 409, 'WRONG_STATE', 'The review is not open now');
  const year = currentYearOf(p, rows);
  const { decision } = b.data;
  if (!optionsOf(p, year, endYearOf(p)).includes(decision)) return fail(res, 409, 'NOT_AVAILABLE', 'That choice does not apply to this program now');
  const carry = decision === 'CONTINUE' || decision === 'PREPARE';
  if (p.programKind === 'COHORT' && ((await prisma.programCohort.findMany({ where: { planId: p.id } })) as Array<{ planId: string; status: string; endsOn: Date | string }>).some((c) => c.planId === p.id && c.status === 'ACTIVE' && new Date(c.endsOn).toISOString().slice(0, 10) < new Date().toISOString().slice(0, 10)))
    return fail(res, 409, 'COHORT_OPEN', 'Close the cohort that has ended first');
  const money = p.hasMoney !== false;
  if (carry && money && !(b.data.nextBudget && b.data.nextBudget > 0)) return fail(res, 400, 'BUDGET_NEEDED', 'Set the Next Year Budget');
  const note = b.data.note || null;
  const ended = decision === 'CLOSE' || decision === 'END_EARLY';
  const back = await giveBackUnspent(p, me, year);
  await closeYear(p, year, me, decision, note, back);
  if (b.data.attendance != null) await prisma.programYear.update({ where: { id: ((await yearsOf(p.id)).find((r) => r.year === year) as YearRow).id }, data: { attendance: b.data.attendance } });
  if (ended) {
    await end(p, me, note || (decision === 'END_EARLY' ? 'Ended early at the annual review' : 'Closed at the annual review'));
  } else {
    const row = (await prisma.programYear.create({ data: { planId: p.id, systemId: p.systemId, year: year + 1, status: decision === 'SKIP' ? 'SKIPPED' : 'PLANNED', amount: carry && money ? b.data.nextBudget ?? 0 : 0, decision, note, decidedById: me, decidedAt: new Date() } })) as YearRow;
    if (carry && !money) await beginYear(p, row);
    if (carry && money) await tell(holdersWith(p.systemId, 'MONEY', 'A', data), p, me, `Needs funding for ${year + 1}: ${p.title}`, `${row.amount} RWF to set aside`, `py-fund:${p.id}:${year + 1}`, true);
  }
  await audit(me, p.systemId, 'PROGRAM_YEAR_REVIEWED', `Annual review of “${p.title}” (${year}): ${decision}`, { planId: p.id, year, decision, nextBudget: b.data.nextBudget ?? null, ...back });
  await tell([p.leaderPersonId, p.createdById, ...unitApproverIds(p.systemId, data)], p, me, `Annual review done: ${p.title}`, decision, `py-done:${p.id}:${year}`);
  const fresh = (await prisma.workPlan.findUnique({ where: { id: p.id } })) as PlanRow;
  res.json(await reviewView(fresh, me, data));
});

/** The President sets money aside to match the Next Year Budget. Cost and set-aside are level again before the year begins. */
programYearsRouter.put('/:id/annual-review/funding', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, data, p } = got;
  if (!canApproveSpending(me, p.systemId, data)) return fail(res, 403, 'FORBIDDEN', 'Only the President sets the money aside');
  const row = (await yearsOf(p.id)).find((r) => r.status === 'PLANNED');
  if (!row || p.hasMoney === false || !LIVE.includes(p.status)) return fail(res, 409, 'WRONG_STATE', 'There is nothing to fund now');
  const b = z.object({ sources: z.array(z.object({ kind: z.enum(SOURCE_INPUT_KINDS), code: z.string().max(40).nullish(), amount: z.number().int().min(0).max(2_000_000_000) })).max(40) }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Invalid sources');
  const add: Array<{ kind: string; code: string; amount: number }> = [];
  for (const s of b.data.sources.filter((x) => x.amount > 0)) {
    const n = normSource(s.kind, s.code);
    if (!n) return fail(res, 400, 'BAD_SOURCE', 'Unknown source');
    add.push({ kind: n.kind, code: n.code, amount: s.amount });
  }
  if (sum(add) !== row.amount) return fail(res, 409, 'FUNDING_GAP', 'The money set aside must equal the Next Year Budget', { amount: row.amount, aside: sum(add) });
  const merged = new Map<string, { kind: string; code: string; amount: number }>();
  for (const s of [...(await sourcesOf(p.id)), ...add]) { const k = `${s.kind}|${s.code}`; merged.set(k, { kind: s.kind, code: s.code, amount: (merged.get(k)?.amount ?? 0) + s.amount }); }
  const lines = await linesOf(p.id);
  const ctx = { id: p.id, categories: [...lines.map(() => null as string | null), null] };
  const problem = earmarkProblem(await potsOf(p.systemId, p.id), [...merged.values()], ctx);
  if (problem) return fail(res, problem.code === 'INSUFFICIENT_FUNDS' ? 409 : 400, problem.code, 'That is more than is available', problem);
  for (const old of await sourcesOf(p.id)) await prisma.planSource.delete({ where: { id: old.id } });
  for (const m of merged.values()) await prisma.planSource.create({ data: { planId: p.id, systemId: p.systemId, kind: m.kind, code: m.code, amount: m.amount, createdById: me } });
  await prisma.moneyPlanItem.create({ data: { systemId: p.systemId, year: row.year, title: `Budget ${row.year}`, amount: row.amount, planId: p.id, createdById: me } });
  await prisma.programYear.update({ where: { id: row.id }, data: { fundedById: me, fundedAt: new Date() } });
  await beginYear(p, row);
  await audit(me, p.systemId, 'PROGRAM_YEAR_FUNDED', `Funded ${row.year} for “${p.title}”`, { planId: p.id, year: row.year, sources: add });
  await tell([p.leaderPersonId, p.createdById, ...holdersWith(p.systemId, 'MONEY', 'W', data), ...unitApproverIds(p.systemId, data)], p, me, `${row.year} begins: ${p.title}`, `${row.amount} RWF set aside`, `py-begun:${p.id}:${row.year}`);
  const fresh = (await prisma.workPlan.findUnique({ where: { id: p.id } })) as PlanRow;
  res.json(await reviewView(fresh, me, data));
});

export const SEASON_TASKS = ['Confirm the date and the venue', 'Confirm the team and their roles', 'Announce it to the church', 'Review what last year taught us'];
const seasonOf = (p: PlanRow, rows: YearRow[]) => {
  let k: { annualMonth?: number | null; preparedYear?: number | null } = {};
  try { k = JSON.parse(p.kindJson ?? '{}'); } catch { /* none */ }
  const year = currentYearOf(p, rows);
  const nowYear = new Date().getUTCFullYear();
  const nowMonth = new Date().getUTCMonth() + 1;
  const month = k.annualMonth ?? 12;
  // The next occurrence is this year's while its month is still ahead, otherwise next year's. A new calendar year closes the old one.
  const base = Math.max(year, nowYear);
  const nextYear = base === nowYear && nowMonth > month ? base + 1 : base;
  const prepared = k.preparedYear === year && nowYear <= year;
  return { year, month, nextYear, phase: prepared ? 'ACTIVE' : 'PREPARING', preparedYear: k.preparedYear ?? null };
};

/** The seasonal cycle: Preparing until the team prepares for the cycle, Active after; the old year closes with the calendar year. */
programYearsRouter.get('/:id/season', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, data, p } = got;
  if (p.programKind !== 'SEASONAL') return fail(res, 409, 'NOT_SEASONAL', 'Only a seasonal program has a cycle');
  const s = seasonOf(p, await yearsOf(p.id));
  res.json({ ...s, canPrepare: canManagePlan(p as never, me, data) && LIVE.includes(p.status) && s.phase === 'PREPARING', closedYearWaiting: new Date().getUTCFullYear() > s.year, tasks: SEASON_TASKS });
});

programYearsRouter.post('/:id/season/prepare', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, data, p } = got;
  if (p.programKind !== 'SEASONAL') return fail(res, 409, 'NOT_SEASONAL', 'Only a seasonal program has a cycle');
  if (!canManagePlan(p as never, me, data)) return fail(res, 403, 'FORBIDDEN', 'You may not change this program');
  const rows = await yearsOf(p.id);
  const s = seasonOf(p, rows);
  if (!LIVE.includes(p.status) || s.phase !== 'PREPARING' || rows.some((r) => r.status === 'PLANNED')) return fail(res, 409, 'WRONG_STATE', 'Not possible now');
  if (new Date().getUTCFullYear() > s.year) return fail(res, 409, 'REVIEW_FIRST', 'The year is over: the Church Leader does the annual review first');
  const b = z.object({ tasks: z.array(z.string().trim().min(1).max(200)).max(20).nullish() }).safeParse(req.body ?? {});
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Check the tasks');
  let k: Record<string, unknown> = {};
  try { k = JSON.parse(p.kindJson ?? '{}'); } catch { /* none */ }
  await prisma.workPlan.update({ where: { id: p.id }, data: { kindJson: JSON.stringify({ ...k, preparedYear: s.year }) } });
  for (const label of b.data.tasks ?? SEASON_TASKS) await prisma.workPlanCheck.create({ data: { planId: p.id, label: `${s.year}: ${label}`, done: false } });
  await audit(me, p.systemId, 'SEASON_PREPARED', `Prepared “${p.title}” for ${s.year}`, { planId: p.id, year: s.year });
  res.json({ ...seasonOf({ ...p, kindJson: JSON.stringify({ ...k, preparedYear: s.year }) }, rows), canPrepare: false, closedYearWaiting: false, tasks: SEASON_TASKS });
});
