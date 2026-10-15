/**
 * Funds (slice 3): what each unit has in its pots, and the income the treasurer records as promised or received.
 * Reading needs the Money read letter of the unit; recording needs the Money write letter. Collections never feed a pot.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { sweepSettlements } from '../money/settlement.js';
import { canReadMoney, canRecord, isDay, amountProblem, NOTE_MAX } from '../money/rules.js';
import { SOURCE_KINDS, codeFor, computePots, potId, POOL_CODE, type EarmarkLike, type IncomeLike, type Pot } from '../money/funds.js';
import { moneySchema, parseStored, EMPTY_MONEY } from '../systemSettings/rules.js';

export const fundsRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);
const CHURCH = 'sys-main';

interface IncomeRow extends IncomeLike { id: string; systemId: string; label: string; expectedOn?: Date | string | null; receivedOn?: Date | string | null; note?: string | null; recordedById: string; recordedAt: Date | string }
interface ListRow { id: string; systemId: string; level: string; typeCode: string; status: string }
interface LineRow { listId: string; amount: number }
interface DonRow { systemId: string; amount: number; status: string }
interface SourceRow { planId: string; systemId: string; kind: string; code: string; amount: number }
interface PlanLite { id: string; status: string; deletedAt?: Date | string | null }

async function types(systemId: string) {
  const row = (await prisma.systemSetting.findUnique({ where: { systemId } })) as { moneyJson?: string } | null;
  return parseStored(row?.moneyJson, moneySchema, EMPTY_MONEY).types;
}

/** The unit's own contribution types: the ones the church does not set for every unit. */
export async function ownTypes(systemId: string): Promise<Array<{ code: string; name: string }>> {
  if (systemId === CHURCH) return [];
  const wide = new Set((await types(CHURCH)).map((t) => t.code));
  return (await types(systemId)).filter((t) => !wide.has(t.code)).map((t) => ({ code: t.code, name: t.name }));
}

/** Activities whose earmarks still hold money: everything submitted and not cancelled or deleted (a draft holds nothing; it is checked again at Submit). (An ended activity returns its unspent money at settlement.) */
const HOLDING = (p: PlanLite) => !p.deletedAt && p.status !== 'CANCELLED' && p.status !== 'DRAFT';

/** Every pot of a unit with its figures. `exceptPlanId` leaves one activity's own earmark out, to check a new list against the rest. */
export async function potsOf(systemId: string, exceptPlanId?: string): Promise<Pot[]> {
  await sweepSettlements(systemId);
  const own = await ownTypes(systemId);
  const lists = ((await prisma.contributionList.findMany({ where: { systemId } })) as ListRow[]).filter((l) => l.systemId === systemId && l.level === 'UNIT' && l.status === 'APPROVED');
  const lines = (await prisma.contributionLine.findMany()) as LineRow[];
  const sums = new Map<string, number>();
  for (const l of lines) sums.set(l.listId, (sums.get(l.listId) ?? 0) + l.amount);
  const securedByCode = new Map<string, number>();
  for (const l of lists) securedByCode.set(l.typeCode, (securedByCode.get(l.typeCode) ?? 0) + (sums.get(l.id) ?? 0));
  const donations = ((await prisma.donation.findMany({ where: { systemId } })) as DonRow[]).filter((d) => d.systemId === systemId && d.status === 'APPROVED');
  const records = ((await prisma.incomeRecord.findMany({ where: { systemId } })) as IncomeRow[]).filter((r) => r.systemId === systemId);
  const plans = new Map(((await prisma.workPlan.findMany({ where: { systemId } })) as PlanLite[]).map((p) => [p.id, p]));
  const earmarks: EarmarkLike[] = ((await prisma.planSource.findMany({ where: { systemId } })) as SourceRow[])
    .filter((s) => s.systemId === systemId && s.planId !== exceptPlanId && plans.has(s.planId) && HOLDING(plans.get(s.planId)!))
    .map((s) => ({ kind: s.kind, code: s.code, amount: s.amount }));
  // An open budget amendment holds its extra amount back from the sources until it is decided.
  const reserved: EarmarkLike[] = ((await prisma.budgetAmendment.findMany({ where: { systemId } })) as Array<{ planId: string; systemId: string; status: string; reserveJson: string }>)
    .filter((a) => a.systemId === systemId && a.status === 'PENDING' && a.planId !== exceptPlanId && plans.has(a.planId) && HOLDING(plans.get(a.planId)!))
    .flatMap((a) => { try { return JSON.parse(a.reserveJson) as EarmarkLike[]; } catch { return []; } });
  earmarks.push(...reserved);
  return computePots({
    own: own.map((t) => ({ ...t, secured: securedByCode.get(t.code) ?? 0 })),
    donationsSecured: donations.reduce((n, d) => n + d.amount, 0),
    records,
    earmarks,
  });
}

async function standing(req: AuthedRequest, res: Res, systemId: string, need: 'read' | 'write') {
  const me = req.auth!.personId;
  const { data } = await loadAccessData(me);
  const read = canReadMoney(me, systemId, data);
  const write = canRecord(me, systemId, data);
  if (!read) return fail(res, 404, 'NOT_FOUND', 'Not found'), null;
  if (need === 'write' && !write) return fail(res, 403, 'FORBIDDEN', 'Only the treasurer records income'), null;
  return { me, read, write };
}

async function audit(actorId: string, systemId: string, action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({ data: { at: new Date(), actorId, systemId, action, resource: 'MONEY', detail, metaJson: JSON.stringify(meta) } });
}

const shape = (r: IncomeRow, who: Map<string, string>) => ({
  id: r.id, kind: r.kind, code: r.code, label: r.label, amount: r.amount, status: r.status, note: r.note ?? null,
  expectedOn: iso(r.expectedOn)?.slice(0, 10) ?? null, receivedOn: iso(r.receivedOn)?.slice(0, 10) ?? null, recordedByName: who.get(r.recordedById) ?? '',
});

/** What activities have spent against their earmarks (never more than the earmark), and money that is in but not yet approved. */
async function spentAndAwaiting(systemId: string): Promise<{ spent: number; awaiting: number }> {
  const plans = new Map(((await prisma.workPlan.findMany({ where: { systemId } })) as PlanLite[]).map((p) => [p.id, p]));
  const earmark = new Map<string, number>();
  for (const s of (await prisma.planSource.findMany({ where: { systemId } })) as SourceRow[]) if (plans.has(s.planId) && HOLDING(plans.get(s.planId)!)) earmark.set(s.planId, (earmark.get(s.planId) ?? 0) + s.amount);
  const used = new Map<string, number>();
  for (const e of (await prisma.moneyEntry.findMany({ where: { systemId } })) as Array<{ planId?: string | null; kind: string; status: string; amount: number }>)
    if (e.planId && e.kind === 'SPENDING' && e.status === 'APPROVED') used.set(e.planId, (used.get(e.planId) ?? 0) + e.amount);
  let spent = 0;
  for (const [id, n] of used) spent += Math.min(n, earmark.get(id) ?? 0);
  const sums = new Map<string, number>();
  for (const l of (await prisma.contributionLine.findMany()) as LineRow[]) sums.set(l.listId, (sums.get(l.listId) ?? 0) + l.amount);
  const lists = ((await prisma.contributionList.findMany({ where: { systemId } })) as ListRow[]).filter((l) => l.systemId === systemId && l.level === 'UNIT' && l.status === 'SUBMITTED');
  const donations = ((await prisma.donation.findMany({ where: { systemId } })) as DonRow[]).filter((d) => d.systemId === systemId && d.status === 'PENDING');
  return { spent, awaiting: lists.reduce((n, l) => n + (sums.get(l.id) ?? 0), 0) + donations.reduce((n, d) => n + d.amount, 0) };
}

/** The Money home figures for a system: secured = spent + still reserved + available. */
export async function fundTotals(systemId: string) {
  const pots = await potsOf(systemId);
  const t = pots.reduce((a, x) => ({ secured: a.secured + x.secured, earmarked: a.earmarked + x.earmarked, available: a.available + x.available }), { secured: 0, earmarked: 0, available: 0 });
  const { spent } = await spentAndAwaiting(systemId);
  return { secured: t.secured, spent, reserved: Math.max(0, t.earmarked - spent), available: t.available };
}

fundsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const systemId = String(req.query.systemId ?? '');
  if (!systemId) return fail(res, 400, 'BAD_INPUT', 'systemId is required');
  const s = await standing(req, res, systemId, 'read');
  if (!s) return;
  const rows = ((await prisma.incomeRecord.findMany({ where: { systemId } })) as IncomeRow[])
    .filter((r) => r.systemId === systemId && r.status !== 'CANCELLED')
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
    .slice(0, 200);
  const people = (await prisma.person.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.recordedById))] } } })) as Array<{ id: string; fullName: string }>;
  const who = new Map(people.map((p) => [p.id, p.fullName]));
  const pots = await potsOf(systemId);
  const pool = pots.find((p) => p.id === potId('OTHER', POOL_CODE));
  const totals = pots.reduce((a, p) => ({ secured: a.secured + p.secured, pledged: a.pledged + p.pledged, earmarked: a.earmarked + p.earmarked, available: a.available + p.available }), { secured: 0, pledged: 0, earmarked: 0, available: 0 });
  const { spent, awaiting } = await spentAndAwaiting(systemId);
  res.json({
    systemId, canRecord: s.write, pots, pool: pool ? { secured: pool.secured, available: pool.available } : null,
    // Spent counts inside what is set aside, so secured = spent + still reserved + available.
    totals: { ...totals, spent, reserved: Math.max(0, totals.earmarked - spent), awaiting },
    ownTypes: await ownTypes(systemId), records: rows.map((r) => shape(r, who)),
  });
});

const recordSchema = z.object({
  systemId: z.string().min(1), kind: z.enum(SOURCE_KINDS), code: z.string().max(40).nullish(), label: z.string().trim().min(1).max(120),
  amount: z.number(), status: z.enum(['PLEDGED', 'SECURED']), expectedOn: z.string().nullish(), receivedOn: z.string().nullish(), note: z.string().trim().max(NOTE_MAX).nullish(),
});

fundsRouter.post('/income', requireAuth, async (req: AuthedRequest, res) => {
  const p = recordSchema.safeParse(req.body);
  if (!p.success) return fail(res, 400, 'BAD_INPUT', 'Check the income');
  const d = p.data;
  const s = await standing(req, res, d.systemId, 'write');
  if (!s) return;
  if (amountProblem(d.amount)) return fail(res, 400, 'AMOUNT', 'Enter a whole amount in francs, above zero');
  const code = codeFor(d.kind, d.code);
  if (code === null) return fail(res, 400, 'BAD_CODE', 'Choose where this money goes');
  // Money that comes in through a contribution list or a donation is recorded there; here it can only be promised.
  if (d.status === 'SECURED' && d.kind !== 'OTHER') return fail(res, 400, 'USE_ITS_OWN_RECORD', 'Record received contributions and donations where they are recorded; here they can only be promised');
  if (d.kind === 'CONTRIBUTION' && !(await ownTypes(d.systemId)).some((t) => t.code === code)) return fail(res, 400, 'BAD_CODE', 'Choose one of this unit’s own contribution types');
  for (const day of [d.expectedOn, d.receivedOn]) if (day && !isDay(day)) return fail(res, 400, 'BAD_DATE', 'Enter a real day');
  const now = new Date();
  const row = (await prisma.incomeRecord.create({
    data: {
      systemId: d.systemId, kind: d.kind, code, label: d.label, amount: d.amount, status: d.status, note: d.note || null,
      expectedOn: d.expectedOn ? new Date(`${d.expectedOn}T00:00:00Z`) : null,
      receivedOn: d.status === 'SECURED' ? new Date(d.receivedOn ? `${d.receivedOn}T00:00:00Z` : now) : null,
      recordedById: s.me, recordedAt: now, updatedAt: now,
    },
  })) as IncomeRow;
  await audit(s.me, d.systemId, 'MONEY_INCOME_RECORDED', `${d.status === 'PLEDGED' ? 'Promised' : 'Received'} ${row.amount} RWF: ${row.label}`, { id: row.id, kind: row.kind, code: row.code });
  res.status(201).json({ id: row.id });
});

async function load(req: AuthedRequest, res: Res, need: 'write') {
  const row = (await prisma.incomeRecord.findUnique({ where: { id: String(req.params.id) } })) as IncomeRow | null;
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Not found'), null;
  const s = await standing(req, res, row.systemId, need);
  return s ? { row, s } : null;
}

/** The promised money has arrived. Other income becomes secured here; a contribution or donation is marked fulfilled, the money itself comes in through its own record. */
fundsRouter.post('/income/:id/received', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res, 'write');
  if (!got) return;
  const { row, s } = got;
  if (row.status !== 'PLEDGED') return fail(res, 409, 'WRONG_STATE', 'Only a promise can be marked as received');
  const day = z.object({ receivedOn: z.string().nullish() }).safeParse(req.body ?? {});
  if (day.success && day.data.receivedOn && !isDay(day.data.receivedOn)) return fail(res, 400, 'BAD_DATE', 'Enter a real day');
  const at = day.success && day.data.receivedOn ? new Date(`${day.data.receivedOn}T00:00:00Z`) : new Date();
  const next = row.kind === 'OTHER' ? 'SECURED' : 'FULFILLED';
  await prisma.incomeRecord.update({ where: { id: row.id }, data: { status: next, receivedOn: at, updatedById: s.me, updatedAt: new Date() } });
  await audit(s.me, row.systemId, 'MONEY_INCOME_RECEIVED', `${row.amount} RWF: ${row.label}`, { id: row.id });
  res.json({ ok: true, status: next });
});

/** A promise that will not come. Received money is never cancelled. */
fundsRouter.post('/income/:id/cancel', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res, 'write');
  if (!got) return;
  const { row, s } = got;
  if (row.status !== 'PLEDGED') return fail(res, 409, 'WRONG_STATE', 'Only a promise can be cancelled; received money stays on record');
  await prisma.incomeRecord.update({ where: { id: row.id }, data: { status: 'CANCELLED', updatedById: s.me, updatedAt: new Date() } });
  await audit(s.me, row.systemId, 'MONEY_INCOME_CANCELLED', `${row.amount} RWF: ${row.label}`, { id: row.id });
  res.json({ ok: true });
});
