/**
 * Money (slice 3.4): accounts per unit, income recorded by the treasurer, spending that waits for
 * the president's approval, and a read-only oversight view. Nothing is ever deleted; no limits.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { notifySafely } from '../lib/notify.js';
import {
  CATEGORIES, KINDS, NAME_MAX, NOTE_MAX, AMOUNT_MAX, amountProblem, balances, canApproveSpending, canReadMoney, canRecord, inMonth, isDay,
} from '../money/rules.js';

export const moneyRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const iso = (v: Date | string | null | undefined) => (v ? (v instanceof Date ? v : new Date(v)).toISOString() : null);

interface Account { id: string; orgUnitId: string; systemId: string; name: string; status: string }
interface Entry {
  id: string; accountId: string; orgUnitId: string; systemId: string; kind: string; amount: number; occurredOn: Date | string; category: string;
  note?: string | null; status: string; recordedById: string; recordedAt: Date | string; decidedById?: string | null; decidedAt?: Date | string | null; decisionNote?: string | null; planId?: string | null;
}
interface UnitRow { id: string; name: string; systemId?: string | null }

async function names(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (!uniq.length) return out;
  const rows = (await prisma.person.findMany({ where: { id: { in: uniq } } })) as Array<{ id: string; fullName: string }>;
  for (const p of rows) out.set(p.id, p.fullName);
  return out;
}
async function planTitles(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (!uniq.length) return out;
  for (const p of (await prisma.workPlan.findMany({ where: { id: { in: uniq } } })) as Array<{ id: string; title: string }>) out.set(p.id, p.title);
  return out;
}
async function audit(actorId: string, systemId: string, action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({ data: { at: new Date(), actorId, systemId, action, resource: 'MONEY', detail, metaJson: JSON.stringify(meta) } });
}
async function ctx(me: string) {
  const { data, units } = await loadAccessData(me);
  return { data, units: units as UnitRow[] };
}
type Ctx = Awaited<ReturnType<typeof ctx>>;

async function approversOf(systemId: string, notId: string, c: Ctx): Promise<string[]> {
  const ids = [...new Set((c.data.positions as Array<{ personId: string }>).map((p) => p.personId))];
  return ids.filter((id) => id !== notId && canApproveSpending(id, systemId, c.data));
}

moneyRouter.get('/options', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const c = await ctx(me);
  res.json({
    units: c.units.filter((u) => u.systemId && canRecord(me, u.systemId, c.data)).map((u) => ({ id: u.id, name: u.name, systemId: u.systemId! })),
    categories: CATEGORIES,
    limits: { nameMax: NAME_MAX, noteMax: NOTE_MAX, amountMax: AMOUNT_MAX },
  });
});

async function entriesOf(systemId: string): Promise<Entry[]> {
  return ((await prisma.moneyEntry.findMany()) as Entry[]).filter((e) => e.systemId === systemId);
}

moneyRouter.get('/accounts', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = String(req.query.systemId ?? '');
  const c = await ctx(me);
  if (!systemId || !canReadMoney(me, systemId, c.data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const accounts = ((await prisma.moneyAccount.findMany()) as Account[]).filter((a) => a.systemId === systemId);
  const entries = await entriesOf(systemId);
  res.json({
    canRecord: canRecord(me, systemId, c.data),
    canApprove: canApproveSpending(me, systemId, c.data),
    accounts: accounts.map((a) => ({
      id: a.id, name: a.name, status: a.status, orgUnitId: a.orgUnitId, unitName: c.units.find((u) => u.id === a.orgUnitId)?.name ?? '',
      ...balances(entries.filter((e) => e.accountId === a.id)),
    })),
  });
});

moneyRouter.post('/accounts', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z.object({ unitId: z.string().min(1), name: z.string().trim().min(1).max(NAME_MAX) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid account');
  const c = await ctx(me);
  const unit = c.units.find((u) => u.id === parsed.data.unitId);
  if (!unit) return fail(res, 404, 'NOT_FOUND', 'Unit not found');
  if (!unit.systemId) return fail(res, 400, 'UNIT_HAS_NO_SYSTEM', 'This unit has no system yet');
  if (!canRecord(me, unit.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'Only the treasurer opens accounts');
  const row = (await prisma.moneyAccount.create({ data: { orgUnitId: unit.id, systemId: unit.systemId, name: parsed.data.name, status: 'ACTIVE', createdById: me } })) as Account;
  await audit(me, unit.systemId, 'MONEY_ACCOUNT_OPENED', `Opened “${row.name}”`, { accountId: row.id });
  res.status(201).json({ id: row.id });
});

moneyRouter.post('/accounts/:id/close', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const c = await ctx(me);
  const a = (await prisma.moneyAccount.findUnique({ where: { id: String(req.params.id) } })) as Account | null;
  if (!a || !canReadMoney(me, a.systemId, c.data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!canRecord(me, a.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'Only the treasurer closes accounts');
  if (a.status === 'CLOSED') return fail(res, 409, 'WRONG_STATE', 'Already closed');
  const b = balances((await entriesOf(a.systemId)).filter((e) => e.accountId === a.id));
  if (b.pending > 0) return fail(res, 409, 'PENDING_SPENDING', 'Decide the waiting spending first');
  await prisma.moneyAccount.update({ where: { id: a.id }, data: { status: 'CLOSED' } });
  await audit(me, a.systemId, 'MONEY_ACCOUNT_CLOSED', `Closed “${a.name}”`, { accountId: a.id });
  res.json({ ok: true });
});

function shapeEntry(e: Entry, who: Map<string, string>, me: string, c: Ctx, accName: string, plans: Map<string, string>) {
  return {
    planId: e.planId ?? null, planTitle: e.planId ? plans.get(e.planId) ?? '' : null,
    id: e.id, accountId: e.accountId, accountName: accName, kind: e.kind, amount: e.amount, occurredOn: iso(e.occurredOn)!.slice(0, 10),
    category: e.category, note: e.note ?? '', status: e.status, recordedByName: who.get(e.recordedById) ?? '', recordedAt: iso(e.recordedAt),
    decidedByName: e.decidedById ? who.get(e.decidedById) ?? '' : null, decisionNote: e.decisionNote ?? null,
    canDecide: e.status === 'PENDING_APPROVAL' && e.recordedById !== me && canApproveSpending(me, e.systemId, c.data),
    canVoid: canRecord(me, e.systemId, c.data) && (e.status === 'RECORDED' || e.status === 'PENDING_APPROVAL'),
  };
}

moneyRouter.get('/entries', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const q = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : '');
  const systemId = q('systemId');
  const c = await ctx(me);
  if (!systemId || !canReadMoney(me, systemId, c.data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const accounts = (await prisma.moneyAccount.findMany()) as Account[];
  const rows = (await entriesOf(systemId))
    .filter((e) => !q('accountId') || e.accountId === q('accountId'))
    .filter((e) => !q('status') || e.status === q('status'))
    .filter((e) => !q('kind') || e.kind === q('kind'))
    .filter((e) => !q('month') || inMonth(e.occurredOn, q('month')))
    .sort((a, b) => new Date(b.occurredOn).getTime() - new Date(a.occurredOn).getTime() || new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
    .slice(0, 300);
  const who = await names(rows.flatMap((e) => [e.recordedById, e.decidedById]));
  const plans = await planTitles(rows.map((e) => e.planId));
  res.json({ entries: rows.map((e) => shapeEntry(e, who, me, c, accounts.find((a) => a.id === e.accountId)?.name ?? '', plans)) });
});

moneyRouter.post('/entries', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z
    .object({
      accountId: z.string().min(1), kind: z.enum(KINDS), amount: z.number(), occurredOn: z.string(),
      category: z.enum(CATEGORIES), note: z.string().trim().max(NOTE_MAX).nullish(), planId: z.string().min(1).nullish(),
    })
    .safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid entry');
  const b = parsed.data;
  if (amountProblem(b.amount)) return fail(res, 400, 'AMOUNT', 'Enter a whole amount in francs, above zero');
  if (!isDay(b.occurredOn)) return fail(res, 400, 'BAD_DATE', 'Enter the day it happened');
  const c = await ctx(me);
  const acc = (await prisma.moneyAccount.findUnique({ where: { id: b.accountId } })) as Account | null;
  if (!acc || !canReadMoney(me, acc.systemId, c.data)) return fail(res, 404, 'NOT_FOUND', 'Account not found');
  if (!canRecord(me, acc.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'Only the treasurer records money');
  if (acc.status !== 'ACTIVE') return fail(res, 409, 'ACCOUNT_CLOSED', 'This account is closed');
  if (b.planId) {
    const plan = (await prisma.workPlan.findUnique({ where: { id: b.planId } })) as { systemId: string } | null;
    if (!plan || plan.systemId !== acc.systemId) return fail(res, 400, 'BAD_PLAN', 'Choose a program, project or event of this system');
  }
  const spending = b.kind === 'SPENDING';
  const row = (await prisma.moneyEntry.create({
    data: {
      accountId: acc.id, orgUnitId: acc.orgUnitId, systemId: acc.systemId, kind: b.kind, amount: b.amount, occurredOn: new Date(`${b.occurredOn}T00:00:00Z`),
      category: b.category, note: b.note || null, status: spending ? 'PENDING_APPROVAL' : 'RECORDED', recordedById: me, planId: b.planId || null,
    },
  })) as Entry;
  if (spending) {
    for (const id of await approversOf(acc.systemId, me, c)) {
      await notifySafely(prisma as never, {
        kind: 'WAITING_FOR_ME', toPersonId: id, systemId: acc.systemId, title: `Spending to approve: ${b.amount.toLocaleString('en')} RWF`, body: b.note ?? b.category,
        href: `/s/${acc.systemId}/money`, important: true, sourceKey: `money-ask:${row.id}:${id}`,
      });
    }
  }
  await audit(me, acc.systemId, spending ? 'MONEY_SPENDING_REQUESTED' : 'MONEY_INCOME_RECORDED', `${b.kind} ${b.amount} RWF`, { entryId: row.id, accountId: acc.id });
  res.status(201).json({ id: row.id, status: row.status });
});

async function entryFor(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const c = await ctx(me);
  const e = (await prisma.moneyEntry.findUnique({ where: { id: String(req.params.id) } })) as Entry | null;
  if (!e || !canReadMoney(me, e.systemId, c.data)) {
    fail(res, 404, 'NOT_FOUND', 'Entry not found');
    return null;
  }
  return { me, c, e };
}

async function decide(req: AuthedRequest, res: Res, approve: boolean) {
  const got = await entryFor(req, res);
  if (!got) return;
  const { me, c, e } = got;
  if (e.kind !== 'SPENDING' || e.status !== 'PENDING_APPROVAL') return fail(res, 409, 'WRONG_STATE', 'This entry is not waiting for approval');
  if (e.recordedById === me) return fail(res, 403, 'OWN_ENTRY', 'Nobody approves their own entry');
  if (!canApproveSpending(me, e.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not approve spending here');
  const parsed = z.object({ reason: z.string().trim().max(NOTE_MAX).nullish() }).safeParse(req.body ?? {});
  const reason = (parsed.success && parsed.data.reason) || null;
  if (!approve && !reason) return fail(res, 400, 'REASON_REQUIRED', 'Please give a reason');
  await prisma.moneyEntry.update({ where: { id: e.id }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: me, decidedAt: new Date(), decisionNote: reason } });
  await notifySafely(prisma as never, {
    kind: 'FOR_INFORMATION', toPersonId: e.recordedById, systemId: e.systemId, title: `Spending ${approve ? 'approved' : 'declined'}: ${e.amount.toLocaleString('en')} RWF`,
    body: reason, href: `/s/${e.systemId}/money`, sourceKey: `money-decided:${e.id}`,
  });
  await audit(me, e.systemId, approve ? 'MONEY_SPENDING_APPROVED' : 'MONEY_SPENDING_DECLINED', `${approve ? 'Approved' : 'Declined'} ${e.amount} RWF`, { entryId: e.id });
  res.json({ ok: true });
}
moneyRouter.post('/entries/:id/approve', requireAuth, (req: AuthedRequest, res) => decide(req, res, true));
moneyRouter.post('/entries/:id/reject', requireAuth, (req: AuthedRequest, res) => decide(req, res, false));

moneyRouter.post('/entries/:id/void', requireAuth, async (req: AuthedRequest, res) => {
  const got = await entryFor(req, res);
  if (!got) return;
  const { me, c, e } = got;
  if (!canRecord(me, e.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'Only the treasurer voids entries');
  if (e.status !== 'RECORDED' && e.status !== 'PENDING_APPROVAL') return fail(res, 409, 'WRONG_STATE', 'Approved or settled entries are final');
  const parsed = z.object({ reason: z.string().trim().min(1).max(NOTE_MAX) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'REASON_REQUIRED', 'Please give a reason');
  await prisma.moneyEntry.update({ where: { id: e.id }, data: { status: 'VOIDED', decidedById: me, decidedAt: new Date(), decisionNote: parsed.data.reason } });
  await audit(me, e.systemId, 'MONEY_ENTRY_VOIDED', `Voided ${e.kind} ${e.amount} RWF`, { entryId: e.id, reason: parsed.data.reason });
  res.json({ ok: true });
});
