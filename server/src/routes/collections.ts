/**
 * Collections: what was given at each church service or event (tithe, offering, other givings).
 * The Church Treasurer records and corrects; the Church Leader reads. Nothing here touches Money or
 * activities on purpose: a collection is its own record, and the treasurer keeps the books elsewhere.
 * Nothing is deleted: a wrong entry is cancelled with a reason, a changed one leaves a trail in the audit.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { liveHoldings } from '../capabilities/engine.js';
import { AMOUNT_MAX, NOTE_MAX, isDay } from '../money/rules.js';

export const collectionsRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });

/** Tithes and offerings belong to Central Administration only. */
export const COLLECTIONS_SYSTEM = 'sys-main';
export const KINDS = ['SERVICE', 'EVENT'] as const;

interface Row {
  id: string; kind: string; title: string; heldOn: Date | string; startsAt?: string | null; tithe: number; offering: number; other: number;
  note?: string | null; status: string; voidReason?: string | null; recordedById: string; recordedAt: Date | string; updatedById?: string | null; updatedAt?: Date | string | null;
}

/** The treasurer writes; the treasurer and the Church Leader read. Nobody else sees collections, and a lent letter never opens them. */
export async function collectionRights(me: string): Promise<{ read: boolean; write: boolean }> {
  const { data } = await loadAccessData(me);
  const offices = new Set(liveHoldings(me, data, new Date()).filter((h) => h.scope === 'CHURCH' && h.via === 'OFFICE').map((h) => h.office as string));
  const write = offices.has('CHURCH_TREASURER');
  return { write, read: write || offices.has('CHURCH_LEADER') };
}

const day = (v: Date | string) => (v instanceof Date ? v : new Date(v)).toISOString().slice(0, 10);
const total = (r: { tithe: number; offering: number; other: number }) => r.tithe + r.offering + r.other;

async function names(ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, string>();
  if (!uniq.length) return out;
  const rows = (await prisma.person.findMany({ where: { id: { in: uniq } } })) as Array<{ id: string; fullName: string }>;
  for (const p of rows) out.set(p.id, p.fullName);
  return out;
}
async function audit(actorId: string, action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({ data: { at: new Date(), actorId, systemId: COLLECTIONS_SYSTEM, action, resource: 'GOVERNANCE', detail, metaJson: JSON.stringify(meta) } });
}

const amount = z.number().int().min(0).max(AMOUNT_MAX);
const body = z.object({
  kind: z.enum(KINDS).default('SERVICE'),
  title: z.string().trim().min(1).max(80),
  heldOn: z.string(),
  startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullish(),
  tithe: amount.default(0),
  offering: amount.default(0),
  other: amount.default(0),
  note: z.string().trim().max(NOTE_MAX).nullish(),
});

export function shape(rows: Row[], who: Map<string, string>) {
  return rows.map((r) => ({
    id: r.id, kind: r.kind, title: r.title, heldOn: day(r.heldOn), startsAt: r.startsAt ?? null, tithe: r.tithe, offering: r.offering, other: r.other, total: total(r),
    note: r.note ?? '', status: r.status, voidReason: r.voidReason ?? null, recordedByName: who.get(r.recordedById) ?? '',
  }));
}

/** The figures for a list of collections that count (cancelled ones are left out). */
export function figures(rows: Array<{ heldOn: string; tithe: number; offering: number; other: number; status: string }>) {
  const live = rows.filter((r) => r.status !== 'VOIDED');
  const sum = (k: 'tithe' | 'offering' | 'other') => live.reduce((a, r) => a + r[k], 0);
  const totals = { tithe: sum('tithe'), offering: sum('offering'), other: sum('other'), all: 0, count: live.length };
  totals.all = totals.tithe + totals.offering + totals.other;
  const months = new Map<string, { month: string; tithe: number; offering: number; other: number; total: number; count: number }>();
  for (const r of live) {
    const k = r.heldOn.slice(0, 7);
    const m = months.get(k) ?? { month: k, tithe: 0, offering: 0, other: 0, total: 0, count: 0 };
    m.tithe += r.tithe; m.offering += r.offering; m.other += r.other; m.total += total(r); m.count += 1;
    months.set(k, m);
  }
  return { totals, byMonth: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)) };
}

collectionsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const rights = await collectionRights(me);
  if (!rights.read) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const year = Number(req.query.year);
  const y = Number.isInteger(year) && year > 2000 && year < 2200 ? year : new Date().getUTCFullYear();
  const from = new Date(Date.UTC(y, 0, 1));
  const to = new Date(Date.UTC(y + 1, 0, 1));
  const rows = ((await prisma.serviceCollection.findMany()) as Row[])
    .filter((r) => new Date(r.heldOn) >= from && new Date(r.heldOn) < to)
    .sort((a, b) => new Date(b.heldOn).getTime() - new Date(a.heldOn).getTime() || (b.startsAt ?? '').localeCompare(a.startsAt ?? ''));
  const who = await names(rows.map((r) => r.recordedById));
  const items = shape(rows, who);
  const years = new Set<number>([new Date().getUTCFullYear(), y]);
  for (const r of (await prisma.serviceCollection.findMany()) as Row[]) years.add(new Date(r.heldOn).getUTCFullYear());
  res.json({ year: y, years: [...years].sort((a, b) => b - a), items, ...figures(items), canWrite: rights.write, limits: { noteMax: NOTE_MAX, amountMax: AMOUNT_MAX } });
});

function readBody(req: AuthedRequest, res: Res) {
  const parsed = body.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, 'BAD_INPUT', 'Give the service or event, the day and the amounts');
    return null;
  }
  const b = parsed.data;
  if (!isDay(b.heldOn)) {
    fail(res, 400, 'BAD_DATE', 'Enter the day of the service or event');
    return null;
  }
  if (b.tithe + b.offering + b.other <= 0) {
    fail(res, 400, 'AMOUNT', 'Enter at least one amount, in whole francs');
    return null;
  }
  return b;
}

collectionsRouter.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  if (!(await collectionRights(me)).write) return fail(res, 403, 'FORBIDDEN', 'Only the Church Treasurer records collections');
  const b = readBody(req, res);
  if (!b) return;
  const row = (await prisma.serviceCollection.create({
    data: {
      systemId: COLLECTIONS_SYSTEM, kind: b.kind, title: b.title, heldOn: new Date(`${b.heldOn}T00:00:00Z`), startsAt: b.startsAt ?? null,
      tithe: b.tithe, offering: b.offering, other: b.other, note: b.note || null, status: 'ACTIVE', recordedById: me,
    },
  })) as Row;
  await audit(me, 'COLLECTION_RECORDED', `Recorded the collection for ${b.title}`, { id: row.id, tithe: b.tithe, offering: b.offering, other: b.other });
  res.status(201).json({ id: row.id });
});

collectionsRouter.patch('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  if (!(await collectionRights(me)).write) return fail(res, 403, 'FORBIDDEN', 'Only the Church Treasurer changes collections');
  const r = (await prisma.serviceCollection.findUnique({ where: { id: String(req.params.id) } })) as Row | null;
  if (!r) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (r.status === 'VOIDED') return fail(res, 409, 'WRONG_STATE', 'A cancelled collection cannot be changed');
  const b = readBody(req, res);
  if (!b) return;
  await prisma.serviceCollection.update({
    where: { id: r.id },
    data: { kind: b.kind, title: b.title, heldOn: new Date(`${b.heldOn}T00:00:00Z`), startsAt: b.startsAt ?? null, tithe: b.tithe, offering: b.offering, other: b.other, note: b.note || null, updatedById: me },
  });
  await audit(me, 'COLLECTION_CHANGED', `Changed the collection for ${b.title}`, {
    id: r.id, before: { title: r.title, heldOn: day(r.heldOn), tithe: r.tithe, offering: r.offering, other: r.other }, after: { title: b.title, heldOn: b.heldOn, tithe: b.tithe, offering: b.offering, other: b.other },
  });
  res.json({ ok: true });
});

collectionsRouter.post('/:id/void', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  if (!(await collectionRights(me)).write) return fail(res, 403, 'FORBIDDEN', 'Only the Church Treasurer cancels collections');
  const r = (await prisma.serviceCollection.findUnique({ where: { id: String(req.params.id) } })) as Row | null;
  if (!r) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (r.status === 'VOIDED') return fail(res, 409, 'WRONG_STATE', 'Already cancelled');
  const parsed = z.object({ reason: z.string().trim().min(1).max(NOTE_MAX) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'REASON_REQUIRED', 'Please give a reason');
  await prisma.serviceCollection.update({ where: { id: r.id }, data: { status: 'VOIDED', voidReason: parsed.data.reason, updatedById: me } });
  await audit(me, 'COLLECTION_VOIDED', `Cancelled the collection for ${r.title}`, { id: r.id, reason: parsed.data.reason });
  res.json({ ok: true });
});
