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
import { CATEGORIES, canApproveSpending, canReadMoney, canRecord, isDay, amountProblem, NOTE_MAX } from '../money/rules.js';
import { POTS, SOURCE_TAGS, cleanPurpose, computePots, parsePurpose, placeOf, shareProportional, type EarmarkLike, type IncomeLike, type Pot } from '../money/funds.js';
import { moneySchema, parseStored, EMPTY_MONEY } from '../systemSettings/rules.js';

export const fundsRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);
const CHURCH = 'sys-main';

interface IncomeRow extends IncomeLike { sourceTag?: string; id: string; systemId: string; label: string; expectedOn?: Date | string | null; receivedOn?: Date | string | null; note?: string | null; recordedById: string; recordedAt: Date | string }
interface ListRow { id: string; systemId: string; level: string; typeCode: string; status: string; purpose?: string }
interface LineRow { listId: string; amount: number }
interface DonRow { systemId: string; amount: number; status: string; purpose?: string }
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

/** Every bucket (pot and purpose) of a unit with its figures. `exceptPlanId` leaves one activity's own earmark out, to check a new list against the rest. */
export async function potsOf(systemId: string, exceptPlanId?: string, sweep = true): Promise<Pot[]> {
  if (sweep) await sweepSettlements(systemId);
  const sums = new Map<string, number>();
  for (const l of (await prisma.contributionLine.findMany()) as LineRow[]) sums.set(l.listId, (sums.get(l.listId) ?? 0) + l.amount);
  const lists = ((await prisma.contributionList.findMany({ where: { systemId } })) as ListRow[]).filter((l) => l.systemId === systemId && l.level === 'UNIT' && (l.status === 'APPROVED' || l.status === 'SUBMITTED'));
  const donations = ((await prisma.donation.findMany({ where: { systemId } })) as DonRow[]).filter((d) => d.systemId === systemId && (d.status === 'APPROVED' || d.status === 'PENDING'));
  const records = ((await prisma.incomeRecord.findMany({ where: { systemId } })) as IncomeRow[]).filter((r) => r.systemId === systemId);
  const planRows = ((await prisma.workPlan.findMany({ where: { systemId } })) as Array<PlanLite & { title?: string }>);
  const plans = new Map(planRows.map((p) => [p.id, p]));
  const sources = ((await prisma.planSource.findMany({ where: { systemId } })) as SourceRow[]).filter((s) => s.systemId === systemId && plans.has(s.planId) && HOLDING(plans.get(s.planId)!));
  const earmarks: EarmarkLike[] = sources.filter((s) => s.planId !== exceptPlanId).map((s) => ({ kind: s.kind, code: s.code, amount: s.amount }));
  // An open budget amendment holds its extra amount back from the sources until it is decided.
  const reserved: EarmarkLike[] = ((await prisma.budgetAmendment.findMany({ where: { systemId } })) as Array<{ planId: string; systemId: string; status: string; reserveJson: string }>)
    .filter((a) => a.systemId === systemId && a.status === 'PENDING' && a.planId !== exceptPlanId && plans.has(a.planId) && HOLDING(plans.get(a.planId)!))
    .flatMap((a) => { try { return JSON.parse(a.reserveJson) as EarmarkLike[]; } catch { return []; } });
  earmarks.push(...reserved);
  const adjustments = ((await prisma.fundAdjustment.findMany({ where: { systemId } })) as AdjRow[]).filter((a) => a.systemId === systemId && a.reason !== 'UNCOVERED');
  // What each activity has spent of its earmark, shared over its sources.
  const used = new Map<string, number>();
  for (const e of (await prisma.moneyEntry.findMany({ where: { systemId } })) as Array<{ planId?: string | null; kind: string; status: string; amount: number }>)
    if (e.planId && e.kind === 'SPENDING' && e.status === 'APPROVED') used.set(e.planId, (used.get(e.planId) ?? 0) + e.amount);
  const spent: EarmarkLike[] = [];
  for (const [planId, n] of used) {
    const own = sources.filter((s) => s.planId === planId && s.planId !== exceptPlanId);
    const cap = Math.min(n, own.reduce((m, s) => m + s.amount, 0));
    for (const part of shareProportional(own, cap)) spent.push({ kind: part.item.kind, code: part.item.code, amount: part.amount });
  }
  const labels: Record<string, string> = {};
  for (const p of planRows) labels[`A:${p.id}`] = p.title ?? '';
  return computePots({
    contributions: lists.map((l) => ({ purpose: cleanPurpose(l.purpose), amount: sums.get(l.id) ?? 0, status: l.status })),
    donations: donations.map((d) => ({ purpose: cleanPurpose(d.purpose), amount: d.amount, status: d.status })),
    records, adjustments, earmarks, spent, labels,
  });
}

interface AdjRow { systemId: string; kind: string; code: string; amount: number; reason: string }

/** Overspend that nothing could cover, still owed. */
export async function uncoveredOf(systemId: string): Promise<number> {
  return ((await prisma.fundAdjustment.findMany({ where: { systemId } })) as AdjRow[]).filter((a) => a.systemId === systemId && a.reason === 'UNCOVERED').reduce((n, a) => n + a.amount, 0);
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

const shape = (r: IncomeRow, who: Map<string, string>, titles: Map<string, string>, me: string, approve: boolean) => {
  const place = placeOf(r.kind, r.code);
  const pk = parsePurpose(place.purpose);
  return {
    id: r.id, kind: place.kind, sourceTag: r.sourceTag ?? 'OTHER', purpose: place.purpose, purposeKind: pk.kind,
    purposeLabel: pk.kind === 'ACTIVITY' ? titles.get(pk.ref) ?? '' : pk.ref,
    label: r.label, amount: r.amount, status: r.status, note: r.note ?? null,
    expectedOn: iso(r.expectedOn)?.slice(0, 10) ?? null, receivedOn: iso(r.receivedOn)?.slice(0, 10) ?? null, recordedByName: who.get(r.recordedById) ?? '',
    canApprove: r.status === 'AWAITING' && approve && r.recordedById !== me,
  };
};

/** What activities have spent against their earmarks (never more than the earmark), and money that is in but not yet approved. */
/** The Money home figures for a system: secured = spent + still reserved + available. */
export async function fundTotals(systemId: string) {
  const t = totalsOf(await potsOf(systemId));
  return { secured: t.secured, spent: t.spent, reserved: t.reserved, available: t.available };
}

export function totalsOf(pots: Pot[]) {
  return pots.reduce((a, p) => ({ secured: a.secured + p.secured, pledged: a.pledged + p.pledged, awaiting: a.awaiting + p.awaiting, earmarked: a.earmarked + p.earmarked, spent: a.spent + p.spent, reserved: a.reserved + p.reserved, available: a.available + p.available }), { secured: 0, pledged: 0, awaiting: 0, earmarked: 0, spent: 0, reserved: 0, available: 0 });
}

const STATE_ORDER: Record<string, number> = { AWAITING: 0, PLEDGED: 1, SECURED: 2, FULFILLED: 3, CANCELLED: 4 };
/** Donation and contribution money is only secured once the President has approved it. */
const needsApproval = (tag: string) => tag === 'DONATION' || tag === 'CONTRIBUTION';

fundsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const systemId = String(req.query.systemId ?? '');
  if (!systemId) return fail(res, 400, 'BAD_INPUT', 'systemId is required');
  const s = await standing(req, res, systemId, 'read');
  if (!s) return;
  const { data } = await loadAccessData(s.me);
  const rows = ((await prisma.incomeRecord.findMany({ where: { systemId } })) as IncomeRow[])
    .filter((r) => r.systemId === systemId && r.status !== 'CANCELLED')
    .sort((a, b) => (STATE_ORDER[a.status] ?? 9) - (STATE_ORDER[b.status] ?? 9) || new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
    .slice(0, 200);
  const people = (await prisma.person.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.recordedById))] } } })) as Array<{ id: string; fullName: string }>;
  const who = new Map(people.map((p) => [p.id, p.fullName]));
  const pots = await potsOf(systemId);
  const t = totalsOf(pots);
  const approve = canApproveSpending(s.me, systemId, data);
  const plans = ((await prisma.workPlan.findMany({ where: { systemId } })) as Array<{ id: string; systemId: string; title: string; status: string; deletedAt?: unknown }>).filter((p) => p.systemId === systemId && !p.deletedAt && !['CANCELLED', 'ENDED'].includes(p.status));
  const titles = new Map(((await prisma.workPlan.findMany({ where: { systemId } })) as Array<{ id: string; title: string }>).map((p) => [p.id, p.title]));
  res.json({
    systemId, canRecord: s.write, canApprove: approve, pots,
    groups: POTS.map((kind) => {
      const own = pots.filter((p) => p.kind === kind);
      return { kind, ...totalsOf(own), buckets: own };
    }),
    totals: t, uncovered: await uncoveredOf(systemId),
    purposes: { activities: plans.map((p) => ({ id: p.id, title: p.title })), categories: [...CATEGORIES] },
    records: rows.map((r) => shape(r, who, titles, s.me, approve)),
  });
});

const recordSchema = z.object({
  systemId: z.string().min(1), sourceTag: z.enum(SOURCE_TAGS).optional(), kind: z.string().max(20).nullish(), label: z.string().trim().min(1).max(120),
  amount: z.number(), purpose: z.string().max(100).nullish(), status: z.enum(['PLEDGED', 'SECURED']),
  expectedOn: z.string().nullish(), receivedOn: z.string().nullish(), note: z.string().trim().max(NOTE_MAX).nullish(),
});

/** The purpose must be Unrestricted, an activity of this unit that is not over, or a spending category. */
export async function purposeProblem(systemId: string, purpose: string): Promise<boolean> {
  const p = parsePurpose(purpose);
  if (p.kind === 'UNRESTRICTED') return false;
  if (p.kind === 'CATEGORY') return !(CATEGORIES as readonly string[]).includes(p.ref);
  const plan = (await prisma.workPlan.findUnique({ where: { id: p.ref } })) as { systemId: string; status: string; deletedAt?: unknown } | null;
  return !plan || plan.systemId !== systemId || !!plan.deletedAt || ['CANCELLED', 'ENDED'].includes(plan.status);
}

fundsRouter.post('/income', requireAuth, async (req: AuthedRequest, res) => {
  const p = recordSchema.safeParse(req.body);
  if (!p.success) return fail(res, 400, 'BAD_INPUT', 'Check the income');
  const d = p.data;
  const s = await standing(req, res, d.systemId, 'write');
  if (!s) return;
  if (amountProblem(d.amount)) return fail(res, 400, 'AMOUNT', 'Enter a whole amount in francs, above zero');
  const tag = d.sourceTag ?? (d.kind === 'CONTRIBUTION' ? 'CONTRIBUTION' : d.kind === 'DONATION' ? 'DONATION' : 'OTHER');
  const purpose = d.purpose ? (cleanPurpose(d.purpose) === d.purpose ? d.purpose : null) : '';
  if (purpose === null || (await purposeProblem(d.systemId, purpose))) return fail(res, 400, 'BAD_PURPOSE', 'Choose what this money is for');
  for (const day of [d.expectedOn, d.receivedOn]) if (day && !isDay(day)) return fail(res, 400, 'BAD_DATE', 'Enter a real day');
  const now = new Date();
  // Received donation and contribution money waits for the President; other income is secured by the treasurer.
  const status = d.status === 'PLEDGED' ? 'PLEDGED' : needsApproval(tag) ? 'AWAITING' : 'SECURED';
  const row = (await prisma.incomeRecord.create({
    data: {
      systemId: d.systemId, kind: tag === 'CONTRIBUTION' ? 'CONTRIBUTION' : 'DONATION', code: purpose, sourceTag: tag, label: d.label, amount: d.amount, status, note: d.note || null,
      expectedOn: d.expectedOn ? new Date(`${d.expectedOn}T00:00:00Z`) : null,
      receivedOn: status !== 'PLEDGED' ? new Date(d.receivedOn ? `${d.receivedOn}T00:00:00Z` : now) : null,
      recordedById: s.me, recordedAt: now, updatedAt: now,
    },
  })) as IncomeRow;
  await audit(s.me, d.systemId, 'MONEY_INCOME_RECORDED', `${status === 'PLEDGED' ? 'Promised' : 'Received'} ${row.amount} RWF: ${row.label}`, { id: row.id, tag, purpose });
  res.status(201).json({ id: row.id, status });
});

async function load(req: AuthedRequest, res: Res, need: 'write' | 'approve') {
  const row = (await prisma.incomeRecord.findUnique({ where: { id: String(req.params.id) } })) as IncomeRow | null;
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Not found'), null;
  const s = await standing(req, res, row.systemId, need === 'approve' ? 'read' : 'write');
  if (!s) return null;
  if (need === 'approve') {
    const { data } = await loadAccessData(s.me);
    if (!canApproveSpending(s.me, row.systemId, data)) return fail(res, 403, 'FORBIDDEN', 'Only the president approves this money'), null;
  }
  return { row, s };
}

/** The promised money has arrived. Donation and contribution money then waits for the President; other income is secured. */
fundsRouter.post('/income/:id/received', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res, 'write');
  if (!got) return;
  const { row, s } = got;
  if (row.status !== 'PLEDGED') return fail(res, 409, 'WRONG_STATE', 'Only a promise can be marked as received');
  const day = z.object({ receivedOn: z.string().nullish() }).safeParse(req.body ?? {});
  if (day.success && day.data.receivedOn && !isDay(day.data.receivedOn)) return fail(res, 400, 'BAD_DATE', 'Enter a real day');
  const at = day.success && day.data.receivedOn ? new Date(`${day.data.receivedOn}T00:00:00Z`) : new Date();
  const next = needsApproval(row.sourceTag ?? 'OTHER') ? 'AWAITING' : 'SECURED';
  await prisma.incomeRecord.update({ where: { id: row.id }, data: { status: next, receivedOn: at, updatedById: s.me, updatedAt: new Date() } });
  await audit(s.me, row.systemId, 'MONEY_INCOME_RECEIVED', `${row.amount} RWF: ${row.label}`, { id: row.id });
  res.json({ ok: true, status: next });
});

/** The President approves received donation or contribution money into the secured balance, or declines it with a reason. Never their own entry. */
async function decideIncome(req: AuthedRequest, res: Res, approve: boolean) {
  const got = await load(req, res, 'approve');
  if (!got) return;
  const { row, s } = got;
  if (row.status !== 'AWAITING') return fail(res, 409, 'WRONG_STATE', 'This money is not waiting for approval');
  if (row.recordedById === s.me) return fail(res, 403, 'OWN_ENTRY', 'Nobody approves their own entry');
  const reason = z.object({ reason: z.string().trim().max(NOTE_MAX).nullish() }).safeParse(req.body ?? {});
  const note = (reason.success && reason.data.reason) || null;
  if (!approve && !note) return fail(res, 400, 'REASON_REQUIRED', 'Please give a reason');
  const now = new Date();
  await prisma.incomeRecord.update({ where: { id: row.id }, data: approve ? { status: 'SECURED', approvedById: s.me, approvedAt: now, updatedById: s.me, updatedAt: now } : { status: 'CANCELLED', note: note, updatedById: s.me, updatedAt: now } });
  await audit(s.me, row.systemId, approve ? 'MONEY_INCOME_APPROVED' : 'MONEY_INCOME_DECLINED', `${row.amount} RWF: ${row.label}`, { id: row.id });
  res.json({ ok: true });
}
fundsRouter.post('/income/:id/approve', requireAuth, (req, res) => decideIncome(req as AuthedRequest, res, true));
fundsRouter.post('/income/:id/decline', requireAuth, (req, res) => decideIncome(req as AuthedRequest, res, false));

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
