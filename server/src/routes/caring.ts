/**
 * Caring ministries (slice 3.9): Couples pairs, the Elderly visit log and the Intercessors' prayer watches.
 * Nothing is deleted: a pair ends, a member leaves, a watch closes.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import {
  COUPLES, ELDERLY, INTERCESSORS, MEMBERS_MAX, NAME_MAX, NOTE_MAX, VISITORS_MAX, canReadCouples, canReadWatches, canUseVisits, canWriteCouples, canWriteWatches, watchTimesProblem,
} from '../caring/rules.js';

export const caringRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const iso = (v: Date | string | null | undefined) => (v ? (v instanceof Date ? v : new Date(v)).toISOString() : null);
const dayOf = (v: Date | string | null | undefined) => iso(v)?.slice(0, 10) ?? '';
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());
const todayIso = () => new Date().toISOString().slice(0, 10);

interface PersonRow { id: string; fullName: string; status?: string; archivedAt?: Date | string | null }
interface PairRow { id: string; systemId: string; personAId: string; personBId: string; marriedOn?: Date | string | null; status: string }
interface VisitRow { id: string; systemId: string; elderPersonId: string; visitedOn: Date | string; visitorsJson?: string | null; note?: string | null }
interface WatchRow { id: string; systemId: string; name: string; weekday: number; startTime: string; endTime: string; status: string }
interface WatchMemberRow { id: string; watchId: string; personId: string; status: string }

const accessOf = async (me: string) => (await loadAccessData(me)).data;
async function audit(actorId: string, systemId: string, resource: 'PEOPLE' | 'SCHEDULING', action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({ data: { at: new Date(), actorId, systemId, action, resource, detail, metaJson: JSON.stringify(meta) } });
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
const idsOf = (json: string | null | undefined): string[] => {
  try {
    const v = JSON.parse(json ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

/* ───────────── Couples ───────────── */

caringRouter.get('/couples', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  if (!canReadCouples(me, data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const pairs = ((await prisma.couplePair.findMany()) as PairRow[]).filter((p) => p.systemId === COUPLES && p.status === 'ACTIVE');
  const who = await people(pairs.flatMap((p) => [p.personAId, p.personBId]));
  res.json({
    canWrite: canWriteCouples(me, data),
    pairs: pairs
      .map((p) => ({ id: p.id, aId: p.personAId, aName: who.get(p.personAId)?.fullName ?? '', bId: p.personBId, bName: who.get(p.personBId)?.fullName ?? '', marriedOn: p.marriedOn ? dayOf(p.marriedOn) : null }))
      .sort((a, b) => a.aName.localeCompare(b.aName)),
  });
});

caringRouter.post('/couples', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z.object({ aId: z.string().min(1), bId: z.string().min(1), marriedOn: z.string().nullish() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Choose two people');
  const b = parsed.data;
  if (b.aId === b.bId) return fail(res, 400, 'SAME_PERSON', 'Choose two different people');
  if (b.marriedOn && (!isDay(b.marriedOn) || b.marriedOn > todayIso())) return fail(res, 400, 'BAD_DATE', 'Check the date');
  if (!canWriteCouples(me, await accessOf(me))) return fail(res, 403, 'FORBIDDEN', 'You may not change couples here');
  if (!(await activePerson(b.aId)) || !(await activePerson(b.bId))) return fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose active members');
  const live = ((await prisma.couplePair.findMany()) as PairRow[]).filter((p) => p.systemId === COUPLES && p.status === 'ACTIVE');
  if (live.some((p) => [p.personAId, p.personBId].some((x) => x === b.aId || x === b.bId))) return fail(res, 409, 'ALREADY_EXISTS', 'One of them is already in a couple');
  const row = (await prisma.couplePair.create({
    data: { systemId: COUPLES, personAId: b.aId, personBId: b.bId, marriedOn: b.marriedOn ? new Date(`${b.marriedOn}T00:00:00Z`) : null, status: 'ACTIVE', createdById: me },
  })) as PairRow;
  await audit(me, COUPLES, 'PEOPLE', 'COUPLE_ADDED', 'Added a couple', { pairId: row.id });
  res.status(201).json({ id: row.id });
});

caringRouter.post('/couples/:id/end', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  const pair = (await prisma.couplePair.findUnique({ where: { id: String(req.params.id) } })) as PairRow | null;
  if (!pair || !canReadCouples(me, data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!canWriteCouples(me, data)) return fail(res, 403, 'FORBIDDEN', 'You may not change couples here');
  if (pair.status !== 'ACTIVE') return fail(res, 409, 'WRONG_STATE', 'Already removed');
  await prisma.couplePair.update({ where: { id: pair.id }, data: { status: 'ENDED' } });
  await audit(me, COUPLES, 'PEOPLE', 'COUPLE_REMOVED', 'Removed a couple from the list', { pairId: pair.id });
  res.json({ ok: true });
});

/* ───────────── Elderly visits ───────────── */

caringRouter.get('/visits', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  if (!canUseVisits(me, await accessOf(me))) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const elderId = typeof req.query.elderId === 'string' ? req.query.elderId : '';
  const rows = ((await prisma.visitLog.findMany()) as VisitRow[])
    .filter((v) => v.systemId === ELDERLY && (!elderId || v.elderPersonId === elderId))
    .sort((a, b) => +new Date(b.visitedOn) - +new Date(a.visitedOn))
    .slice(0, 100);
  const who = await people(rows.flatMap((v) => [v.elderPersonId, ...idsOf(v.visitorsJson)]));
  res.json({
    canWrite: true,
    visits: rows.map((v) => ({
      id: v.id, elderId: v.elderPersonId, elderName: who.get(v.elderPersonId)?.fullName ?? '', visitedOn: dayOf(v.visitedOn),
      visitorNames: idsOf(v.visitorsJson).map((id) => who.get(id)?.fullName ?? '').filter(Boolean), note: v.note ?? '',
    })),
  });
});

caringRouter.post('/visits', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z
    .object({ elderId: z.string().min(1), visitedOn: z.string(), visitorIds: z.array(z.string().min(1)).max(VISITORS_MAX).default([]), note: z.string().trim().max(NOTE_MAX).nullish() })
    .safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the visit');
  const b = parsed.data;
  if (!isDay(b.visitedOn)) return fail(res, 400, 'BAD_DATE', 'Check the date');
  if (b.visitedOn > todayIso()) return fail(res, 400, 'FUTURE_DATE', 'A visit cannot be in the future');
  if (!canUseVisits(me, await accessOf(me))) return fail(res, 403, 'FORBIDDEN', 'You may not record visits here');
  if (!(await activePerson(b.elderId))) return fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose an active member');
  const visitors = [...new Set(b.visitorIds)];
  for (const id of visitors) if (!(await activePerson(id))) return fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose active members');
  const row = (await prisma.visitLog.create({
    data: { systemId: ELDERLY, elderPersonId: b.elderId, visitedOn: new Date(`${b.visitedOn}T00:00:00Z`), visitorsJson: JSON.stringify(visitors), note: b.note || null, recordedById: me },
  })) as VisitRow;
  await audit(me, ELDERLY, 'PEOPLE', 'VISIT_RECORDED', 'Recorded a visit', { visitId: row.id, elderId: b.elderId });
  res.status(201).json({ id: row.id });
});

/* ───────────── Intercessors' prayer watches ───────────── */

const watchFields = {
  name: z.string().trim().min(1).max(NAME_MAX),
  weekday: z.number().int().min(0).max(6),
  startTime: z.string(),
  endTime: z.string(),
};

caringRouter.get('/watches', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  if (!canReadWatches(me, data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const watches = ((await prisma.prayerWatch.findMany()) as WatchRow[]).filter((w) => w.systemId === INTERCESSORS && w.status === 'ACTIVE');
  const members = ((await prisma.prayerWatchMember.findMany()) as WatchMemberRow[]).filter((m) => m.status === 'ACTIVE');
  const who = await people(members.map((m) => m.personId));
  res.json({
    canWrite: canWriteWatches(me, data),
    watches: watches
      .map((w) => ({
        id: w.id, name: w.name, weekday: w.weekday, startTime: w.startTime, endTime: w.endTime,
        members: members.filter((m) => m.watchId === w.id).map((m) => ({ personId: m.personId, name: who.get(m.personId)?.fullName ?? '' })).sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)),
  });
});

caringRouter.post('/watches', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z.object(watchFields).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the watch');
  const b = parsed.data;
  if (watchTimesProblem(b.startTime, b.endTime)) return fail(res, 400, 'BAD_TIMES', 'Check the times');
  if (!canWriteWatches(me, await accessOf(me))) return fail(res, 403, 'FORBIDDEN', 'You may not change watches here');
  const row = (await prisma.prayerWatch.create({ data: { systemId: INTERCESSORS, name: b.name, weekday: b.weekday, startTime: b.startTime, endTime: b.endTime, status: 'ACTIVE', createdById: me } })) as WatchRow;
  await audit(me, INTERCESSORS, 'SCHEDULING', 'WATCH_CREATED', `Created watch “${b.name}”`, { watchId: row.id });
  res.status(201).json({ id: row.id });
});

async function loadWatch(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  const w = (await prisma.prayerWatch.findUnique({ where: { id: String(req.params.id) } })) as WatchRow | null;
  if (!w || !canReadWatches(me, data)) {
    fail(res, 404, 'NOT_FOUND', 'Not found');
    return null;
  }
  if (!canWriteWatches(me, data)) {
    fail(res, 403, 'FORBIDDEN', 'You may not change watches here');
    return null;
  }
  if (w.status !== 'ACTIVE') {
    fail(res, 409, 'WRONG_STATE', 'This watch is closed');
    return null;
  }
  return { me, w };
}

caringRouter.post('/watches/:id/close', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadWatch(req, res);
  if (!got) return;
  await prisma.prayerWatch.update({ where: { id: got.w.id }, data: { status: 'CLOSED' } });
  await audit(got.me, INTERCESSORS, 'SCHEDULING', 'WATCH_CLOSED', `Closed watch “${got.w.name}”`, { watchId: got.w.id });
  res.json({ ok: true });
});

caringRouter.post('/watches/:id/members', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadWatch(req, res);
  if (!got) return;
  const parsed = z.object({ personId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Choose a person');
  if (!(await activePerson(parsed.data.personId))) return fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose an active member');
  const mine = ((await prisma.prayerWatchMember.findMany()) as WatchMemberRow[]).filter((m) => m.watchId === got.w.id && m.status === 'ACTIVE');
  if (mine.some((m) => m.personId === parsed.data.personId)) return fail(res, 409, 'ALREADY_EXISTS', 'Already on this watch');
  if (mine.length >= MEMBERS_MAX) return fail(res, 400, 'TOO_MANY', 'This watch is full');
  await prisma.prayerWatchMember.create({ data: { watchId: got.w.id, personId: parsed.data.personId, status: 'ACTIVE' } });
  await audit(got.me, INTERCESSORS, 'SCHEDULING', 'WATCH_MEMBER_ADDED', `Added to watch “${got.w.name}”`, { watchId: got.w.id, personId: parsed.data.personId });
  res.status(201).json({ ok: true });
});

caringRouter.delete('/watches/:id/members/:personId', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadWatch(req, res);
  if (!got) return;
  const row = ((await prisma.prayerWatchMember.findMany()) as WatchMemberRow[]).find((m) => m.watchId === got.w.id && m.personId === String(req.params.personId) && m.status === 'ACTIVE');
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Not on this watch');
  await prisma.prayerWatchMember.update({ where: { id: row.id }, data: { status: 'LEFT' } });
  await audit(got.me, INTERCESSORS, 'SCHEDULING', 'WATCH_MEMBER_REMOVED', `Removed from watch “${got.w.name}”`, { watchId: got.w.id, personId: row.personId });
  res.json({ ok: true });
});
