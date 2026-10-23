/**
 * Cohorts of a cohort-based program (slice C): Start New Cohort, enrolment, Close Cohort. One runs at a time; a closed cohort moves to the
 * history and the part of its budget it did not spend goes back to the program's yearly allowance.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { NOTE_MAX, TITLE_MAX, canSee } from '../work/rules.js';
import { asWorkRow, canManagePlan } from '../work/plan.js';
import { liveLines } from '../money/planMoney.js';

export const programCohortsRouter = Router();
type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string, extra: object = {}) => res.status(status).json({ error, code, ...extra });

interface PlanRow { id: string; systemId: string; title: string; status: string; planType?: string | null; programKind?: string | null; hasMoney?: boolean | null; kindJson?: string | null; deletedAt?: Date | string | null; [k: string]: unknown }
export interface CohortRow {
  id: string; planId: string; systemId: string; name: string; startsOn: Date | string; endsOn: Date | string; target: number | null; enrolled: number;
  graduated: number | null; budget: number; spent: number | null; status: string; notes: string | null; closedAt: Date | string | null; createdAt: Date | string;
}
interface Line { planId: string | null; amount: number; status: string }
interface Ent { planId: string | null; kind: string; status: string; amount: number; occurredOn: Date | string }

const LIVE = ['SETUP', 'RUNNING', 'PAUSED'];
const day = (v: Date | string) => new Date(v).toISOString().slice(0, 10);
const sum = (xs: Array<{ amount: number }>) => xs.reduce((n, x) => n + x.amount, 0);
export const cohortsOf = async (planId: string): Promise<CohortRow[]> =>
  ((await prisma.programCohort.findMany({ where: { planId } })) as CohortRow[]).filter((c) => c.planId === planId).sort((a, b) => new Date(a.startsOn).getTime() - new Date(b.startsOn).getTime());
const entriesOf = async (planId: string) => ((await prisma.moneyEntry.findMany({ where: { planId } })) as Ent[]).filter((e) => e.planId === planId && e.kind === 'SPENDING' && e.status !== 'REJECTED' && e.status !== 'VOIDED');
const spentIn = (entries: Ent[], c: { startsOn: Date | string; endsOn: Date | string }) =>
  sum(entries.filter((e) => day(e.occurredOn) >= day(c.startsOn) && day(e.occurredOn) <= day(c.endsOn)));

async function load(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const { data } = await loadAccessData(me);
  const p = (await prisma.workPlan.findUnique({ where: { id: String(req.params.id) } })) as PlanRow | null;
  if (!p || p.deletedAt || !canSee(asWorkRow(p as never), me, data)) return fail(res, 404, 'NOT_FOUND', 'Plan not found'), null;
  if (p.planType !== 'PROGRAM' || p.programKind !== 'COHORT') return fail(res, 409, 'NOT_A_COHORT_PROGRAM', 'Only a cohort-based program has cohorts'), null;
  return { me, data, p };
}

async function view(p: PlanRow, me: string, data: Awaited<ReturnType<typeof loadAccessData>>['data']) {
  const rows = await cohortsOf(p.id);
  const entries = await entriesOf(p.id);
  const allowance = sum(liveLines(((await prisma.moneyPlanItem.findMany({ where: { planId: p.id } })) as Line[]).filter((l) => l.planId === p.id)));
  const spent = sum(entries);
  const current = rows.find((c) => c.status === 'ACTIVE') ?? null;
  const shape = (c: CohortRow) => ({
    id: c.id, name: c.name, startsOn: day(c.startsOn), endsOn: day(c.endsOn), target: c.target, enrolled: c.enrolled, graduated: c.graduated, budget: c.budget,
    spent: c.status === 'CLOSED' ? c.spent ?? 0 : spentIn(entries, c), notes: c.notes ?? '', closedAt: c.closedAt ? new Date(c.closedAt).toISOString() : null,
  });
  let pattern = { frequency: '', duration: '', schedule: '', target: null as number | null };
  try { const k = JSON.parse(p.kindJson ?? '{}') as { cohort?: typeof pattern | null }; if (k.cohort) pattern = { frequency: k.cohort.frequency ?? '', duration: k.cohort.duration ?? '', schedule: k.cohort.schedule ?? '', target: k.cohort.target ?? null }; } catch { /* default pattern */ }
  const today = new Date().toISOString().slice(0, 10);
  const total = current ? Math.max(1, (new Date(day(current.endsOn)).getTime() - new Date(day(current.startsOn)).getTime()) / 86_400_000) : 1;
  const gone = current ? (new Date(today).getTime() - new Date(day(current.startsOn)).getTime()) / 86_400_000 : 0;
  const live = LIVE.includes(p.status);
  const canManage = canManagePlan(p as never, me, data) && live;
  return {
    hasMoney: p.hasMoney !== false, canManage, canStart: canManage && !current, pattern,
    current: current ? { ...shape(current), progress: Math.max(0, Math.min(100, Math.round((gone / total) * 100))), ended: day(current.endsOn) < today } : null,
    past: rows.filter((c) => c.status === 'CLOSED').sort((a, b) => new Date(b.startsOn).getTime() - new Date(a.startsOn).getTime()).map(shape),
    unallocated: Math.max(0, allowance - spent - sum(rows.filter((c) => c.status === 'ACTIVE').map((c) => ({ amount: Math.max(0, c.budget - spentIn(entries, c)) })))),
  };
}

programCohortsRouter.get('/:id/cohorts', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (got) res.json(await view(got.p, got.me, got.data));
});

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
programCohortsRouter.post('/:id/cohorts', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, data, p } = got;
  if (!canManagePlan(p as never, me, data)) return fail(res, 403, 'FORBIDDEN', 'You may not change this program');
  if (!LIVE.includes(p.status)) return fail(res, 409, 'WRONG_STATE', 'The program is not running');
  const b = z.object({ name: z.string().trim().min(1).max(TITLE_MAX), startsOn: dateStr, endsOn: dateStr, target: z.number().int().min(0).max(100000).nullish(), budget: z.number().int().min(0).max(2_000_000_000).default(0) }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Give a name and the dates');
  if (b.data.endsOn < b.data.startsOn) return fail(res, 400, 'BAD_DATES', 'The end must not be before the start');
  const rows = await cohortsOf(p.id);
  if (rows.some((c) => c.status === 'ACTIVE')) return fail(res, 409, 'COHORT_ACTIVE', 'Close the current cohort first');
  const before = await view(p, me, data);
  const budget = p.hasMoney === false ? 0 : b.data.budget;
  if (budget > before.unallocated) return fail(res, 409, 'OVER_ALLOCATION', 'That is more than the program has left this year', { unallocated: before.unallocated });
  await prisma.programCohort.create({ data: { planId: p.id, systemId: p.systemId, name: b.data.name, startsOn: new Date(`${b.data.startsOn}T00:00:00Z`), endsOn: new Date(`${b.data.endsOn}T00:00:00Z`), target: b.data.target || null, enrolled: 0, budget, status: 'ACTIVE', createdById: me } });
  await prisma.auditEvent.create({ data: { at: new Date(), actorId: me, systemId: p.systemId, action: 'COHORT_STARTED', resource: 'WORKPLAN', detail: `Started cohort “${b.data.name}” of “${p.title}”`, metaJson: JSON.stringify({ planId: p.id }) } });
  res.status(201).json(await view(p, me, data));
});

programCohortsRouter.patch('/:id/cohorts/:cid', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, data, p } = got;
  if (!canManagePlan(p as never, me, data)) return fail(res, 403, 'FORBIDDEN', 'You may not change this program');
  const c = (await cohortsOf(p.id)).find((x) => x.id === String(req.params.cid));
  if (!c || c.status !== 'ACTIVE') return fail(res, 404, 'NOT_FOUND', 'No such current cohort');
  const b = z.object({ enrolled: z.number().int().min(0).max(100000) }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Give the number enrolled');
  await prisma.programCohort.update({ where: { id: c.id }, data: { enrolled: b.data.enrolled } });
  res.json(await view(p, me, data));
});

programCohortsRouter.post('/:id/cohorts/:cid/close', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, data, p } = got;
  if (!canManagePlan(p as never, me, data)) return fail(res, 403, 'FORBIDDEN', 'You may not change this program');
  const c = (await cohortsOf(p.id)).find((x) => x.id === String(req.params.cid));
  if (!c || c.status !== 'ACTIVE') return fail(res, 404, 'NOT_FOUND', 'No such current cohort');
  const b = z.object({ graduated: z.number().int().min(0).max(100000), notes: z.string().trim().max(NOTE_MAX).nullish() }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Give how many graduated');
  if (b.data.graduated > c.enrolled) return fail(res, 400, 'MORE_THAN_ENROLLED', 'More graduated than were enrolled');
  const spent = spentIn(await entriesOf(p.id), c);
  await prisma.programCohort.update({ where: { id: c.id }, data: { status: 'CLOSED', graduated: b.data.graduated, notes: b.data.notes || null, spent, closedAt: new Date() } });
  await prisma.auditEvent.create({ data: { at: new Date(), actorId: me, systemId: p.systemId, action: 'COHORT_CLOSED', resource: 'WORKPLAN', detail: `Closed cohort “${c.name}” of “${p.title}”: ${b.data.graduated} graduated, ${Math.max(0, c.budget - spent)} RWF back to the program`, metaJson: JSON.stringify({ planId: p.id }) } });
  res.json(await view(p, me, data));
});
