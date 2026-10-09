/**
 * Music ministry (slice 3.12): choirs and their register, and the oversight summary.
 * The schedule itself (generate, confirm, publish) is in musicSchedule.ts. Nothing is deleted: a choir is retired, a member leaves.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { getPlanned } from '../music/store.js';
import { MUSIC, NAME_MAX, ROLES, canManageChoirs, canOversee, canReadChoir, canWriteChoir, isMonth } from '../music/rules.js';

export const musicRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const iso = (v: Date | string | null | undefined) => (v ? (v instanceof Date ? v : new Date(v)).toISOString() : null);
const dayOf = (v: Date | string | null | undefined) => iso(v)?.slice(0, 10) ?? '';

interface ChoirRow { id: string; name: string; role: string; systemId?: string | null; orgUnitId?: string | null; active: boolean }
interface MemberRow { id: string; choirId: string; personId: string; status: string; joinedOn?: Date | string | null }
interface PersonRow { id: string; fullName: string; status?: string; archivedAt?: Date | string | null }

const accessOf = async (me: string) => (await loadAccessData(me)).data;
async function audit(actorId: string, resource: 'PEOPLE' | 'SCHEDULING', action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({ data: { at: new Date(), actorId, systemId: MUSIC, action, resource, detail, metaJson: JSON.stringify(meta) } });
}
async function people(ids: string[]) {
  const out = new Map<string, PersonRow>();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return out;
  for (const p of (await prisma.person.findMany({ where: { id: { in: uniq } } })) as PersonRow[]) out.set(p.id, p);
  return out;
}
const activePerson = async (id: string) => {
  const p = (await prisma.person.findUnique({ where: { id } })) as PersonRow | null;
  return p && !p.archivedAt && (!p.status || p.status === 'ACTIVE') ? p : null;
};
const choirs = async () => (await prisma.musicChoir.findMany()) as ChoirRow[];
const membersOf = async () => ((await prisma.musicChoirMember.findMany()) as MemberRow[]).filter((m) => m.status === 'ACTIVE');

/* ───────────── Choirs and the register ───────────── */

musicRouter.get('/choirs', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  // Music (or no system named) holds the register of every choir; Choir and Worship see only their own choirs.
  const only = typeof req.query.systemId === 'string' && req.query.systemId !== MUSIC ? req.query.systemId : null;
  const all = (await choirs()).filter((c) => canReadChoir(me, c.systemId, data) && (!only || c.systemId === only));
  const members = await membersOf();
  res.json({
    canManage: canManageChoirs(me, data) && !only,
    choirs: all
      .map((c) => ({ id: c.id, name: c.name, role: c.role, active: c.active, members: members.filter((m) => m.choirId === c.id).length, canWrite: canWriteChoir(me, c.systemId, data) }))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)),
  });
});

musicRouter.post('/choirs', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z.object({ name: z.string().trim().min(1).max(NAME_MAX), role: z.enum(ROLES), systemId: z.enum(['sys-choir', 'sys-worship']).nullish() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the choir');
  const b = parsed.data;
  if (!canManageChoirs(me, await accessOf(me))) return fail(res, 403, 'FORBIDDEN', 'You may not change choirs');
  if ((await choirs()).some((c) => c.active && c.name.toLowerCase() === b.name.toLowerCase())) return fail(res, 409, 'ALREADY_EXISTS', 'A choir with this name exists');
  const row = (await prisma.musicChoir.create({
    data: { name: b.name, role: b.role, systemId: b.systemId ?? (b.role === 'WORSHIP' ? 'sys-worship' : 'sys-choir'), active: true, createdById: me },
  })) as ChoirRow;
  await audit(me, 'PEOPLE', 'CHOIR_ADDED', `Added choir “${b.name}”`, { choirId: row.id });
  res.status(201).json({ id: row.id });
});

musicRouter.post('/choirs/:id/active', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the request');
  if (!canManageChoirs(me, await accessOf(me))) return fail(res, 403, 'FORBIDDEN', 'You may not change choirs');
  const c = (await prisma.musicChoir.findUnique({ where: { id: String(req.params.id) } })) as ChoirRow | null;
  if (!c) return fail(res, 404, 'NOT_FOUND', 'Choir not found');
  await prisma.musicChoir.update({ where: { id: c.id }, data: { active: parsed.data.active } });
  await audit(me, 'PEOPLE', parsed.data.active ? 'CHOIR_RESTORED' : 'CHOIR_RETIRED', `${parsed.data.active ? 'Restored' : 'Retired'} choir “${c.name}”`, { choirId: c.id });
  res.json({ ok: true });
});

async function loadChoir(req: AuthedRequest, res: Res, write: boolean) {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  const c = (await prisma.musicChoir.findUnique({ where: { id: String(req.params.id) } })) as ChoirRow | null;
  if (!c || !canReadChoir(me, c.systemId, data)) {
    fail(res, 404, 'NOT_FOUND', 'Choir not found');
    return null;
  }
  if (write && !canWriteChoir(me, c.systemId, data)) {
    fail(res, 403, 'FORBIDDEN', 'You may not change this choir');
    return null;
  }
  return { me, c, data };
}

musicRouter.get('/choirs/:id', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadChoir(req, res, false);
  if (!got) return;
  const { me, c, data } = got;
  const mine = (await membersOf()).filter((m) => m.choirId === c.id);
  const who = await people(mine.map((m) => m.personId));
  res.json({
    choir: { id: c.id, name: c.name, role: c.role, active: c.active, canWrite: canWriteChoir(me, c.systemId, data) },
    members: mine.map((m) => ({ personId: m.personId, name: who.get(m.personId)?.fullName ?? '', joinedOn: m.joinedOn ? dayOf(m.joinedOn) : '' })).sort((a, b) => a.name.localeCompare(b.name)),
  });
});

musicRouter.post('/choirs/:id/members', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadChoir(req, res, true);
  if (!got) return;
  const parsed = z.object({ personId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Choose a person');
  if (!got.c.active) return fail(res, 409, 'WRONG_STATE', 'This choir is retired');
  if (!(await activePerson(parsed.data.personId))) return fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose an active member');
  if ((await membersOf()).some((m) => m.choirId === got.c.id && m.personId === parsed.data.personId)) return fail(res, 409, 'ALREADY_EXISTS', 'Already in this choir');
  await prisma.musicChoirMember.create({ data: { choirId: got.c.id, personId: parsed.data.personId, status: 'ACTIVE' } });
  await audit(got.me, 'PEOPLE', 'CHOIR_MEMBER_ADDED', `Added to choir “${got.c.name}”`, { choirId: got.c.id, personId: parsed.data.personId });
  res.status(201).json({ ok: true });
});

musicRouter.delete('/choirs/:id/members/:personId', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadChoir(req, res, true);
  if (!got) return;
  const row = (await membersOf()).find((m) => m.choirId === got.c.id && m.personId === String(req.params.personId));
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Not in this choir');
  await prisma.musicChoirMember.update({ where: { id: row.id }, data: { status: 'LEFT' } });
  await audit(got.me, 'PEOPLE', 'CHOIR_MEMBER_REMOVED', `Removed from choir “${got.c.name}”`, { choirId: got.c.id, personId: row.personId });
  res.json({ ok: true });
});

/* ───────────── Oversight ───────────── */

/** Which choirs serve this month and which are idle, read from the month Music has decided. */
musicRouter.get('/oversight', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  if (!canOversee(me, data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const month = typeof req.query.month === 'string' ? req.query.month : '';
  if (!isMonth(month)) return fail(res, 400, 'BAD_INPUT', 'Choose a month');
  const doc = await getPlanned(month);
  const services = doc?.services ?? [];
  const assigns = doc?.assignments ?? [];
  const members = await membersOf();
  const list = (await choirs()).filter((c) => c.active);
  res.json({
    month, planStatus: doc?.state ?? null,
    choirs: list
      .map((c) => {
        const served = services.filter((s) => assigns.some((a) => a.serviceId === s.id && a.unitId === c.id));
        const n = members.filter((m) => m.choirId === c.id).length;
        return { id: c.id, name: c.name, role: c.role, members: n, services: served.length, days: served.map((s) => s.date), noMembers: n === 0, notScheduled: !!doc && served.length === 0 };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    emptyServices: services.filter((s) => !assigns.some((a) => a.serviceId === s.id)).map((s) => ({ id: s.id, serviceOn: s.date, kind: s.kind })),
  });
});
