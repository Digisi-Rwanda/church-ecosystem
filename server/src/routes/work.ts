/**
 * Light work (slice 3.2): create, assign, update, finish and delete a piece of work inside one unit.
 * Visibility is enforced on every read. Delete is soft: it looks permanent to the person who does it,
 * and only an Administrator can see the deleted list and restore an item.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { liveHoldings } from '../capabilities/engine.js';
import { notifySafely } from '../lib/notify.js';
import {
  HELPERS_MAX, NOTE_MAX, STATUSES, TEXT_MAX, TITLE_MAX, VISIBILITIES, canDelete, canManage, canMove, canSee, canWriteIn,
  helpersOf, moveProblem, visibilityOf, type WorkRow,
} from '../work/rules.js';

export const workRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const iso = (v: Date | string | null | undefined) => (v ? (v instanceof Date ? v : new Date(v)).toISOString() : null);

interface Row extends WorkRow {
  title: string; description?: string | null; contextLabel?: string | null; dueDate?: Date | string | null;
  outcomeNote?: string | null; startDate?: Date | string | null; deletedById?: string | null;
}
interface UnitRow { id: string; name: string; systemId?: string | null }

async function names(ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, string>();
  if (!uniq.length) return out;
  const rows = (await prisma.person.findMany({ where: { id: { in: uniq } } })) as Array<{ id: string; fullName: string }>;
  for (const p of rows) out.set(p.id, p.fullName);
  return out;
}

async function audit(actorId: string, systemId: string, action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({
    data: { at: new Date(), actorId, systemId, action, resource: 'MISSION', detail, metaJson: JSON.stringify(meta) },
  });
}

async function ctx(me: string) {
  const { data, units } = await loadAccessData(me);
  return { data, units: units as UnitRow[] };
}
type Ctx = Awaited<ReturnType<typeof ctx>>;

const isAdministrator = (me: string, c: Ctx) => liveHoldings(me, c.data, new Date()).some((h) => h.via === 'OFFICE' && h.office === 'ADMINISTRATOR');

async function shapeAll(rows: Row[], c: Ctx, me: string) {
  const who = await names(rows.flatMap((r) => [r.ownerPersonId, ...helpersOf(r)]));
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    ownerId: r.ownerPersonId,
    ownerName: who.get(r.ownerPersonId) ?? '',
    helpers: helpersOf(r).map((id) => ({ id, name: who.get(id) ?? '' })),
    systemId: r.systemId ?? 'sys-main',
    orgUnitId: r.orgUnitId ?? null,
    unitName: c.units.find((u) => u.id === r.orgUnitId)?.name ?? '',
    status: r.status,
    visibility: visibilityOf(r.visibility),
    dueDate: iso(r.dueDate),
    overdue: !!r.dueDate && ['TODO', 'IN_PROGRESS'].includes(r.status) && new Date(r.dueDate).getTime() < now,
    outcomeNote: r.outcomeNote ?? null,
    contextLabel: r.contextLabel ?? null,
    mine: r.ownerPersonId === me || helpersOf(r).includes(me),
    canManage: canManage(r, me, c.data),
    canMove: canMove(r, me, c.data),
    canDelete: canDelete(r, me, c.data),
  }));
}

workRouter.get('/options', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const c = await ctx(me);
  res.json({
    units: c.units.filter((u) => u.systemId && canWriteIn(me, u.systemId, c.data)).map((u) => ({ id: u.id, name: u.name, systemId: u.systemId! })),
    visibilities: VISIBILITIES,
    limits: { titleMax: TITLE_MAX, textMax: TEXT_MAX, noteMax: NOTE_MAX, helpersMax: HELPERS_MAX },
  });
});

/** What an Administrator can bring back. Everyone else gets the same answer as for a page that does not exist. */
workRouter.get('/deleted', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const c = await ctx(me);
  if (!isAdministrator(me, c)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const rows = ((await prisma.workTask.findMany()) as Row[])
    .filter((r) => !!r.deletedAt)
    .sort((a, b) => new Date(b.deletedAt!).getTime() - new Date(a.deletedAt!).getTime())
    .slice(0, 200);
  const who = await names(rows.flatMap((r) => [r.ownerPersonId, r.deletedById ?? '']));
  res.json({
    items: rows.map((r) => ({
      id: r.id, title: r.title, status: r.status, systemId: r.systemId ?? 'sys-main',
      unitName: c.units.find((u) => u.id === r.orgUnitId)?.name ?? '',
      ownerName: who.get(r.ownerPersonId) ?? '', deletedAt: iso(r.deletedAt), deletedByName: who.get(r.deletedById ?? '') ?? '',
    })),
  });
});

workRouter.post('/:id/restore', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const c = await ctx(me);
  if (!isAdministrator(me, c)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const r = (await prisma.workTask.findUnique({ where: { id: String(req.params.id) } })) as Row | null;
  if (!r || !r.deletedAt) return fail(res, 404, 'NOT_FOUND', 'Not found');
  await prisma.workTask.update({ where: { id: r.id }, data: { deletedAt: null, deletedById: null } });
  await audit(me, r.systemId ?? 'sys-main', 'WORK_RESTORED', `Restored “${r.title}”`, { workId: r.id });
  res.json({ ok: true });
});

/** My work, or everything I may see in a system. */
workRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const c = await ctx(me);
  const q = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : '');
  const view = q('view') === 'all' ? 'all' : 'mine';
  const status = q('status') || 'open';
  const systemId = q('systemId');
  const text = q('q').trim().toLowerCase();
  const rows = ((await prisma.workTask.findMany()) as Row[])
    .filter((r) => canSee(r, me, c.data))
    .filter((r) => !systemId || (r.systemId ?? 'sys-main') === systemId)
    .filter((r) => view === 'all' || r.ownerPersonId === me || helpersOf(r).includes(me))
    .filter((r) => (status === 'open' ? ['TODO', 'IN_PROGRESS'].includes(r.status) : status === 'all' || r.status === status))
    .filter((r) => !text || r.title.toLowerCase().includes(text))
    .sort((a, b) => {
      const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return da - db;
    })
    .slice(0, 300);
  res.json({ items: await shapeAll(rows, c, me) });
});

async function visible(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const c = await ctx(me);
  const r = (await prisma.workTask.findUnique({ where: { id: String(req.params.id) } })) as Row | null;
  // Work you may not see looks exactly like work that does not exist.
  if (!r || !canSee(r, me, c.data)) {
    fail(res, 404, 'NOT_FOUND', 'Work not found');
    return null;
  }
  return { me, c, r };
}

workRouter.get('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  res.json({ work: (await shapeAll([got.r], got.c, got.me))[0] });
});

const fields = {
  title: z.string().trim().min(1).max(TITLE_MAX),
  description: z.string().trim().max(TEXT_MAX).nullish(),
  ownerId: z.string().min(1),
  helperIds: z.array(z.string().min(1)).max(HELPERS_MAX).default([]),
  dueDate: z.string().datetime().nullish(),
  visibility: z.enum(VISIBILITIES).default('UNIT'),
};

async function peopleProblem(ids: string[]): Promise<string | null> {
  for (const id of ids) {
    const p = (await prisma.person.findUnique({ where: { id } })) as { status?: string } | null;
    if (!p || (p.status && p.status !== 'ACTIVE')) return id;
  }
  return null;
}

async function tell(taskId: string, title: string, systemId: string, ids: string[], me: string, verb: string) {
  for (const id of ids.filter((x) => x !== me)) {
    await notifySafely(prisma as never, {
      kind: 'FOR_INFORMATION', toPersonId: id, systemId, title: `${verb}: ${title}`,
      href: `/s/${systemId}/work`, sourceKey: `work-assign:${taskId}:${id}`,
    });
  }
}

workRouter.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z.object({ ...fields, unitId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid work');
  const b = parsed.data;
  const c = await ctx(me);
  const unit = c.units.find((u) => u.id === b.unitId);
  if (!unit) return fail(res, 404, 'NOT_FOUND', 'Unit not found');
  if (!unit.systemId) return fail(res, 400, 'UNIT_HAS_NO_SYSTEM', 'This unit has no system yet');
  if (!canWriteIn(me, unit.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not create work here');
  const bad = await peopleProblem([b.ownerId, ...b.helperIds]);
  if (bad) return fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose people who are active members');
  const helpers = [...new Set(b.helperIds)].filter((id) => id !== b.ownerId);
  const row = (await prisma.workTask.create({
    data: {
      title: b.title, description: b.description || null, ownerPersonId: b.ownerId, helperPersonIds: JSON.stringify(helpers),
      createdByPersonId: me, contextType: 'LIGHT', systemId: unit.systemId, orgUnitId: unit.id, status: 'TODO',
      dueDate: b.dueDate ? new Date(b.dueDate) : null, startDate: new Date(), visibility: b.visibility,
    },
  })) as Row;
  await tell(row.id, row.title, unit.systemId, [b.ownerId, ...helpers], me, 'New work for you');
  await audit(me, unit.systemId, 'WORK_CREATED', `Created “${row.title}”`, { workId: row.id });
  res.status(201).json({ work: (await shapeAll([row], c, me))[0] });
});

workRouter.patch('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, r } = got;
  if (!canManage(r, me, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not change this work');
  if (r.status === 'DONE') return fail(res, 409, 'DONE_LOCKED', 'Finished work is part of the record. Reopen it first.');
  const parsed = z.object(fields).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid work');
  const b = parsed.data;
  const bad = await peopleProblem([b.ownerId, ...b.helperIds]);
  if (bad) return fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose people who are active members');
  const helpers = [...new Set(b.helperIds)].filter((id) => id !== b.ownerId);
  const before = [r.ownerPersonId, ...helpersOf(r)];
  const row = (await prisma.workTask.update({
    where: { id: r.id },
    data: {
      title: b.title, description: b.description || null, ownerPersonId: b.ownerId, helperPersonIds: JSON.stringify(helpers),
      dueDate: b.dueDate ? new Date(b.dueDate) : null, visibility: b.visibility,
    },
  })) as Row;
  const sid = r.systemId ?? 'sys-main';
  await tell(r.id, row.title, sid, [b.ownerId, ...helpers].filter((id) => !before.includes(id)), me, 'New work for you');
  await audit(me, sid, 'WORK_EDITED', `Edited “${row.title}”`, { workId: r.id });
  res.json({ work: (await shapeAll([row], c, me))[0] });
});

workRouter.post('/:id/status', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, r } = got;
  const parsed = z.object({ status: z.enum(STATUSES), note: z.string().trim().max(NOTE_MAX).nullish() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid status');
  const to = parsed.data.status;
  const reopen = r.status === 'DONE' || r.status === 'CANCELLED';
  if (!(reopen ? canManage(r, me, c.data) : canMove(r, me, c.data))) return fail(res, 403, 'FORBIDDEN', 'You may not move this work');
  const problem = moveProblem(r.status, to, parsed.data.note ?? null);
  if (problem) return fail(res, 409, problem, problem === 'NOTE_REQUIRED' ? 'Write the outcome first' : 'Not possible from this status');
  const closing = to === 'DONE' || to === 'CANCELLED';
  const row = (await prisma.workTask.update({
    where: { id: r.id },
    data: { status: to, outcomeNote: closing ? parsed.data.note!.trim() : null, endDate: closing ? new Date() : null },
  })) as Row;
  await audit(me, r.systemId ?? 'sys-main', 'WORK_MOVED', `“${r.title}”: ${r.status} → ${to}`, { workId: r.id, from: r.status, to });
  res.json({ work: (await shapeAll([row], c, me))[0] });
});

/** To the person it looks permanent: the item disappears. The row stays, marked deleted, for an Administrator. */
workRouter.delete('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const got = await visible(req, res);
  if (!got) return;
  const { me, c, r } = got;
  if (!canManage(r, me, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not delete this work');
  if (r.status === 'DONE') return fail(res, 409, 'DONE_LOCKED', 'Finished work is part of the record and cannot be deleted');
  await prisma.workTask.update({ where: { id: r.id }, data: { deletedAt: new Date(), deletedById: me } });
  await audit(me, r.systemId ?? 'sys-main', 'WORK_DELETED', `Deleted “${r.title}”`, { workId: r.id });
  res.json({ ok: true });
});
