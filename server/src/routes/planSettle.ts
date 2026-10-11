/**
 * Fundraising revenue and settlement on an activity's money page (slice 7). Mounted under /api/work-plans ahead of the plan routes.
 * The Treasurer logs the money a fundraising event receives and finalizes the settlement; nothing here refuses real spending.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { NOTE_MAX, TITLE_MAX, canSee } from '../work/rules.js';
import { asWorkRow, canApprove, canManagePlan, type PlanRow } from '../work/plan.js';
import { canReadMoney, canRecord, isDay } from '../money/rules.js';
import { SETTLE_DAYS, netOf, outcomeOf, projectedNet, revenueProblem, settleDue, settlementOpen, underBudget } from '../money/settle.js';
import { churchLeaders, finalize, revenueOf, spentOf, syncFundraising, tell, warnPool, type SettlePlan } from '../money/settlement.js';

export const planSettleRouter = Router();
type Res = import('express').Response;
type Data = Awaited<ReturnType<typeof loadAccessData>>['data'];
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });

interface Plan extends PlanRow, SettlePlan { title: string }
const LIVE = ['SETUP', 'RUNNING', 'PAUSED', 'CLOSING', 'ENDED'];

async function audit(actorId: string, systemId: string, action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({ data: { at: new Date(), actorId, systemId, action, resource: 'MONEY', detail, metaJson: JSON.stringify(meta) } });
}

/** Called when an activity is marked Done: the day is kept, a fundraising event posts its net, and a pool that cannot cover it is flagged. */
export async function onDone(planId: string, me: string): Promise<void> {
  try {
    const now = new Date();
    const row = (await prisma.workPlan.update({ where: { id: planId }, data: { doneAt: now } })) as Plan;
    if (!row.fundraising) return;
    const net = await syncFundraising(row, me);
    if (net !== null && net < 0) await tell(await churchLeaders(me), row, `Fundraising deficit: ${row.title}`, `${Math.abs(net).toLocaleString('en')} RWF was taken from the general pool`, `fund-deficit:${row.id}`, true);
    await warnPool(row, me);
  } catch {
    /* closing an activity never fails because of the money notice */
  }
}

/** What the money page shows about fundraising and settlement. */
export async function settleView(p: Plan, me: string, data: Data, planned: number, earmarked: number) {
  const settled = !!p.settledAt;
  const write = canRecord(me, p.systemId, data);
  let fundraising = null;
  if (p.fundraising) {
    const revenue = await revenueOf(p.id);
    const total = revenue.reduce((n, r) => n + r.amount, 0);
    const spent = await spentOf(p.id);
    const net = netOf(total, spent);
    fundraising = {
      target: p.fundTarget ?? 0, projectedNet: projectedNet(p.fundTarget ?? 0, planned), revenueTotal: total,
      revenue: revenue.sort((a, b) => new Date(a.receivedOn).getTime() - new Date(b.receivedOn).getTime()).map((r) => ({ id: r.id, label: r.label, amount: r.amount, receivedOn: new Date(r.receivedOn).toISOString().slice(0, 10) })),
      canLogRevenue: write && LIVE.includes(p.status) && !settled,
      net: p.doneAt ? net : null, outcome: p.doneAt ? outcomeOf(net) : null,
    };
  }
  let settlement = null;
  if (p.doneAt) {
    let result: unknown = null;
    try { result = p.settlementJson ? JSON.parse(p.settlementJson) : null; } catch { result = null; }
    settlement = {
      doneAt: new Date(p.doneAt).toISOString(), due: settleDue(p.doneAt).toISOString(), days: SETTLE_DAYS, settled, open: settlementOpen(p),
      canFinalize: write && p.status === 'ENDED' && !settled, toRelease: settled ? 0 : underBudget(earmarked, await spentOf(p.id)), result,
    };
  }
  return { fundraising, settlement };
}

async function load(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const { data } = await loadAccessData(me);
  const p = (await prisma.workPlan.findUnique({ where: { id: String(req.params.id) } })) as Plan | null;
  if (!p || p.deletedAt || !canSee(asWorkRow(p), me, data)) return fail(res, 404, 'NOT_FOUND', 'Plan not found'), null;
  if (!(canManagePlan(p, me, data) || canReadMoney(me, p.systemId, data) || canApprove(p, me, data))) return fail(res, 404, 'NOT_FOUND', 'Not found'), null;
  return { me, data, p };
}

const revenueSchema = z.object({ label: z.string().trim().min(1).max(TITLE_MAX), amount: z.number(), receivedOn: z.string().nullish(), note: z.string().trim().max(NOTE_MAX).nullish() });

async function logging(req: AuthedRequest, res: Res) {
  const got = await load(req, res);
  if (!got) return null;
  if (!canRecord(got.me, got.p.systemId, got.data)) return fail(res, 403, 'FORBIDDEN', 'Only the treasurer logs what the event receives'), null;
  if (!got.p.fundraising) return fail(res, 409, 'NOT_FUNDRAISING', 'This event is not a fundraiser'), null;
  if (!LIVE.includes(got.p.status)) return fail(res, 409, 'NOT_APPROVED', 'Revenue is logged once the plan is approved'), null;
  if (got.p.settledAt) return fail(res, 409, 'SETTLED', 'This activity is settled'), null;
  return got;
}

planSettleRouter.post('/:id/revenue', requireAuth, async (req: AuthedRequest, res) => {
  const got = await logging(req, res);
  if (!got) return;
  const b = revenueSchema.safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Say what it was and how much');
  if (revenueProblem(b.data.amount)) return fail(res, 400, 'AMOUNT', 'Enter a whole amount in francs, above zero');
  if (b.data.receivedOn && !isDay(b.data.receivedOn)) return fail(res, 400, 'BAD_DATE', 'Enter a real day');
  const now = new Date();
  const row = (await prisma.planRevenue.create({ data: { planId: got.p.id, systemId: got.p.systemId, label: b.data.label, amount: b.data.amount, receivedOn: b.data.receivedOn ? new Date(`${b.data.receivedOn}T00:00:00Z`) : now, recordedById: got.me, recordedAt: now } })) as { id: string };
  await audit(got.me, got.p.systemId, 'MONEY_REVENUE_LOGGED', `Revenue ${b.data.amount} RWF: ${b.data.label}`, { planId: got.p.id, id: row.id });
  if (got.p.doneAt) { await syncFundraising(got.p, got.me); await warnPool(got.p, got.me); }
  res.status(201).json({ id: row.id });
});

planSettleRouter.delete('/:id/revenue/:rid', requireAuth, async (req: AuthedRequest, res) => {
  const got = await logging(req, res);
  if (!got) return;
  const r = ((await prisma.planRevenue.findMany({ where: { planId: got.p.id } })) as Array<{ id: string; planId: string; label: string; amount: number }>).find((x) => x.id === String(req.params.rid) && x.planId === got.p.id);
  if (!r) return fail(res, 404, 'NOT_FOUND', 'Not found');
  await prisma.planRevenue.delete({ where: { id: r.id } });
  await audit(got.me, got.p.systemId, 'MONEY_REVENUE_REMOVED', `Removed revenue ${r.amount} RWF: ${r.label}`, { planId: got.p.id, id: r.id });
  if (got.p.doneAt) { await syncFundraising(got.p, got.me); await warnPool(got.p, got.me); }
  res.json({ ok: true });
});

planSettleRouter.post('/:id/finalize', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  if (!canRecord(got.me, got.p.systemId, got.data)) return fail(res, 403, 'FORBIDDEN', 'Only the treasurer finalizes a settlement');
  if (got.p.status !== 'ENDED') return fail(res, 409, 'NOT_DONE', 'Settle an activity once it is done');
  if (got.p.settledAt) return fail(res, 409, 'SETTLED', 'This activity is already settled');
  const out = await finalize(got.p, got.me, 'TREASURER');
  await audit(got.me, got.p.systemId, 'MONEY_SETTLED', `Settled ${got.p.title}: ${out.released} RWF went back to its sources`, { planId: got.p.id, released: out.released });
  res.json({ ok: true, released: out.released });
});
