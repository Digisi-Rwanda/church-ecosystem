/**
 * Choir work (slice 3.13): rehearsals with attendance, the repertoire, and sponsors with pledges.
 * Pledges are a log kept apart from Money. Nothing is deleted: songs retire, sponsors end, pledges cancel.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { lettersInSystem } from '../capabilities/engine.js';
import { attendanceOf, presentOf } from '../groups/rules.js';
import { AMOUNT_MAX, isDay } from '../money/rules.js';
import { canReadChoir, canWriteChoir } from '../music/rules.js';

export const choirWorkRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const iso = (v: Date | string | null | undefined) => (v ? (v instanceof Date ? v : new Date(v)).toISOString() : null);
const dayOf = (v: Date | string | null | undefined) => iso(v)?.slice(0, 10) ?? '';
const todayIso = () => new Date().toISOString().slice(0, 10);
const toDate = (v: string) => new Date(`${v}T00:00:00Z`);
const SHOWN = 12;

interface ChoirRow { id: string; name: string; systemId?: string | null; active: boolean }
interface MemberRow { choirId: string; personId: string; status: string }
interface RehRow { id: string; choirId: string; heldOn: Date | string; presentJson?: string | null; note?: string | null }
interface SongRow { id: string; choirId: string; title: string; composer?: string | null; songKey?: string | null; lastSungOn?: Date | string | null; status: string }
interface SponsorRow { id: string; choirId: string; name: string; kind: string; contact?: string | null; status: string }
interface PledgeRow { id: string; sponsorId: string; amount: number; pledgedOn: Date | string; receivedOn?: Date | string | null; note?: string | null; status: string }
interface PersonRow { id: string; fullName: string; status?: string; archivedAt?: Date | string | null }

const accessOf = async (me: string) => (await loadAccessData(me)).data;
async function audit(actorId: string, systemId: string | null | undefined, resource: 'PEOPLE' | 'SCHEDULING' | 'MONEY', action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({ data: { at: new Date(), actorId, systemId: systemId ?? 'sys-choir', action, resource, detail, metaJson: JSON.stringify(meta) } });
}
async function people(ids: string[]) {
  const out = new Map<string, PersonRow>();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return out;
  for (const p of (await prisma.person.findMany({ where: { id: { in: uniq } } })) as PersonRow[]) out.set(p.id, p);
  return out;
}

/** A choir the person may open: its leaders (People letters) and, for the repertoire, anyone with Scheduling R in its system. */
async function openChoir(req: AuthedRequest, res: Res, kind: 'people' | 'write' | 'repertoire', id: unknown) {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  const choirId = typeof id === 'string' ? id : '';
  const c = choirId ? ((await prisma.musicChoir.findUnique({ where: { id: choirId } })) as ChoirRow | null) : null;
  const readsRepertoire = !!c?.systemId && (lettersInSystem(me, c.systemId, data, new Date()).SCHEDULING as string[]).includes('R');
  const mayRead = !!c && (canReadChoir(me, c.systemId, data) || (kind === 'repertoire' && readsRepertoire));
  if (!c || !mayRead) {
    fail(res, 404, 'NOT_FOUND', 'Choir not found');
    return null;
  }
  const canWrite = canWriteChoir(me, c.systemId, data);
  if (kind === 'write' && !canWrite) {
    fail(res, 403, 'FORBIDDEN', 'You may not change this choir');
    return null;
  }
  if (kind === 'write' && !c.active) {
    fail(res, 409, 'WRONG_STATE', 'This choir is retired');
    return null;
  }
  return { me, c, canWrite };
}

/** The choirs this person may open here: their leaders see them for everything, singers see them for the repertoire. */
choirWorkRouter.get('/choirs', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  const repertoire = req.query.for === 'repertoire';
  const only = typeof req.query.systemId === 'string' && req.query.systemId !== 'sys-music' ? req.query.systemId : null;
  const all = ((await prisma.musicChoir.findMany()) as ChoirRow[]).filter((c) => c.active && (!only || c.systemId === only));
  const mine = all.filter((c) => {
    if (canReadChoir(me, c.systemId, data)) return true;
    return repertoire && !!c.systemId && (lettersInSystem(me, c.systemId, data, new Date()).SCHEDULING as string[]).includes('R');
  });
  res.json({ choirs: mine.map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)) });
});

/* ───────────── Rehearsals ───────────── */

choirWorkRouter.get('/rehearsals', requireAuth, async (req: AuthedRequest, res) => {
  const got = await openChoir(req, res, 'people', req.query.choirId);
  if (!got) return;
  const sessions = ((await prisma.choirRehearsal.findMany()) as RehRow[]).filter((r) => r.choirId === got.c.id).sort((a, b) => +new Date(b.heldOn) - +new Date(a.heldOn));
  const recent = sessions.slice(0, SHOWN);
  const members = ((await prisma.musicChoirMember.findMany()) as MemberRow[]).filter((m) => m.choirId === got.c.id && m.status === 'ACTIVE');
  const who = await people([...members.map((m) => m.personId), ...recent.flatMap((s) => presentOf(s))]);
  const stats = attendanceOf(members.map((m) => m.personId), recent);
  res.json({
    canWrite: got.canWrite && got.c.active,
    members: members
      .map((m) => ({ personId: m.personId, name: who.get(m.personId)?.fullName ?? '', ...stats.get(m.personId)! }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    rehearsals: recent.map((s) => ({ id: s.id, heldOn: dayOf(s.heldOn), present: presentOf(s).length, note: s.note ?? '' })),
  });
});

choirWorkRouter.post('/rehearsals', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z.object({ choirId: z.string().min(1), heldOn: z.string(), presentIds: z.array(z.string().min(1)).max(300), note: z.string().trim().max(500).nullish() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the rehearsal');
  const b = parsed.data;
  if (!isDay(b.heldOn)) return fail(res, 400, 'BAD_DATE', 'Check the date');
  if (b.heldOn > todayIso()) return fail(res, 400, 'FUTURE_DATE', 'A rehearsal cannot be in the future');
  const got = await openChoir(req, res, 'write', b.choirId);
  if (!got) return;
  const members = new Set(((await prisma.musicChoirMember.findMany()) as MemberRow[]).filter((m) => m.choirId === got.c.id && m.status === 'ACTIVE').map((m) => m.personId));
  const present = [...new Set(b.presentIds)];
  if (present.some((id) => !members.has(id))) return fail(res, 400, 'NOT_A_MEMBER', 'Only singers of this choir can be marked present');
  if (((await prisma.choirRehearsal.findMany()) as RehRow[]).some((r) => r.choirId === got.c.id && dayOf(r.heldOn) === b.heldOn)) return fail(res, 409, 'ALREADY_EXISTS', 'This day is already recorded');
  const row = (await prisma.choirRehearsal.create({ data: { choirId: got.c.id, heldOn: toDate(b.heldOn), presentJson: JSON.stringify(present), note: b.note || null, recordedById: got.me } })) as RehRow;
  await audit(got.me, got.c.systemId, 'PEOPLE', 'REHEARSAL_RECORDED', `Recorded a rehearsal of “${got.c.name}”`, { choirId: got.c.id, rehearsalId: row.id });
  res.status(201).json({ id: row.id });
});

/* ───────────── Repertoire ───────────── */

choirWorkRouter.get('/songs', requireAuth, async (req: AuthedRequest, res) => {
  const got = await openChoir(req, res, 'repertoire', req.query.choirId);
  if (!got) return;
  const songs = ((await prisma.choirSong.findMany()) as SongRow[]).filter((s) => s.choirId === got.c.id && s.status === 'ACTIVE').sort((a, b) => a.title.localeCompare(b.title));
  res.json({
    canWrite: got.canWrite && got.c.active,
    songs: songs.map((s) => ({ id: s.id, title: s.title, composer: s.composer ?? '', songKey: s.songKey ?? '', lastSungOn: s.lastSungOn ? dayOf(s.lastSungOn) : null })),
  });
});

choirWorkRouter.post('/songs', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z.object({ choirId: z.string().min(1), title: z.string().trim().min(1).max(120), composer: z.string().trim().max(80).nullish(), songKey: z.string().trim().max(12).nullish() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the song');
  const b = parsed.data;
  const got = await openChoir(req, res, 'write', b.choirId);
  if (!got) return;
  if (((await prisma.choirSong.findMany()) as SongRow[]).some((s) => s.choirId === got.c.id && s.status === 'ACTIVE' && s.title.toLowerCase() === b.title.toLowerCase())) return fail(res, 409, 'ALREADY_EXISTS', 'This song is already in the repertoire');
  const row = (await prisma.choirSong.create({ data: { choirId: got.c.id, title: b.title, composer: b.composer || null, songKey: b.songKey || null, status: 'ACTIVE', createdById: got.me } })) as SongRow;
  await audit(got.me, got.c.systemId, 'SCHEDULING', 'SONG_ADDED', `Added “${b.title}” to “${got.c.name}”`, { choirId: got.c.id, songId: row.id });
  res.status(201).json({ id: row.id });
});

async function loadSong(req: AuthedRequest, res: Res) {
  const s = (await prisma.choirSong.findUnique({ where: { id: String(req.params.id) } })) as SongRow | null;
  if (!s) {
    fail(res, 404, 'NOT_FOUND', 'Song not found');
    return null;
  }
  const got = await openChoir(req, res, 'write', s.choirId);
  return got ? { ...got, s } : null;
}

choirWorkRouter.post('/songs/:id/sung', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadSong(req, res);
  if (!got) return;
  const parsed = z.object({ day: z.string() }).safeParse(req.body);
  if (!parsed.success || !isDay(parsed.data.day)) return fail(res, 400, 'BAD_DATE', 'Check the date');
  if (parsed.data.day > todayIso()) return fail(res, 400, 'FUTURE_DATE', 'The day cannot be in the future');
  await prisma.choirSong.update({ where: { id: got.s.id }, data: { lastSungOn: toDate(parsed.data.day) } });
  await audit(got.me, got.c.systemId, 'SCHEDULING', 'SONG_SUNG', `“${got.s.title}” sung on ${parsed.data.day}`, { songId: got.s.id });
  res.json({ ok: true });
});

choirWorkRouter.post('/songs/:id/retire', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadSong(req, res);
  if (!got) return;
  await prisma.choirSong.update({ where: { id: got.s.id }, data: { status: 'RETIRED' } });
  await audit(got.me, got.c.systemId, 'SCHEDULING', 'SONG_RETIRED', `Retired “${got.s.title}”`, { songId: got.s.id });
  res.json({ ok: true });
});

/* ───────────── Sponsorship ───────────── */

choirWorkRouter.get('/sponsors', requireAuth, async (req: AuthedRequest, res) => {
  const got = await openChoir(req, res, 'people', req.query.choirId);
  if (!got) return;
  const sponsors = ((await prisma.choirSponsor.findMany()) as SponsorRow[]).filter((s) => s.choirId === got.c.id && s.status === 'ACTIVE').sort((a, b) => a.name.localeCompare(b.name));
  const ids = new Set(sponsors.map((s) => s.id));
  const pledges = ((await prisma.sponsorPledge.findMany()) as PledgeRow[]).filter((p) => ids.has(p.sponsorId) && p.status !== 'CANCELLED');
  const sum = (list: PledgeRow[]) => list.reduce((n, p) => n + p.amount, 0);
  res.json({
    canWrite: got.canWrite && got.c.active,
    totals: { pledged: sum(pledges), received: sum(pledges.filter((p) => p.status === 'RECEIVED')) },
    sponsors: sponsors.map((s) => ({
      id: s.id, name: s.name, kind: s.kind, contact: s.contact ?? '',
      pledges: pledges.filter((p) => p.sponsorId === s.id).sort((a, b) => +new Date(b.pledgedOn) - +new Date(a.pledgedOn))
        .map((p) => ({ id: p.id, amount: p.amount, pledgedOn: dayOf(p.pledgedOn), receivedOn: p.receivedOn ? dayOf(p.receivedOn) : null, note: p.note ?? '', status: p.status })),
    })),
  });
});

choirWorkRouter.post('/sponsors', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z.object({ choirId: z.string().min(1), name: z.string().trim().min(1).max(80), kind: z.enum(['PERSON', 'ORGANISATION']).default('PERSON'), contact: z.string().trim().max(120).nullish() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the sponsor');
  const b = parsed.data;
  const got = await openChoir(req, res, 'write', b.choirId);
  if (!got) return;
  const row = (await prisma.choirSponsor.create({ data: { choirId: got.c.id, name: b.name, kind: b.kind, contact: b.contact || null, status: 'ACTIVE', createdById: got.me } })) as SponsorRow;
  await audit(got.me, got.c.systemId, 'PEOPLE', 'SPONSOR_ADDED', `Added sponsor “${b.name}” to “${got.c.name}”`, { choirId: got.c.id, sponsorId: row.id });
  res.status(201).json({ id: row.id });
});

async function loadSponsor(req: AuthedRequest, res: Res) {
  const s = (await prisma.choirSponsor.findUnique({ where: { id: String(req.params.id) } })) as SponsorRow | null;
  if (!s) {
    fail(res, 404, 'NOT_FOUND', 'Sponsor not found');
    return null;
  }
  const got = await openChoir(req, res, 'write', s.choirId);
  return got ? { ...got, s } : null;
}

choirWorkRouter.post('/sponsors/:id/end', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadSponsor(req, res);
  if (!got) return;
  await prisma.choirSponsor.update({ where: { id: got.s.id }, data: { status: 'ENDED' } });
  await audit(got.me, got.c.systemId, 'PEOPLE', 'SPONSOR_ENDED', `Ended sponsor “${got.s.name}”`, { sponsorId: got.s.id });
  res.json({ ok: true });
});

choirWorkRouter.post('/sponsors/:id/pledges', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadSponsor(req, res);
  if (!got) return;
  const parsed = z.object({ amount: z.number().int(), pledgedOn: z.string(), note: z.string().trim().max(300).nullish() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the pledge');
  const b = parsed.data;
  if (b.amount < 1 || b.amount > AMOUNT_MAX) return fail(res, 400, 'AMOUNT', 'Check the amount');
  if (!isDay(b.pledgedOn) || b.pledgedOn > todayIso()) return fail(res, 400, 'BAD_DATE', 'Check the date');
  if (got.s.status !== 'ACTIVE') return fail(res, 409, 'WRONG_STATE', 'This sponsor has ended');
  const row = (await prisma.sponsorPledge.create({ data: { sponsorId: got.s.id, amount: b.amount, pledgedOn: toDate(b.pledgedOn), note: b.note || null, status: 'PLEDGED', recordedById: got.me } })) as PledgeRow;
  await audit(got.me, got.c.systemId, 'PEOPLE', 'PLEDGE_RECORDED', `Pledge from “${got.s.name}”`, { sponsorId: got.s.id, pledgeId: row.id, amount: b.amount });
  res.status(201).json({ id: row.id });
});

async function loadPledge(req: AuthedRequest, res: Res) {
  const p = (await prisma.sponsorPledge.findUnique({ where: { id: String(req.params.id) } })) as PledgeRow | null;
  const s = p ? ((await prisma.choirSponsor.findUnique({ where: { id: p.sponsorId } })) as SponsorRow | null) : null;
  if (!p || !s) {
    fail(res, 404, 'NOT_FOUND', 'Pledge not found');
    return null;
  }
  const got = await openChoir(req, res, 'write', s.choirId);
  return got ? { ...got, p, s } : null;
}

choirWorkRouter.post('/pledges/:id/received', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadPledge(req, res);
  if (!got) return;
  const parsed = z.object({ day: z.string() }).safeParse(req.body);
  if (!parsed.success || !isDay(parsed.data.day) || parsed.data.day > todayIso()) return fail(res, 400, 'BAD_DATE', 'Check the date');
  if (got.p.status !== 'PLEDGED') return fail(res, 409, 'WRONG_STATE', 'Already settled');
  await prisma.sponsorPledge.update({ where: { id: got.p.id }, data: { status: 'RECEIVED', receivedOn: toDate(parsed.data.day) } });
  await audit(got.me, got.c.systemId, 'PEOPLE', 'PLEDGE_RECEIVED', `Received a pledge from “${got.s.name}”`, { pledgeId: got.p.id });
  res.json({ ok: true });
});

choirWorkRouter.post('/pledges/:id/cancel', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadPledge(req, res);
  if (!got) return;
  if (got.p.status !== 'PLEDGED') return fail(res, 409, 'WRONG_STATE', 'Already settled');
  await prisma.sponsorPledge.update({ where: { id: got.p.id }, data: { status: 'CANCELLED' } });
  await audit(got.me, got.c.systemId, 'PEOPLE', 'PLEDGE_CANCELLED', `Cancelled a pledge from “${got.s.name}”`, { pledgeId: got.p.id });
  res.json({ ok: true });
});
