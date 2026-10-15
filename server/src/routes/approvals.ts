/**
 * One queue for everything that waits for a decision: activities, amendments, contribution lists, donations and spending.
 * Each row says whether it waits for the person asking ("mine"), who it waits for, and where to go. Read-only: the decisions are
 * still taken where they always were, so no rule changes here.
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { canSee } from '../work/rules.js';
import { asWorkRow, canApprove, canDecideForChurch, currentLevel, levelsOf} from '../work/plan.js';
import { fileCounts } from './planFiles.js';
import { canApproveSpending, canReadMoney } from '../money/rules.js';
import { amendTitle, chainOf, mayDecide, moneyDeciders, type Amend, type Plan } from './planMoney.js';

export const approvalsRouter = Router();

export type ApprovalKind = 'ACTIVITY' | 'AMENDMENT' | 'CONTRIBUTION_LIST' | 'DONATION' | 'SPENDING' | 'INCOME';
interface Item { key: string; kind: ApprovalKind; id: string; systemId: string; title: string; amount: number | null; waitingFor: string; from: string; since: string; href: string; mine: boolean; planType?: string; date?: string | null }

const at = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : new Date(0).toISOString());

approvalsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const { data } = await loadAccessData(me);
  const only = req.query.systemId ? String(req.query.systemId) : '';
  const inScope = (systemId: string) => !only || systemId === only;
  const people = new Map(((await prisma.person.findMany()) as Array<{ id: string; fullName: string }>).map((p) => [p.id, p.fullName]));
  const nameOf = (id: string | null | undefined) => (id ? people.get(id) ?? '' : '');
  const items: Item[] = [];

  const plans = ((await prisma.workPlan.findMany()) as Plan[]).filter((p) => !p.deletedAt);
  const seen = new Map(plans.filter((p) => canSee(asWorkRow(p), me, data)).map((p) => [p.id, p]));
  const lineSum = new Map<string, number>();
  for (const l of (await prisma.moneyPlanItem.findMany()) as Array<{ planId: string | null; amount: number; status: string }>)
    if (l.planId && l.status !== 'DROPPED') lineSum.set(l.planId, (lineSum.get(l.planId) ?? 0) + l.amount);

  for (const p of seen.values()) {
    if (p.status !== 'PENDING_APPROVAL' || !inScope(p.systemId)) continue;
    const level = currentLevel(p);
    items.push({
      key: `plan:${p.id}`, kind: 'ACTIVITY', id: p.id, systemId: p.systemId, title: p.title, amount: lineSum.get(p.id) ?? 0, waitingFor: level?.label ?? '',
      from: nameOf(p.createdById), since: at((p as { updatedAt?: Date | string }).updatedAt), href: `/s/${p.systemId}/work/plans/${p.id}`, mine: canApprove(p, me, data),
    });
  }

  for (const a of (await prisma.budgetAmendment.findMany()) as Amend[]) {
    const p = seen.get(a.planId);
    if (a.status !== 'PENDING' || !p || !inScope(p.systemId)) continue;
    const chain = chainOf(a);
    const step = chain.find((l) => l.status === 'PENDING');
    items.push({
      key: `amend:${a.id}`, kind: 'AMENDMENT', id: a.id, systemId: p.systemId, title: `${amendTitle(a)}: ${p.title}`, amount: a.kind === 'CHANGE' ? null : a.newTotal - a.oldTotal,
      waitingFor: step?.label ?? moneyDeciders(p, a.requestedById, data).label, from: nameOf(a.requestedById), since: at(a.requestedAt), href: `/s/${p.systemId}/work/plans/${p.id}`, mine: mayDecide(a, p, me, data),
    });
  }

  const sums = new Map<string, number>();
  for (const l of (await prisma.contributionLine.findMany()) as Array<{ listId: string; amount: number }>) sums.set(l.listId, (sums.get(l.listId) ?? 0) + l.amount);
  for (const l of (await prisma.contributionList.findMany()) as Array<{ id: string; systemId: string; level: string; status: string; typeName: string; month: string; createdById: string; submittedAt?: Date | string | null }>) {
    if (l.level !== 'UNIT' || l.status !== 'SUBMITTED' || !inScope(l.systemId) || !canReadMoney(me, l.systemId, data)) continue;
    items.push({
      key: `list:${l.id}`, kind: 'CONTRIBUTION_LIST', id: l.id, systemId: l.systemId, title: `${l.typeName} ${l.month}`, amount: sums.get(l.id) ?? 0, waitingFor: 'President', from: nameOf(l.createdById),
      since: at(l.submittedAt), href: `/s/${l.systemId}/money/contributions`, mine: canApproveSpending(me, l.systemId, data) && l.createdById !== me,
    });
  }

  for (const d of (await prisma.donation.findMany()) as Array<{ id: string; systemId: string; status: string; donorName: string; amount: number; recordedById: string; recordedAt?: Date | string | null }>) {
    if (d.status !== 'PENDING' || !inScope(d.systemId) || !canReadMoney(me, d.systemId, data)) continue;
    items.push({
      key: `don:${d.id}`, kind: 'DONATION', id: d.id, systemId: d.systemId, title: d.donorName, amount: d.amount, waitingFor: 'President', from: nameOf(d.recordedById),
      since: at(d.recordedAt), href: `/s/${d.systemId}/money/donations`, mine: canApproveSpending(me, d.systemId, data) && d.recordedById !== me,
    });
  }

  for (const e of (await prisma.moneyEntry.findMany()) as Array<{ id: string; systemId: string; kind: string; status: string; amount: number; note?: string | null; category: string; recordedById: string; recordedAt?: Date | string | null }>) {
    if (e.kind !== 'SPENDING' || e.status !== 'PENDING_APPROVAL' || !inScope(e.systemId) || !canReadMoney(me, e.systemId, data)) continue;
    items.push({
      key: `spend:${e.id}`, kind: 'SPENDING', id: e.id, systemId: e.systemId, title: e.note || e.category, amount: e.amount, waitingFor: 'President', from: nameOf(e.recordedById),
      since: at(e.recordedAt), href: `/s/${e.systemId}/money/spending`, mine: canApproveSpending(me, e.systemId, data) && e.recordedById !== me,
    });
  }

  for (const r of (await prisma.incomeRecord.findMany()) as Array<{ id: string; systemId: string; status: string; label: string; amount: number; recordedById: string; recordedAt?: Date | string | null }>) {
    if (r.status !== 'AWAITING' || !inScope(r.systemId) || !canReadMoney(me, r.systemId, data)) continue;
    items.push({
      key: `income:${r.id}`, kind: 'INCOME', id: r.id, systemId: r.systemId, title: r.label, amount: r.amount, waitingFor: 'President', from: nameOf(r.recordedById),
      since: at(r.recordedAt), href: `/s/${r.systemId}/money/funds?tab=income`, mine: canApproveSpending(me, r.systemId, data) && r.recordedById !== me,
    });
  }

  items.sort((a, b) => a.since.localeCompare(b.since));
  res.json({ items, counts: { all: items.length, mine: items.filter((i) => i.mine).length } });
});

/** What the Church Leader sees across every live activity: date, activity, description, amount, category, attachments, Catechist status and status. */
approvalsRouter.get('/oversight', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const { data } = await loadAccessData(me);
  if (!canDecideForChurch(me, data)) return res.json({ enabled: false, items: [] });
  const files = await fileCounts();
  const lines = new Map<string, { sum: number; cats: Set<string> }>();
  for (const l of (await prisma.moneyPlanItem.findMany()) as Array<{ planId: string | null; amount: number; status: string; category?: string | null }>) {
    if (!l.planId || l.status === 'DROPPED') continue;
    const x = lines.get(l.planId) ?? { sum: 0, cats: new Set<string>() };
    x.sum += l.amount;
    if (l.category) x.cats.add(l.category);
    lines.set(l.planId, x);
  }
  const only = req.query.systemId ? String(req.query.systemId) : '';
  const plans = ((await prisma.workPlan.findMany()) as Array<Plan & { suspendedAt?: Date | string | null; aim?: string; startsOn?: Date | string | null }>)
    .filter((p) => !p.deletedAt && ['PENDING_APPROVAL', 'SETUP', 'RUNNING', 'PAUSED', 'CLOSING'].includes(p.status) && (!only || p.systemId === only) && canSee(asWorkRow(p), me, data));
  const order: Record<string, number> = { PENDING_APPROVAL: 0, SETUP: 1, RUNNING: 2, PAUSED: 3, CLOSING: 4 };
  plans.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  res.json({
    enabled: true,
    items: plans.map((p) => {
      const cat = levelsOf(p).find((l) => l.levelKey === 'CATECHIST');
      const info = lines.get(p.id);
      const level = p.status === 'PENDING_APPROVAL' ? currentLevel(p) : null;
      return {
        id: p.id, systemId: p.systemId, title: p.title, description: p.aim ?? '', planType: p.planType ?? 'PROJECT', date: p.startsOn ? new Date(p.startsOn).toISOString() : null,
        amount: info?.sum ?? 0, categories: [...(info?.cats ?? [])], attachments: files.get(p.id) ?? 0,
        catechist: cat ? (cat.status === 'APPROVED' ? 'APPROVED' : 'PENDING') : 'SKIPPED', status: p.suspendedAt ? 'SUSPENDED' : p.status, waitingFor: level?.label ?? null,
        href: `/s/${p.systemId}/work/plans/${p.id}`, canDecide: p.status === 'PENDING_APPROVAL' && canApprove(p, me, data), canSuspend: !p.suspendedAt && ['SETUP', 'RUNNING', 'PAUSED', 'CLOSING'].includes(p.status),
      };
    }),
  });
});
