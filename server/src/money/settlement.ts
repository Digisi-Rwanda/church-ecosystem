/**
 * Settlement and fundraising posting (slice 7). Database side of money/settle.ts.
 * One IncomeRecord (OTHER, POOL, SECURED, planId set) carries a fundraising event's net: a profit adds to the general pool,
 * a deficit is a negative amount that takes from it. A post-settlement invoice is its own negative record. Nothing here refuses.
 */
import { prisma } from '../lib/prisma.js';
import { notifySafely } from '../lib/notify.js';
import { loadAccessData } from '../notifications/feed.js';
import { holdersWith, canDecideForChurch, CHURCH_SYSTEM } from '../work/plan.js';
import { POOL_CODE } from './funds.js';
import { reduceProportional } from './cycles.js';
import { netOf, outcomeOf, settlementLapsed, underBudget } from './settle.js';

export interface SettlePlan {
  id: string; systemId: string; title: string; status: string; createdById: string; planType?: string | null;
  fundraising?: boolean | null; fundTarget?: number | null; doneAt?: Date | string | null; settledAt?: Date | string | null; settlementJson?: string | null; deletedAt?: Date | string | null;
}
interface Rec { id: string; planId: string | null; systemId: string; kind: string; code: string; label: string; amount: number; status: string; note: string | null }
interface Src { id: string; planId: string; kind: string; code: string; amount: number }
interface Ent { id: string; planId: string | null; kind: string; status: string; amount: number }

export const FUNDRAISING_TAG = 'fundraising-net';
const LATE_TAG = 'post-settlement:';

/** Every revenue line of an event, confirmed or not; only the confirmed ones count (see `confirmedRevenue`). */
export const revenueOf = async (planId: string) => ((await prisma.planRevenue.findMany({ where: { planId } })) as Array<{ id: string; planId: string; label: string; amount: number; receivedOn: Date | string; recordedById: string; status?: string | null }>).filter((r) => r.planId === planId);
export const confirmedRevenue = async (planId: string) => (await revenueOf(planId)).filter((r) => (r.status ?? 'CONFIRMED') === 'CONFIRMED');
export const spentOf = async (planId: string, exceptEntryId?: string): Promise<number> =>
  ((await prisma.moneyEntry.findMany({ where: { planId } })) as Ent[]).filter((e) => e.planId === planId && e.kind === 'SPENDING' && e.status !== 'REJECTED' && e.status !== 'VOIDED' && e.id !== exceptEntryId).reduce((n, e) => n + e.amount, 0);
const sourcesOf = async (planId: string) => ((await prisma.planSource.findMany({ where: { planId } })) as Src[]).filter((s) => s.planId === planId);

/** Church Leaders of the whole church: told of anything the pool has to carry. */
export async function churchLeaders(asPerson: string): Promise<string[]> {
  const { data } = await loadAccessData(asPerson);
  return holdersWith(CHURCH_SYSTEM, 'MISSION', 'A', data).filter((id) => canDecideForChurch(id, data));
}
export async function tell(ids: string[], p: SettlePlan, title: string, body: string | null, key: string, important = false): Promise<void> {
  for (const id of new Set(ids)) await notifySafely(prisma as never, { kind: important ? 'WAITING_FOR_ME' : 'FOR_INFORMATION', toPersonId: id, systemId: p.systemId, title, body, href: `/s/${p.systemId}/work/plans/${p.id}`, important, sourceKey: `${key}:${id}` });
}

/** Keep the fundraising event's single pool record equal to revenue minus spending. Only once the event is Done. */
export async function syncFundraising(p: SettlePlan, by: string): Promise<number | null> {
  if (!p.fundraising || !p.doneAt || p.deletedAt) return null;
  const net = netOf((await confirmedRevenue(p.id)).reduce((n, r) => n + r.amount, 0), await spentOf(p.id));
  const all = ((await prisma.incomeRecord.findMany({ where: { systemId: p.systemId } })) as Rec[]).filter((r) => r.planId === p.id && r.note === FUNDRAISING_TAG);
  const now = new Date();
  const label = `${net < 0 ? 'Fundraising deficit' : 'Fundraising profit'}: ${p.title}`;
  if (all[0]) await prisma.incomeRecord.update({ where: { id: all[0].id }, data: { amount: net, label, status: 'SECURED', receivedOn: now, updatedById: by, updatedAt: now } });
  else await prisma.incomeRecord.create({ data: { systemId: p.systemId, kind: 'OTHER', code: POOL_CODE, label, amount: net, status: 'SECURED', note: FUNDRAISING_TAG, planId: p.id, receivedOn: now, recordedById: by, recordedAt: now, updatedAt: now } });
  return net;
}

/** The general pool's secured amount, summed from its records and nothing else (used to say when it has gone negative). */
export async function poolNegative(systemId: string): Promise<number> {
  const secured = ((await prisma.incomeRecord.findMany({ where: { systemId } })) as Rec[]).filter((r) => r.systemId === systemId && r.kind === 'OTHER' && r.code === POOL_CODE && r.status === 'SECURED').reduce((n, r) => n + r.amount, 0);
  return secured < 0 ? secured : 0;
}

/** Tell the Church Leaders when a pool cannot cover what it carries. */
export async function warnPool(p: SettlePlan, by: string): Promise<void> {
  const short = await poolNegative(p.systemId);
  if (short < 0) await tell(await churchLeaders(by), p, `The general pool is negative (${short.toLocaleString('en')} RWF)`, p.title, `pool-negative:${p.systemId}:${short}`, true);
}

/** Settle an activity: unspent money goes back to its sources, and the result is kept for the Church Leader. */
export async function finalize(p: SettlePlan, by: string, why: 'TREASURER' | 'PERIOD', exceptEntryId?: string): Promise<{ released: number }> {
  const sources = await sourcesOf(p.id);
  const earmarked = sources.reduce((n, s) => n + s.amount, 0);
  const spent = await spentOf(p.id, exceptEntryId);
  const released = underBudget(earmarked, spent);
  if (released > 0) {
    const next = reduceProportional(sources, released);
    for (const s of sources) {
      const left = next.find((n) => n.id === s.id);
      if (!left) await prisma.planSource.delete({ where: { id: s.id } });
      else if (left.amount !== s.amount) await prisma.planSource.update({ where: { id: s.id }, data: { amount: left.amount } });
    }
  }
  const now = new Date();
  await prisma.workPlan.update({ where: { id: p.id }, data: { settledAt: now, settlementJson: JSON.stringify({ released, spent, earmarked, by, why, at: now.toISOString() }) } });
  if (p.fundraising) await syncFundraising({ ...p, doneAt: p.doneAt ?? now }, by);
  await tell(await churchLeaders(by), p, `Closed under budget: ${p.title}`, released > 0 ? `${released.toLocaleString('en')} RWF went back to its sources` : 'Nothing was left over', `settled:${p.id}`);
  return { released };
}

/** Settle whatever has run out of time. Called when a unit's pots are read, so no timer is needed. */
export async function sweepSettlements(systemId: string): Promise<void> {
  try {
    const rows = ((await prisma.workPlan.findMany({ where: { systemId, status: 'ENDED' } })) as SettlePlan[]).filter((p) => p.systemId === systemId && !p.deletedAt && settlementLapsed(p));
    for (const p of rows) await finalize(p, p.createdById, 'PERIOD');
  } catch {
    /* a failed sweep never blocks reading the pots */
  }
}

/** A spending entry on a settled activity: recorded, flagged, and charged to the general pool. */
export async function postSettlement(p: SettlePlan, entry: { id: string; amount: number }, by: string): Promise<void> {
  const now = new Date();
  await prisma.incomeRecord.create({ data: { systemId: p.systemId, kind: 'OTHER', code: POOL_CODE, label: `Post-settlement invoice: ${p.title}`, amount: -entry.amount, status: 'SECURED', note: `${LATE_TAG}${entry.id}`, planId: p.id, receivedOn: now, recordedById: by, recordedAt: now, updatedAt: now } });
  let result: Record<string, unknown> = {};
  try { result = p.settlementJson ? JSON.parse(p.settlementJson) : {}; } catch { result = {}; }
  const late = Array.isArray(result.late) ? (result.late as unknown[]) : [];
  late.push({ entryId: entry.id, amount: entry.amount, at: now.toISOString() });
  await prisma.workPlan.update({ where: { id: p.id }, data: { settlementJson: JSON.stringify({ ...result, late }) } });
  await tell(await churchLeaders(by), p, `Post-settlement invoice: ${p.title}`, `${entry.amount.toLocaleString('en')} RWF was charged to the general pool`, `late-invoice:${entry.id}`, true);
  await warnPool(p, by);
}

export { outcomeOf };
