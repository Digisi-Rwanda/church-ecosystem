/**
 * Settlement and fundraising posting (slice 7). Database side of money/settle.ts.
 * A fundraising event's profit is one income record in the Donation pot, Unrestricted. Money that has to be found (a fundraising deficit,
 * an overspend at settlement, a late invoice) is taken from Unrestricted money that is still available, the pot that owes it first and then the
 * other. No pot goes below zero: what nothing can cover is kept as Uncovered overspend and the Church Leaders are told. Nothing here refuses.
 */
import { prisma } from '../lib/prisma.js';
import { notifySafely } from '../lib/notify.js';
import { loadAccessData } from '../notifications/feed.js';
import { holdersWith, canDecideForChurch, CHURCH_SYSTEM } from '../work/plan.js';
import { coverShortfall, shareByPot, UNRESTRICTED, type PotKind } from './funds.js';
import { potsOf } from '../routes/incomeFunds.js';
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

/** Take what is needed from Unrestricted money still available, and keep what nothing could cover. Returns what was covered and what was not. */
export async function coverFromFunds(p: SettlePlan, need: Array<{ kind: PotKind; amount: number }>, reason: 'OVERSPEND' | 'LATE_INVOICE', by: string, note: string): Promise<{ covered: number; uncovered: number }> {
  const total = need.reduce((n, x) => n + x.amount, 0);
  if (total <= 0) return { covered: 0, uncovered: 0 };
  const { cover, uncovered } = coverShortfall(await potsOf(p.systemId, undefined, false), need);
  const now = new Date();
  for (const c of cover) await prisma.fundAdjustment.create({ data: { systemId: p.systemId, planId: p.id, kind: c.kind, code: UNRESTRICTED, amount: -c.amount, reason, note, createdById: by, createdAt: now } });
  if (uncovered > 0) await prisma.fundAdjustment.create({ data: { systemId: p.systemId, planId: p.id, kind: 'DONATION', code: UNRESTRICTED, amount: uncovered, reason: 'UNCOVERED', note, createdById: by, createdAt: now } });
  return { covered: total - uncovered, uncovered };
}

async function tellUncovered(p: SettlePlan, by: string, uncovered: number, key: string): Promise<void> {
  if (uncovered > 0) await tell(await churchLeaders(by), p, `Uncovered overspend: ${p.title}`, `${uncovered.toLocaleString('en')} RWF could not be covered from unrestricted funds`, key, true);
}

/** Keep the fundraising event's result equal to revenue minus spending, once the event is Done. A profit is Unrestricted Donation money; a deficit is found from unrestricted funds. */
export async function syncFundraising(p: SettlePlan, by: string): Promise<number | null> {
  if (!p.fundraising || !p.doneAt || p.deletedAt) return null;
  const net = netOf((await confirmedRevenue(p.id)).reduce((n, r) => n + r.amount, 0), await spentOf(p.id));
  const now = new Date();
  // Start from a clean slate: the earlier result of this event is taken back before it is posted again.
  for (const r of ((await prisma.incomeRecord.findMany({ where: { systemId: p.systemId } })) as Rec[]).filter((r) => r.planId === p.id && r.note === FUNDRAISING_TAG)) await prisma.incomeRecord.delete({ where: { id: r.id } });
  for (const a of ((await prisma.fundAdjustment.findMany({ where: { systemId: p.systemId } })) as Array<{ id: string; planId: string | null; note: string | null }>).filter((a) => a.planId === p.id && a.note === FUNDRAISING_TAG)) await prisma.fundAdjustment.delete({ where: { id: a.id } });
  if (net > 0) {
    await prisma.incomeRecord.create({ data: { systemId: p.systemId, kind: 'DONATION', code: UNRESTRICTED, sourceTag: 'OTHER', label: `Fundraising profit: ${p.title}`, amount: net, status: 'SECURED', note: FUNDRAISING_TAG, planId: p.id, receivedOn: now, recordedById: by, recordedAt: now, updatedAt: now } });
  } else if (net < 0) {
    const r = await coverFromFunds(p, [{ kind: 'DONATION', amount: -net }], 'OVERSPEND', by, FUNDRAISING_TAG);
    await tellUncovered(p, by, r.uncovered, `fund-uncovered:${p.id}:${r.uncovered}`);
  }
  return net;
}

/** Settle an activity: unspent money goes back to its sources in proportion, an overspend is found from unrestricted funds, and the result is kept for the Church Leader. */
export async function finalize(p: SettlePlan, by: string, why: 'TREASURER' | 'PERIOD', exceptEntryId?: string): Promise<{ released: number; overspend: number; uncovered: number }> {
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
  const overspend = Math.max(0, spent - earmarked);
  let covered = 0, uncovered = 0;
  if (overspend > 0) {
    const need = shareByPot(sources, overspend);
    ({ covered, uncovered } = await coverFromFunds(p, need.length > 0 ? need : [{ kind: 'DONATION', amount: overspend }], 'OVERSPEND', by, `Overspend: ${p.title}`));
  }
  const now = new Date();
  await prisma.workPlan.update({ where: { id: p.id }, data: { settledAt: now, settlementJson: JSON.stringify({ released, spent, earmarked, overspend, covered, uncovered, by, why, at: now.toISOString(), returned: sources.map((s) => ({ kind: s.kind, code: s.code, was: s.amount, now: reduceProportional(sources, released).find((n) => n.id === s.id)?.amount ?? 0 })) }) } });
  if (p.fundraising) await syncFundraising({ ...p, doneAt: p.doneAt ?? now }, by);
  const leaders = await churchLeaders(by);
  await tell(leaders, p, overspend > 0 ? `Closed over budget: ${p.title}` : `Closed under budget: ${p.title}`,
    overspend > 0 ? `${overspend.toLocaleString('en')} RWF over: ${covered.toLocaleString('en')} covered from unrestricted funds${uncovered > 0 ? `, ${uncovered.toLocaleString('en')} uncovered` : ''}` : released > 0 ? `${released.toLocaleString('en')} RWF went back to its sources` : 'Nothing was left over', `settled:${p.id}`);
  await tellUncovered(p, by, uncovered, `uncovered:${p.id}`);
  return { released, overspend, uncovered };
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

/** A spending entry on a settled activity: recorded, flagged, and taken from Unrestricted money (the Donation pot first). */
export async function postSettlement(p: SettlePlan, entry: { id: string; amount: number }, by: string): Promise<void> {
  const now = new Date();
  const r = await coverFromFunds(p, [{ kind: 'DONATION', amount: entry.amount }], 'LATE_INVOICE', by, `${LATE_TAG}${entry.id}`);
  let result: Record<string, unknown> = {};
  try { result = p.settlementJson ? JSON.parse(p.settlementJson) : {}; } catch { result = {}; }
  const late = Array.isArray(result.late) ? (result.late as unknown[]) : [];
  late.push({ entryId: entry.id, amount: entry.amount, covered: r.covered, uncovered: r.uncovered, at: now.toISOString() });
  await prisma.workPlan.update({ where: { id: p.id }, data: { settlementJson: JSON.stringify({ ...result, late }) } });
  await tell(await churchLeaders(by), p, `Post-settlement invoice: ${p.title}`, `${entry.amount.toLocaleString('en')} RWF was taken from unrestricted funds${r.uncovered > 0 ? `; ${r.uncovered.toLocaleString('en')} could not be covered` : ''}`, `late-invoice:${entry.id}`, true);
  await tellUncovered(p, by, r.uncovered, `late-uncovered:${entry.id}`);
}

export { outcomeOf };
