/**
 * Collections (slice 3.4): offerings counted at services. A count is recorded (W) by the people who
 * counted, confirmed (A) by someone who did not, and handed to the treasurer. It carries no money
 * letters and no link to Money: the treasurer records what was handed over there, on their own.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { lettersInSystem, type AccessData } from '../capabilities/engine.js';
import { notifySafely } from '../lib/notify.js';
import { AMOUNT_MAX, NOTE_MAX, amountProblem, isDay } from '../money/rules.js';

export const collectionsRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const iso = (v: Date | string | null | undefined) => (v ? (v instanceof Date ? v : new Date(v)).toISOString() : null);
const KINDS = ['OFFERING', 'THANKSGIVING', 'SPECIAL'] as const;

interface Count {
  id: string; orgUnitId: string; systemId: string; serviceOn: Date | string; label: string; kind: string; amount: number; countersJson?: string | null;
  note?: string | null; status: string; recordedById: string; recordedAt: Date | string; confirmedById?: string | null; confirmedAt?: Date | string | null;
  handedToId?: string | null; handedAt?: Date | string | null; voidReason?: string | null;
}
interface UnitRow { id: string; name: string; systemId?: string | null }

/** Tithes, offerings and other givings belong to Central Administration only: no other system holds them. */
export const COLLECTIONS_SYSTEM = 'sys-main';
const g = (me: string, s: string, d: AccessData) => (s === COLLECTIONS_SYSTEM ? (lettersInSystem(me, s, d, new Date()).GOVERNANCE as string[]) : []);
const canRead = (me: string, s: string, d: AccessData) => g(me, s, d).includes('R');
const canWrite = (me: string, s: string, d: AccessData) => g(me, s, d).includes('W');
const canConfirm = (me: string, s: string, d: AccessData) => g(me, s, d).includes('A');
const countersOf = (c: Count): string[] => {
  try {
    const v = JSON.parse(c.countersJson ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

async function names(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (!uniq.length) return out;
  const rows = (await prisma.person.findMany({ where: { id: { in: uniq } } })) as Array<{ id: string; fullName: string }>;
  for (const p of rows) out.set(p.id, p.fullName);
  return out;
}
async function audit(actorId: string, systemId: string, action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({ data: { at: new Date(), actorId, systemId, action, resource: 'GOVERNANCE', detail, metaJson: JSON.stringify(meta) } });
}
async function ctx(me: string) {
  const { data, units } = await loadAccessData(me);
  return { data, units: units as UnitRow[] };
}
type Ctx = Awaited<ReturnType<typeof ctx>>;

async function shapeAll(rows: Count[], c: Ctx, me: string) {
  const who = await names(rows.flatMap((r) => [r.recordedById, r.confirmedById, r.handedToId, ...countersOf(r)]));
  return rows.map((r) => ({
    id: r.id, systemId: r.systemId, unitName: c.units.find((u) => u.id === r.orgUnitId)?.name ?? '', serviceOn: iso(r.serviceOn)!.slice(0, 10), label: r.label,
    kind: r.kind, amount: r.amount, note: r.note ?? '', status: r.status, counters: countersOf(r).map((id) => ({ id, name: who.get(id) ?? '' })),
    recordedByName: who.get(r.recordedById) ?? '', confirmedByName: r.confirmedById ? who.get(r.confirmedById) ?? '' : null,
    handedToName: r.handedToId ? who.get(r.handedToId) ?? '' : null, handedAt: iso(r.handedAt), voidReason: r.voidReason ?? null,
    canConfirm: r.status === 'RECORDED' && canConfirm(me, r.systemId, c.data) && r.recordedById !== me && !countersOf(r).includes(me),
    canVoid: r.status === 'RECORDED' && canWrite(me, r.systemId, c.data),
    canHandOver: r.status === 'CONFIRMED' && !r.handedToId && canWrite(me, r.systemId, c.data),
  }));
}

collectionsRouter.get('/options', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const c = await ctx(me);
  res.json({
    units: c.units.filter((u) => u.systemId && canWrite(me, u.systemId, c.data)).map((u) => ({ id: u.id, name: u.name, systemId: u.systemId! })),
    kinds: KINDS,
    limits: { noteMax: NOTE_MAX, amountMax: AMOUNT_MAX },
  });
});

collectionsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = typeof req.query.systemId === 'string' ? req.query.systemId : '';
  const c = await ctx(me);
  if (!systemId || !canRead(me, systemId, c.data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const rows = ((await prisma.offeringCount.findMany()) as Count[])
    .filter((r) => r.systemId === systemId && (!status || r.status === status))
    .sort((a, b) => new Date(b.serviceOn).getTime() - new Date(a.serviceOn).getTime())
    .slice(0, 300);
  res.json({ counts: await shapeAll(rows, c, me), canWrite: canWrite(me, systemId, c.data) });
});

collectionsRouter.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z
    .object({
      unitId: z.string().min(1), serviceOn: z.string(), label: z.string().trim().min(1).max(80), kind: z.enum(KINDS).default('OFFERING'),
      amount: z.number(), counterIds: z.array(z.string().min(1)).min(2).max(10), note: z.string().trim().max(NOTE_MAX).nullish(),
    })
    .safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Two or more counters, a service and an amount are needed');
  const b = parsed.data;
  if (amountProblem(b.amount)) return fail(res, 400, 'AMOUNT', 'Enter a whole amount in francs, above zero');
  if (!isDay(b.serviceOn)) return fail(res, 400, 'BAD_DATE', 'Enter the day of the service');
  const counters = [...new Set(b.counterIds)];
  if (counters.length < 2) return fail(res, 400, 'NEEDS_TWO_COUNTERS', 'An offering is counted by at least two different people');
  const c = await ctx(me);
  const unit = c.units.find((u) => u.id === b.unitId);
  if (!unit) return fail(res, 404, 'NOT_FOUND', 'Unit not found');
  if (!unit.systemId) return fail(res, 400, 'UNIT_HAS_NO_SYSTEM', 'This unit has no system yet');
  if (!canWrite(me, unit.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not record counts here');
  for (const id of counters) {
    const p = (await prisma.person.findUnique({ where: { id } })) as { status?: string } | null;
    if (!p || (p.status && p.status !== 'ACTIVE')) return fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose people who are active members');
  }
  const row = (await prisma.offeringCount.create({
    data: {
      orgUnitId: unit.id, systemId: unit.systemId, serviceOn: new Date(`${b.serviceOn}T00:00:00Z`), label: b.label, kind: b.kind, amount: b.amount,
      countersJson: JSON.stringify(counters), note: b.note || null, status: 'RECORDED', recordedById: me,
    },
  })) as Count;
  await audit(me, unit.systemId, 'COUNT_RECORDED', `Recorded the count for ${b.label}`, { countId: row.id });
  res.status(201).json({ id: row.id });
});

async function countFor(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const c = await ctx(me);
  const r = (await prisma.offeringCount.findUnique({ where: { id: String(req.params.id) } })) as Count | null;
  if (!r || !canRead(me, r.systemId, c.data)) {
    fail(res, 404, 'NOT_FOUND', 'Count not found');
    return null;
  }
  return { me, c, r };
}

collectionsRouter.post('/:id/confirm', requireAuth, async (req: AuthedRequest, res) => {
  const got = await countFor(req, res);
  if (!got) return;
  const { me, c, r } = got;
  if (r.status !== 'RECORDED') return fail(res, 409, 'WRONG_STATE', 'This count is not waiting for confirmation');
  if (r.recordedById === me || countersOf(r).includes(me)) return fail(res, 403, 'OWN_ENTRY', 'Someone who did not count it confirms it');
  if (!canConfirm(me, r.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not confirm counts here');
  await prisma.offeringCount.update({ where: { id: r.id }, data: { status: 'CONFIRMED', confirmedById: me, confirmedAt: new Date() } });
  await audit(me, r.systemId, 'COUNT_CONFIRMED', `Confirmed the count for ${r.label}`, { countId: r.id });
  res.json({ ok: true });
});

collectionsRouter.post('/:id/void', requireAuth, async (req: AuthedRequest, res) => {
  const got = await countFor(req, res);
  if (!got) return;
  const { me, c, r } = got;
  if (!canWrite(me, r.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not change counts here');
  if (r.status !== 'RECORDED') return fail(res, 409, 'WRONG_STATE', 'A confirmed count is final');
  const parsed = z.object({ reason: z.string().trim().min(1).max(NOTE_MAX) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'REASON_REQUIRED', 'Please give a reason');
  await prisma.offeringCount.update({ where: { id: r.id }, data: { status: 'VOIDED', voidReason: parsed.data.reason } });
  await audit(me, r.systemId, 'COUNT_VOIDED', `Voided the count for ${r.label}`, { countId: r.id, reason: parsed.data.reason });
  res.json({ ok: true });
});

/** Records who the money was handed to. The treasurer is told; nothing is created in Money. */
collectionsRouter.post('/:id/handover', requireAuth, async (req: AuthedRequest, res) => {
  const got = await countFor(req, res);
  if (!got) return;
  const { me, c, r } = got;
  if (!canWrite(me, r.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not change counts here');
  if (r.status !== 'CONFIRMED' || r.handedToId) return fail(res, 409, 'WRONG_STATE', 'Only a confirmed count is handed over, once');
  const parsed = z.object({ toPersonId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Choose who received it');
  const to = (await prisma.person.findUnique({ where: { id: parsed.data.toPersonId } })) as { status?: string } | null;
  if (!to || (to.status && to.status !== 'ACTIVE')) return fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose an active member');
  await prisma.offeringCount.update({ where: { id: r.id }, data: { handedToId: parsed.data.toPersonId, handedAt: new Date() } });
  await notifySafely(prisma as never, {
    kind: 'FOR_INFORMATION', toPersonId: parsed.data.toPersonId, systemId: r.systemId, title: `Offering handed to you: ${r.label}`,
    body: 'Record it in Money yourself. Counts and money are kept apart.', href: `/s/${r.systemId}/money`, sourceKey: `count-handover:${r.id}`,
  });
  await audit(me, r.systemId, 'COUNT_HANDED_OVER', `Handed over the count for ${r.label}`, { countId: r.id, to: parsed.data.toPersonId });
  res.json({ ok: true });
});
