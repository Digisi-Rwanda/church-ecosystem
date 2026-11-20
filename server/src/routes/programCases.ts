/**
 * Cases of a case-based program (Sick Care, Needy Support): a unit leader registers a person's need, the case manager (the owning unit's
 * leaders) decides church support for a unit's cases, per case or as a block the unit leader divides, the Treasurer logs the expense, and the
 * case is followed up until it is closed. Church support is a cost against the program's own budget: nothing past what is left can be approved.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { notifySafely } from '../lib/notify.js';
import { NOTE_MAX, TITLE_MAX, canSee } from '../work/rules.js';
import { asWorkRow, canDecideForChurch, canManagePlan, catechistIds, holdersWith, teamOf, unitApproverIds } from '../work/plan.js';
import { canRecord } from '../money/rules.js';
import { liveLines } from '../money/planMoney.js';
import { spentOf } from '../money/settlement.js';
import { CHURCH_SYSTEM } from '../work/plan.js';
import { liveHoldings } from '../capabilities/engine.js';

export const programCasesRouter = Router();

/** The marriage case type registers itself here (programMarriages.ts), so the two files never import each other while loading. */
interface MarriageHooks { block: (p: PlanRow, c: CaseRow, me: string, data: Data, units: Units) => Promise<unknown>; canClose: (p: PlanRow, c: CaseRow, me: string, data: Data) => boolean }
let marriage: MarriageHooks | null = null;
export const registerMarriage = (m: MarriageHooks) => { marriage = m; };
export type Res = import('express').Response;
export type Data = Awaited<ReturnType<typeof loadAccessData>>['data'];
export type Units = Awaited<ReturnType<typeof loadAccessData>>['units'];
export const fail = (res: Res, status: number, code: string, error: string, extra: object = {}) => res.status(status).json({ error, code, ...extra });

export interface PlanRow { id: string; systemId: string; title: string; status: string; planType?: string | null; programKind?: string | null; kindJson?: string | null; teamJson: string; deletedAt?: Date | string | null; [k: string]: unknown }
export interface CaseRow {
  id: string; planId: string; systemId: string; caseType: string; unitId: string; name: string; contact: string; issue: string; capacity: number; need: number; gap: number;
  approved: number; disbursed: number; status: string; condition: string | null; batchId: string | null; outcome: string | null; closeNote: string | null;
  registeredById: string; createdAt: Date | string; closedAt: Date | string | null; detailsJson?: string | null; verifiedById?: string | null; verifiedAt?: Date | string | null; changeJson?: string | null;
}
export interface BatchRow { id: string; planId: string; systemId: string; unitId: string; mode: string; amount: number; status: string; decidedById: string; decidedAt: Date | string; paidEntryId: string | null }
interface EventRow { id: string; caseId: string; planId: string; kind: string; text: string; byId: string; at: Date | string }
interface Line { planId: string | null; amount: number; status: string }
interface Ent { id: string; planId: string | null; kind: string; status: string; amount: number }

export const LIVE = ['SETUP', 'RUNNING', 'PAUSED'];
const OUTCOMES = ['RESOLVED', 'RECOVERED', 'PASSED', 'CANCELLED', 'MARRIED'] as const;
export const sum = (xs: number[]) => xs.reduce((n, x) => n + x, 0);
export const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);

export const casesOf = async (planId: string) => ((await prisma.programCase.findMany({ where: { planId } })) as CaseRow[]).filter((c) => c.planId === planId).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
export const batchesOf = async (planId: string) => ((await prisma.programCaseBatch.findMany({ where: { planId } })) as BatchRow[]).filter((b) => b.planId === planId);
const eventsOf = async (caseId: string) => ((await prisma.programCaseEvent.findMany({ where: { caseId } })) as EventRow[]).filter((e) => e.caseId === caseId).sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
export const event = (c: { id: string; planId: string }, kind: string, text: string, byId: string) => prisma.programCaseEvent.create({ data: { caseId: c.id, planId: c.planId, kind, text, byId } });

export const leadersOf = (unitId: string, units: Units, data: Data): string[] => {
  const u = (units as Array<{ id: string; systemId: string | null }>).find((x) => x.id === unitId);
  return u?.systemId ? unitApproverIds(u.systemId, data) : [];
};
export const unitName = (id: string, units: Units) => (units as Array<{ id: string; name: string }>).find((u) => u.id === id)?.name ?? '';
const roleOf = (p: PlanRow, me: string) => teamOf(p as never).find((m: { personId: string }) => m.personId === me)?.role ?? '';

/** The case manager: the people who run the program (its owning unit's leaders and the plan's own managers). */
export const isManager = (p: PlanRow, me: string, data: Data) => canManagePlan(p as never, me, data) || unitApproverIds(p.systemId, data).includes(me);
export const isSubmitter = (p: PlanRow, me: string) => /submitter/i.test(roleOf(p, me));
export const secretaryIds = (data: Data): string[] => {
  const ids = [...new Set((data.positions as Array<{ personId: string }>).map((x) => x.personId))];
  return ids.filter((id) => liveHoldings(id, data, new Date()).some((h) => h.via === 'OFFICE' && h.office === 'CHURCH_SECRETARY'));
};
export const sawAll = (p: PlanRow, me: string, data: Data) => secretaryIds(data).includes(me) || isManager(p, me, data) || canDecideForChurch(me, data) || catechistIds(data).includes(me) || canRecord(me, p.systemId, data);
export const watchers = (p: PlanRow, data: Data) => [...new Set([...catechistIds(data), ...holdersWith(CHURCH_SYSTEM, 'MISSION', 'A', data).filter((id) => canDecideForChurch(id, data))])];

export async function tell(ids: Iterable<string>, p: PlanRow, me: string, title: string, body: string | null, key: string, important = false) {
  for (const id of new Set(ids)) if (id !== me) await notifySafely(prisma as never, { kind: important ? 'WAITING_FOR_ME' : 'FOR_INFORMATION', toPersonId: id, systemId: p.systemId, title, body, href: `/s/${p.systemId}/work/plans/${p.id}`, important, sourceKey: `${key}:${id}` });
}
export async function audit(actorId: string, systemId: string, action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({ data: { at: new Date(), actorId, systemId, action, resource: 'WORKPLAN', detail, metaJson: JSON.stringify(meta) } });
}

/** What the program has left: its budget, less what was spent, less what is approved and not yet paid. */
export async function budgetOf(p: PlanRow) {
  const cap = sum(liveLines(((await prisma.moneyPlanItem.findMany({ where: { planId: p.id } })) as Line[]).filter((l) => l.planId === p.id)).map((l) => l.amount));
  const spent = await spentOf(p.id);
  const cases = await casesOf(p.id);
  const batches = await batchesOf(p.id);
  const committed = sum(batches.filter((b) => b.status === 'READY' || b.status === 'AWAITING_ALLOCATION').map((b) => b.amount));
  void cases;
  return { cap, spent, committed, remaining: cap - spent - committed };
}

export async function load(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const { data, units } = await loadAccessData(me);
  const p = (await prisma.workPlan.findUnique({ where: { id: String(req.params.id) } })) as PlanRow | null;
  if (!p || p.deletedAt || !canSee(asWorkRow(p as never), me, data)) return fail(res, 404, 'NOT_FOUND', 'Plan not found'), null;
  if (p.planType !== 'PROGRAM' || p.programKind !== 'CASE') return fail(res, 409, 'NOT_A_CASE_PROGRAM', 'Only a case-based program has cases'), null;
  return { me, data, units, p };
}
export const caseTypeOf = (p: PlanRow): string => { try { return (JSON.parse(p.kindJson ?? '{}') as { caseType?: string }).caseType ?? 'NEEDY'; } catch { return 'NEEDY'; } };

export async function listView(p: PlanRow, me: string, data: Data, units: Units) {
  const all = await casesOf(p.id);
  const batches = await batchesOf(p.id);
  const manager = isManager(p, me, data);
  const seeAll = sawAll(p, me, data);
  const myUnits = (units as Array<{ id: string; name: string; systemId: string | null }>).filter((u) => u.systemId && (isManager(p, me, data) || isSubmitter(p, me) ? true : unitApproverIds(u.systemId, data).includes(me)));
  const led = new Set((units as Array<{ id: string; systemId: string | null }>).filter((u) => u.systemId && unitApproverIds(u.systemId, data).includes(me)).map((u) => u.id));
  const mine = seeAll ? all : all.filter((c) => led.has(c.unitId) || c.registeredById === me);
  const live = LIVE.includes(p.status);
  const pending = all.filter((c) => c.status === 'PENDING' && c.caseType !== 'MARRIAGE');
  const group = (cs: CaseRow[]) => [...new Set(cs.map((c) => c.unitId))].map((unitId) => ({ unitId, unitName: unitName(unitId, units), cases: cs.filter((c) => c.unitId === unitId).map((c) => ({ id: c.id, name: c.name, gap: c.gap })) }));
  const batchCases = (b: BatchRow) => all.filter((c) => c.batchId === b.id).map((c) => ({ id: c.id, name: c.name, gap: c.gap, approved: c.approved }));
  return {
    caseType: caseTypeOf(p), live, manager, budget: await budgetOf(p),
    counts: { total: all.length, active: all.filter((c) => c.status === 'APPROVED' || c.status === 'FOLLOW_UP').length, pending: caseTypeOf(p) === 'MARRIAGE' ? all.filter((c) => c.status === 'PENDING' || c.status === 'VERIFIED').length : pending.length, closed: all.filter((c) => c.status === 'CLOSED').length },
    canRegister: live && myUnits.length > 0, myUnits: myUnits.map((u) => ({ id: u.id, name: u.name })),
    canReview: live && manager && pending.length > 0, pendingByUnit: manager ? group(pending) : [],
    toAllocate: batches.filter((b) => b.status === 'AWAITING_ALLOCATION' && (manager || leadersOf(b.unitId, units, data).includes(me))).filter((b) => leadersOf(b.unitId, units, data).includes(me)).map((b) => ({ batchId: b.id, unitName: unitName(b.unitId, units), amount: b.amount, cases: batchCases(b) })),
    toPay: live && canRecord(me, p.systemId, data) ? batches.filter((b) => b.status === 'READY').map((b) => ({ batchId: b.id, unitName: unitName(b.unitId, units), mode: b.mode, amount: b.amount, cases: batchCases(b).filter((c) => c.approved > 0) })) : [],
    rows: mine.map((c) => ({ id: c.id, name: c.name, unitId: c.unitId, unitName: unitName(c.unitId, units), issue: c.caseType === 'MARRIAGE' ? (JSON.parse(c.detailsJson ?? '{}') as { date?: string }).date ?? '' : c.issue, gap: c.gap, approved: c.approved, disbursed: c.disbursed, status: c.status, condition: c.condition, outcome: c.outcome, at: iso(c.createdAt), awaiting: c.caseType === 'MARRIAGE' ? (c.status === 'PENDING' ? 'CATECHIST' : c.status === 'VERIFIED' ? 'CHURCH_LEADER' : null) : null })),
  };
}

programCasesRouter.get('/:id/cases', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (got) res.json(await listView(got.p, got.me, got.data, got.units));
});

programCasesRouter.post('/:id/cases', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, data, units, p } = got;
  if (!LIVE.includes(p.status)) return fail(res, 409, 'WRONG_STATE', 'The program is not running');
  if (caseTypeOf(p) === 'MARRIAGE') return fail(res, 409, 'USE_MARRIAGE_FORM', 'Register a marriage with the marriage form');
  const b = z.object({ unitId: z.string().min(1), name: z.string().trim().min(1).max(TITLE_MAX), contact: z.string().trim().max(120).default(''), issue: z.string().trim().max(2000).default(''), capacity: z.number().int().min(0).max(2_000_000_000).default(0), need: z.number().int().min(0).max(2_000_000_000).default(0) }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Give the name, the unit and the amounts');
  const allowed = isManager(p, me, data) || isSubmitter(p, me) || leadersOf(b.data.unitId, units, data).includes(me);
  if (!(units as Array<{ id: string }>).some((u) => u.id === b.data.unitId)) return fail(res, 404, 'NOT_FOUND', 'Unit not found');
  if (!allowed) return fail(res, 403, 'FORBIDDEN', 'Only the unit’s leader registers a case for it');
  const gap = Math.max(0, b.data.need - b.data.capacity);
  const row = (await prisma.programCase.create({ data: { planId: p.id, systemId: p.systemId, caseType: caseTypeOf(p), unitId: b.data.unitId, name: b.data.name, contact: b.data.contact, issue: b.data.issue, capacity: b.data.capacity, need: b.data.need, gap, approved: 0, disbursed: 0, status: 'PENDING', registeredById: me } })) as CaseRow;
  await event(row, 'REGISTERED', `Registered by the unit leader. Need ${b.data.need}, unit can raise ${b.data.capacity}, gap ${gap}`, me);
  await tell([...unitApproverIds(p.systemId, data), p.leaderPersonId as string], p, me, `New case: ${row.name}`, `${unitName(row.unitId, units)} · gap ${gap} RWF`, `case-new:${row.id}`, true);
  await audit(me, p.systemId, 'CASE_REGISTERED', `Registered a case in “${p.title}”`, { planId: p.id, caseId: row.id });
  res.status(201).json(await listView(p, me, data, units));
});

/** The manager decides church support for the pending cases of a unit: amounts per case, or one block for the unit leader to divide. */
programCasesRouter.post('/:id/cases/review', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, data, units, p } = got;
  if (!isManager(p, me, data)) return fail(res, 403, 'FORBIDDEN', 'Only the case managers review cases');
  if (!LIVE.includes(p.status)) return fail(res, 409, 'WRONG_STATE', 'The program is not running');
  const b = z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('PER_CASE'), items: z.array(z.object({ caseId: z.string().min(1), amount: z.number().int().min(0).max(2_000_000_000) })).min(1).max(200) }),
    z.object({ mode: z.literal('BLOCK'), unitId: z.string().min(1), caseIds: z.array(z.string().min(1)).min(1).max(200), amount: z.number().int().min(0).max(2_000_000_000) }),
  ]).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Check the decision');
  const all = await casesOf(p.id);
  const ids = b.data.mode === 'PER_CASE' ? b.data.items.map((i) => i.caseId) : b.data.caseIds;
  const chosen = ids.map((id) => all.find((c) => c.id === id));
  if (chosen.some((c) => !c || c.status !== 'PENDING')) return fail(res, 409, 'NOT_PENDING', 'Only pending cases are reviewed');
  const cases = chosen as CaseRow[];
  if (cases.some((c) => c.caseType === 'MARRIAGE')) return fail(res, 409, 'USE_MARRIAGE_STEPS', 'A marriage is verified by the Catechist and approved by the Church Leader');
  const budget = await budgetOf(p);
  const wanted = b.data.mode === 'PER_CASE' ? sum(b.data.items.map((i) => i.amount)) : b.data.amount;
  if (b.data.mode === 'PER_CASE') {
    for (const i of b.data.items) if (i.amount > (all.find((c) => c.id === i.caseId) as CaseRow).gap) return fail(res, 400, 'MORE_THAN_GAP', 'Support cannot be more than the gap');
  } else {
    if (cases.some((c) => c.unitId !== (b.data as { unitId: string }).unitId)) return fail(res, 400, 'MIXED_UNITS', 'A block is for one unit');
    if (wanted > sum(cases.map((c) => c.gap))) return fail(res, 400, 'MORE_THAN_GAP', 'The block cannot be more than the total gap');
  }
  if (wanted > budget.remaining) return fail(res, 409, 'INSUFFICIENT_PROGRAM_BUDGET', 'The program does not have that much left this year', { remaining: budget.remaining, wanted });

  const decline = async (c: CaseRow) => {
    await prisma.programCase.update({ where: { id: c.id }, data: { status: 'FOLLOW_UP', approved: 0 } });
    await event(c, 'REVIEWED', 'Church support declined; the case stays open for follow-up', me);
    await tell(leadersOf(c.unitId, units, data), p, me, `Support declined: ${c.name}`, null, `case-declined:${c.id}`);
  };
  if (b.data.mode === 'PER_CASE') {
    const paid = b.data.items.filter((i) => i.amount > 0);
    for (const i of b.data.items.filter((x) => x.amount === 0)) await decline(all.find((c) => c.id === i.caseId) as CaseRow);
    for (const unitId of new Set(paid.map((i) => (all.find((c) => c.id === i.caseId) as CaseRow).unitId))) {
      const mine = paid.filter((i) => (all.find((c) => c.id === i.caseId) as CaseRow).unitId === unitId);
      const batch = (await prisma.programCaseBatch.create({ data: { planId: p.id, systemId: p.systemId, unitId, mode: 'PER_CASE', amount: sum(mine.map((i) => i.amount)), status: 'READY', decidedById: me } })) as BatchRow;
      for (const i of mine) {
        const c = all.find((x) => x.id === i.caseId) as CaseRow;
        await prisma.programCase.update({ where: { id: c.id }, data: { status: 'APPROVED', approved: i.amount, batchId: batch.id } });
        await event(c, 'REVIEWED', `Church support approved: ${i.amount} RWF`, me);
      }
      await tell([...leadersOf(unitId, units, data), ...holdersWith(p.systemId, 'MONEY', 'W', data)], p, me, `Support approved: ${p.title}`, `${batch.amount} RWF for ${mine.length} case(s)`, `case-approved:${batch.id}`, true);
    }
  } else if (b.data.amount === 0) {
    for (const c of cases) await decline(c);
  } else {
    const batch = (await prisma.programCaseBatch.create({ data: { planId: p.id, systemId: p.systemId, unitId: b.data.unitId, mode: 'BLOCK', amount: b.data.amount, status: 'AWAITING_ALLOCATION', decidedById: me } })) as BatchRow;
    for (const c of cases) {
      await prisma.programCase.update({ where: { id: c.id }, data: { status: 'APPROVED', approved: 0, batchId: batch.id } });
      await event(c, 'REVIEWED', `Block support approved for the unit: ${b.data.amount} RWF, to be divided by the unit leader`, me);
    }
    await tell(leadersOf(b.data.unitId, units, data), p, me, `Allocate church support: ${p.title}`, `${b.data.amount} RWF to divide among ${cases.length} case(s)`, `case-block:${batch.id}`, true);
  }
  await audit(me, p.systemId, 'CASES_REVIEWED', `Reviewed ${cases.length} case(s) in “${p.title}”`, { planId: p.id, mode: b.data.mode, wanted });
  res.json(await listView(p, me, data, units));
});

/** The unit leader divides an approved block among the unit's cases; the total must be exactly the block. */
programCasesRouter.post('/:id/cases/batches/:bid/allocate', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, data, units, p } = got;
  const batch = (await batchesOf(p.id)).find((x) => x.id === String(req.params.bid));
  if (!batch || batch.mode !== 'BLOCK' || batch.status !== 'AWAITING_ALLOCATION') return fail(res, 404, 'NOT_FOUND', 'No block waiting to be divided');
  if (!leadersOf(batch.unitId, units, data).includes(me)) return fail(res, 403, 'FORBIDDEN', 'Only the unit’s leader divides the block');
  const b = z.object({ allocations: z.array(z.object({ caseId: z.string().min(1), amount: z.number().int().min(0).max(2_000_000_000) })).min(1).max(200) }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Check the amounts');
  const all = (await casesOf(p.id)).filter((c) => c.batchId === batch.id);
  if (b.data.allocations.length !== all.length || b.data.allocations.some((a) => !all.some((c) => c.id === a.caseId))) return fail(res, 400, 'BAD_CASES', 'Give an amount for each case in the block');
  const total = sum(b.data.allocations.map((a) => a.amount));
  if (total !== batch.amount) return fail(res, 409, 'ALLOCATION_TOTAL', 'The amounts must add up to exactly the approved block', { block: batch.amount, total });
  for (const a of b.data.allocations) if (a.amount > (all.find((c) => c.id === a.caseId) as CaseRow).gap) return fail(res, 400, 'MORE_THAN_GAP', 'Support cannot be more than the gap');
  for (const a of b.data.allocations) {
    const c = all.find((x) => x.id === a.caseId) as CaseRow;
    await prisma.programCase.update({ where: { id: c.id }, data: { approved: a.amount } });
    await event(c, 'ALLOCATED', `The unit leader allocated ${a.amount} RWF from the block`, me);
  }
  await prisma.programCaseBatch.update({ where: { id: batch.id }, data: { status: 'READY' } });
  await tell([...holdersWith(p.systemId, 'MONEY', 'W', data), ...unitApproverIds(p.systemId, data)], p, me, `Support ready to pay: ${p.title}`, `${batch.amount} RWF for ${unitName(batch.unitId, units)}`, `case-allocated:${batch.id}`, true);
  await audit(me, p.systemId, 'CASES_ALLOCATED', `Divided a block in “${p.title}”`, { planId: p.id, batchId: batch.id });
  res.json(await listView(p, me, data, units));
});

/** The Treasurer links the expense they logged (Money → Log Expense) to the approved batch. */
programCasesRouter.post('/:id/cases/batches/:bid/disbursed', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, data, units, p } = got;
  if (!canRecord(me, p.systemId, data)) return fail(res, 403, 'FORBIDDEN', 'Only the Treasurer logs the support paid');
  const batch = (await batchesOf(p.id)).find((x) => x.id === String(req.params.bid));
  if (!batch || batch.status !== 'READY') return fail(res, 404, 'NOT_FOUND', 'No approved support waiting to be paid');
  const b = z.object({ entryId: z.string().min(1) }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Say which expense paid it');
  const entry = (await prisma.moneyEntry.findUnique({ where: { id: b.data.entryId } })) as Ent | null;
  if (!entry || entry.planId !== p.id || entry.kind !== 'SPENDING' || entry.status === 'REJECTED' || entry.status === 'VOIDED') return fail(res, 400, 'BAD_ENTRY', 'That expense is not a payment for this program');
  if (entry.amount !== batch.amount) return fail(res, 409, 'ENTRY_AMOUNT', 'The expense must equal the approved support exactly', { approved: batch.amount, entry: entry.amount });
  if ((await batchesOf(p.id)).some((x) => x.paidEntryId === entry.id)) return fail(res, 409, 'ENTRY_USED', 'That expense already paid another batch');
  for (const c of (await casesOf(p.id)).filter((x) => x.batchId === batch.id)) {
    await prisma.programCase.update({ where: { id: c.id }, data: { status: c.caseType === 'MARRIAGE' ? 'APPROVED' : 'FOLLOW_UP', disbursed: c.approved } });
    if (c.approved > 0) await event(c, 'PAID', `Church support of ${c.approved} RWF paid out`, me);
  }
  await prisma.programCaseBatch.update({ where: { id: batch.id }, data: { status: 'PAID', paidEntryId: entry.id, paidById: me, paidAt: new Date() } });
  await tell(leadersOf(batch.unitId, units, data), p, me, `Church support disbursed: ${p.title}`, `${batch.amount} RWF`, `case-paid:${batch.id}`);
  await audit(me, p.systemId, 'CASES_PAID', `Logged support paid in “${p.title}”`, { planId: p.id, batchId: batch.id, entryId: entry.id });
  res.json(await listView(p, me, data, units));
});

export async function detail(p: PlanRow, c: CaseRow, me: string, data: Data, units: Units) {
  const events = await eventsOf(c.id);
  const leader = leadersOf(c.unitId, units, data).includes(me) || c.registeredById === me;
  const open = c.status !== 'CLOSED' && LIVE.includes(p.status);
  return {
    id: c.id, name: c.name, contact: c.contact, issue: c.issue, unitId: c.unitId, unitName: unitName(c.unitId, units), caseType: c.caseType,
    capacity: c.capacity, need: c.need, gap: c.gap, approved: c.approved, disbursed: c.disbursed, status: c.status, condition: c.condition, outcome: c.outcome, closeNote: c.closeNote,
    canProgress: open && c.caseType !== 'MARRIAGE' && (leader || isManager(p, me, data)),
    canClose: open && (c.caseType === 'MARRIAGE' ? (marriage?.canClose(p, c, me, data) ?? false) : (leader || isManager(p, me, data)) && c.status !== 'APPROVED'),
    marriage: c.caseType === 'MARRIAGE' ? await marriage?.block(p, c, me, data, units) : null,
    events: events.map((e) => ({ id: e.id, kind: e.kind, text: e.text, at: iso(e.at), byId: e.byId })),
  };
}
async function loadCase(req: AuthedRequest, res: Res) {
  const got = await load(req, res);
  if (!got) return null;
  const all = await casesOf(got.p.id);
  const c = all.find((x) => x.id === String(req.params.cid));
  const led = leadersOf(c?.unitId ?? '', got.units, got.data).includes(got.me) || c?.registeredById === got.me;
  if (!c || !(sawAll(got.p, got.me, got.data) || led)) return fail(res, 404, 'NOT_FOUND', 'Case not found'), null;
  return { ...got, c };
}

programCasesRouter.get('/:id/cases/:cid', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadCase(req, res);
  if (got) res.json(await detail(got.p, got.c, got.me, got.data, got.units));
});

programCasesRouter.post('/:id/cases/:cid/progress', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadCase(req, res);
  if (!got) return;
  const { me, data, units, p, c } = got;
  const d = await detail(p, c, me, data, units);
  if (!d.canProgress) return fail(res, 403, 'FORBIDDEN', 'You may not report on this case');
  const b = z.object({ text: z.string().trim().min(1).max(NOTE_MAX), condition: z.string().trim().max(80).nullish() }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Write the progress');
  await prisma.programCase.update({ where: { id: c.id }, data: { ...(b.data.condition ? { condition: b.data.condition } : {}) } });
  await event(c, 'PROGRESS', b.data.condition ? `${b.data.condition}: ${b.data.text}` : b.data.text, me);
  await tell([...unitApproverIds(p.systemId, data), ...watchers(p, data)], p, me, `Progress: ${c.name}`, b.data.text, `case-progress:${c.id}:${Date.now()}`);
  const fresh = (await casesOf(p.id)).find((x) => x.id === c.id) as CaseRow;
  res.json(await detail(p, fresh, me, data, units));
});

programCasesRouter.post('/:id/cases/:cid/close', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadCase(req, res);
  if (!got) return;
  const { me, data, units, p, c } = got;
  const d = await detail(p, c, me, data, units);
  if (c.caseType === 'MARRIAGE') {
    const o = z.object({ outcome: z.enum(['MARRIED', 'CANCELLED']) }).safeParse(req.body);
    if (!o.success) return fail(res, 400, 'BAD_INPUT', 'A marriage ends as married or cancelled');
    if (o.data.outcome === 'CANCELLED' && c.status === 'APPROVED') return fail(res, 409, 'USE_CHANGE_REQUEST', 'An approved marriage is cancelled with a cancellation request');
    if (o.data.outcome === 'MARRIED' && c.status !== 'APPROVED') return fail(res, 409, 'NOT_APPROVED', 'The Church Leader approves the marriage first');
    if (o.data.outcome === 'MARRIED' && c.approved > c.disbursed) return fail(res, 409, 'SUPPORT_PENDING', 'Support is approved and not yet paid. Wait for the Treasurer, then close the case');
  } else if (c.status === 'APPROVED' || c.approved > c.disbursed) return fail(res, 409, 'SUPPORT_PENDING', 'Support is approved and not yet paid. Wait for the Treasurer, then close the case');
  if (!d.canClose) return fail(res, 403, 'FORBIDDEN', 'You may not close this case');
  if (c.status === 'PENDING') {
    // a case nobody has reviewed can only be withdrawn
    const only = z.object({ outcome: z.literal('CANCELLED') }).safeParse(req.body);
    if (!only.success) return fail(res, 409, 'NOT_REVIEWED', 'A case that was not reviewed can only be cancelled');
  }
  const b = z.object({ outcome: z.enum(OUTCOMES), note: z.string().trim().max(NOTE_MAX).nullish() }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Choose how the case ended');
  await prisma.programCase.update({ where: { id: c.id }, data: { status: 'CLOSED', outcome: b.data.outcome, closeNote: b.data.note || null, closedAt: new Date() } });
  await event(c, 'CLOSED', `Closed: ${b.data.outcome}${b.data.note ? ` — ${b.data.note}` : ''}`, me);
  await tell([...unitApproverIds(p.systemId, data), ...watchers(p, data)], p, me, `Case closed: ${c.name}`, b.data.outcome, `case-closed:${c.id}`);
  await audit(me, p.systemId, 'CASE_CLOSED', `Closed a case in “${p.title}”`, { planId: p.id, caseId: c.id, outcome: b.data.outcome });
  const fresh = (await casesOf(p.id)).find((x) => x.id === c.id) as CaseRow;
  res.json(await detail(p, fresh, me, data, units));
});
