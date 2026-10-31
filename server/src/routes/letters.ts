/**
 * Letters desk (slice 2.3): draft a letter, print it for the handwritten signature, record
 * its delivery. It replaces the browser-only Correspondence. Letter types come from Settings.
 * Every answer comes from the letters engine; the server decides, the screens only show.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import type { AccessData } from '../capabilities/engine.js';
import { loadSettings } from '../settings/store.js';
import { dayStart } from '../governance/rules.js';
import { BODY_MAX, DELIVERY_METHODS, SUBJECT_MAX, canRead, canSend, canWrite, deliveryProblem, letterReference } from '../letters/rules.js';

export const lettersRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const iso = (v: Date | string | null | undefined) => (v ? (v instanceof Date ? v : new Date(v)).toISOString() : null);

interface LetterRow {
  id: string; reference: string; orgUnitId: string; systemId: string; typeCode: string; subject: string; body: string;
  recipientName: string; recipientNote?: string | null; status: string; createdById: string; createdAt: Date | string;
  printedAt?: Date | string | null; printedById?: string | null; deliveredAt?: Date | string | null; deliveredById?: string | null;
  deliveryMethod?: string | null; deliveredOn?: Date | string | null; deliveryNote?: string | null; withdrawnReason?: string | null;
}
interface UnitRow { id: string; name: string; code?: string | null; kind?: string | null; systemId?: string | null }

async function names(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (!uniq.length) return out;
  const rows = (await prisma.person.findMany({ where: { id: { in: uniq } } })) as Array<{ id: string; fullName: string }>;
  for (const p of rows) out.set(p.id, p.fullName);
  return out;
}

async function audit(actorId: string, systemId: string, action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({
    data: { at: new Date(), actorId, systemId, action, resource: 'GOVERNANCE', detail, metaJson: JSON.stringify(meta) },
  });
}

async function context(me: string) {
  const { data, units } = await loadAccessData(me);
  return { data, units: units as UnitRow[], settings: await loadSettings() };
}
type Ctx = Awaited<ReturnType<typeof context>>;

const typeName = (ctx: Ctx, code: string) => ctx.settings['letters.types'].find((t) => t.code === code)?.name ?? code;

function shape(l: LetterRow, ctx: Ctx, me: string, who: Map<string, string>) {
  const draft = l.status === 'DRAFT';
  return {
    id: l.id,
    reference: l.reference,
    orgUnitId: l.orgUnitId,
    unitName: ctx.units.find((u) => u.id === l.orgUnitId)?.name ?? '',
    systemId: l.systemId,
    typeCode: l.typeCode,
    typeName: typeName(ctx, l.typeCode),
    subject: l.subject,
    recipientName: l.recipientName,
    status: l.status,
    createdAt: iso(l.createdAt),
    authorName: who.get(l.createdById) ?? '',
    printed: !!l.printedAt,
    deliveredOn: l.deliveredOn ? iso(l.deliveredOn)!.slice(0, 10) : null,
    canEdit: draft && l.createdById === me && canWrite(me, l.systemId, ctx.data),
    canSend: draft && canSend(me, l.systemId, ctx.data),
    canWithdraw: draft && (l.createdById === me || canSend(me, l.systemId, ctx.data)),
  };
}

lettersRouter.get('/options', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const ctx = await context(me);
  res.json({
    units: ctx.units
      .filter((u) => u.systemId && canWrite(me, u.systemId, ctx.data))
      .map((u) => ({ id: u.id, name: u.name, code: u.code ?? null, kind: u.kind ?? null, systemId: u.systemId! })),
    letterTypes: ctx.settings['letters.types'],
    deliveryMethods: DELIVERY_METHODS,
    limits: { subjectMax: SUBJECT_MAX, bodyMax: BODY_MAX },
  });
});

lettersRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const ctx = await context(me);
  const q = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : undefined);
  const text = (q('q') ?? '').trim().toLowerCase();
  const rows = ((await prisma.letter.findMany()) as LetterRow[])
    .filter((l) => canRead(me, l.systemId, ctx.data))
    .filter((l) => !q('systemId') || l.systemId === q('systemId'))
    .filter((l) => !q('unitId') || l.orgUnitId === q('unitId'))
    .filter((l) => !q('status') || l.status === q('status'))
    .filter((l) => !text || l.subject.toLowerCase().includes(text) || l.recipientName.toLowerCase().includes(text) || l.reference.toLowerCase().includes(text))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 300);
  const who = await names(rows.map((l) => l.createdById));
  res.json({ letters: rows.map((l) => shape(l, ctx, me, who)) });
});

async function readable(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const ctx = await context(me);
  const l = (await prisma.letter.findUnique({ where: { id: String(req.params.id) } })) as LetterRow | null;
  // A letter you may not read looks exactly like one that does not exist.
  if (!l || !canRead(me, l.systemId, ctx.data)) {
    fail(res, 404, 'NOT_FOUND', 'Letter not found');
    return null;
  }
  return { me, ctx, l };
}

lettersRouter.get('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const got = await readable(req, res);
  if (!got) return;
  const { me, ctx, l } = got;
  const who = await names([l.createdById, l.printedById, l.deliveredById]);
  res.json({
    letter: {
      ...shape(l, ctx, me, who),
      body: l.body,
      recipientNote: l.recipientNote ?? '',
      printedAt: iso(l.printedAt),
      printedByName: l.printedById ? (who.get(l.printedById) ?? '') : null,
      deliveredAt: iso(l.deliveredAt),
      deliveredByName: l.deliveredById ? (who.get(l.deliveredById) ?? '') : null,
      deliveryMethod: l.deliveryMethod ?? null,
      deliveryNote: l.deliveryNote ?? '',
      withdrawnReason: l.withdrawnReason ?? null,
    },
  });
});

const draftSchema = z.object({
  orgUnitId: z.string().min(1),
  typeCode: z.string().min(1),
  subject: z.string().trim().min(3).max(SUBJECT_MAX),
  body: z.string().trim().min(3).max(BODY_MAX),
  recipientName: z.string().trim().min(2).max(160),
  recipientNote: z.string().trim().max(300).optional(),
});

lettersRouter.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = draftSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_REQUEST', 'A letter needs a unit, a kind, a subject, a text and a recipient');
  const d = parsed.data;
  const me = req.auth!.personId;
  const ctx = await context(me);
  const unit = ctx.units.find((u) => u.id === d.orgUnitId);
  if (!unit) return fail(res, 404, 'UNIT_NOT_FOUND', 'Unit not found');
  if (!unit.systemId) return fail(res, 409, 'UNIT_HAS_NO_SYSTEM', 'This unit belongs to no system yet');
  if (!canWrite(me, unit.systemId, ctx.data)) return fail(res, 403, 'NOT_ALLOWED', 'You may not draft letters for this unit');
  const type = ctx.settings['letters.types'].find((t) => t.code === d.typeCode);
  if (!type) return fail(res, 400, 'BAD_TYPE', 'That kind of letter is not in Settings');
  const year = new Date().getUTCFullYear();
  const prefix = (ctx.settings['church.profile'].shortName || 'LTR').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6) || 'LTR';
  const sameYear = ((await prisma.letter.findMany()) as LetterRow[]).filter((l) => l.reference.startsWith(`${prefix}-${year}-`)).length;
  const row = (await prisma.letter.create({
    data: {
      reference: letterReference(prefix, year, sameYear + 1),
      orgUnitId: unit.id,
      systemId: unit.systemId,
      typeCode: type.code,
      subject: d.subject,
      body: d.body,
      recipientName: d.recipientName,
      recipientNote: d.recipientNote || null,
      status: 'DRAFT',
      createdById: me,
    },
  })) as LetterRow;
  await audit(me, unit.systemId, 'LETTER_DRAFTED', `Drafted ${row.reference}`, { letterId: row.id, typeCode: type.code });
  res.status(201).json({ letter: { id: row.id, reference: row.reference } });
});

const editSchema = draftSchema.omit({ orgUnitId: true, typeCode: true }).partial();

lettersRouter.patch('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = editSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_REQUEST', 'Check the subject, the text and the recipient');
  const got = await readable(req, res);
  if (!got) return;
  const { me, ctx, l } = got;
  if (l.status !== 'DRAFT') return fail(res, 409, 'NOT_DRAFT', 'Only a draft can be changed');
  if (l.createdById !== me || !canWrite(me, l.systemId, ctx.data)) return fail(res, 403, 'NOT_ALLOWED', 'Only the author may change a draft');
  // Changing the text after printing would make the printed copy differ from the record.
  if (l.printedAt) return fail(res, 409, 'ALREADY_PRINTED', 'This letter was printed; withdraw it and draft a new one to change it');
  await prisma.letter.update({ where: { id: l.id }, data: { ...parsed.data } });
  await audit(me, l.systemId, 'LETTER_EDITED', `Edited ${l.reference}`, { letterId: l.id });
  res.json({ ok: true });
});

/** The printable copy. Printing needs S and is recorded; it can be printed again until delivered. */
lettersRouter.post('/:id/print', requireAuth, async (req: AuthedRequest, res) => {
  const got = await readable(req, res);
  if (!got) return;
  const { me, ctx, l } = got;
  if (l.status !== 'DRAFT') return fail(res, 409, 'NOT_DRAFT', 'Only a draft is printed for signing');
  if (!canSend(me, l.systemId, ctx.data)) return fail(res, 403, 'NOT_ALLOWED', 'You may not send letters out');
  const first = !l.printedAt;
  if (first) {
    await prisma.letter.update({ where: { id: l.id }, data: { printedAt: new Date(), printedById: me } });
    await audit(me, l.systemId, 'LETTER_PRINTED', `Printed ${l.reference}`, { letterId: l.id });
  }
  const profile = ctx.settings['church.profile'];
  const unit = ctx.units.find((u) => u.id === l.orgUnitId);
  res.json({
    print: {
      reference: l.reference,
      church: profile,
      unitName: unit?.name ?? '',
      date: new Date().toISOString().slice(0, 10),
      typeName: typeName(ctx, l.typeCode),
      recipientName: l.recipientName,
      recipientNote: l.recipientNote ?? '',
      subject: l.subject,
      body: l.body,
    },
  });
});

const deliverSchema = z.object({
  method: z.string().min(1),
  deliveredOn: z.string().min(8),
  note: z.string().trim().max(300).optional(),
});

lettersRouter.post('/:id/deliver', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = deliverSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_REQUEST', 'Say how and on which day the letter was delivered');
  const got = await readable(req, res);
  if (!got) return;
  const { me, ctx, l } = got;
  if (l.status !== 'DRAFT') return fail(res, 409, 'NOT_DRAFT', 'This letter is already closed');
  if (!canSend(me, l.systemId, ctx.data)) return fail(res, 403, 'NOT_ALLOWED', 'You may not record delivery');
  if (!l.printedAt) return fail(res, 409, 'NOT_PRINTED', 'Print the letter for signing before recording its delivery');
  const problem = deliveryProblem({ method: parsed.data.method, deliveredOn: parsed.data.deliveredOn });
  if (problem) return fail(res, 400, problem === 'METHOD' ? 'BAD_METHOD' : 'BAD_DATES', problem === 'METHOD' ? 'Choose how it was delivered' : 'Give a real delivery day that is not in the future');
  await prisma.letter.update({
    where: { id: l.id },
    data: {
      status: 'DELIVERED',
      deliveredAt: new Date(),
      deliveredById: me,
      deliveryMethod: parsed.data.method,
      deliveredOn: dayStart(parsed.data.deliveredOn),
      deliveryNote: parsed.data.note || null,
    },
  });
  await audit(me, l.systemId, 'LETTER_DELIVERED', `Delivered ${l.reference}`, { letterId: l.id, method: parsed.data.method });
  res.json({ ok: true });
});

lettersRouter.post('/:id/withdraw', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z.object({ reason: z.string().trim().min(3).max(300) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_REQUEST', 'Say why the letter is withdrawn');
  const got = await readable(req, res);
  if (!got) return;
  const { me, ctx, l } = got;
  if (l.status !== 'DRAFT') return fail(res, 409, 'NOT_DRAFT', 'A delivered letter stays on record');
  if (l.createdById !== me && !canSend(me, l.systemId, ctx.data)) return fail(res, 403, 'NOT_ALLOWED', 'Only the author or someone who sends letters out may withdraw it');
  await prisma.letter.update({ where: { id: l.id }, data: { status: 'WITHDRAWN', withdrawnReason: parsed.data.reason } });
  await audit(me, l.systemId, 'LETTER_WITHDRAWN', `Withdrew ${l.reference}`, { letterId: l.id, reason: parsed.data.reason });
  res.json({ ok: true });
});

export type { AccessData };
