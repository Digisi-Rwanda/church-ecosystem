/**
 * Evangelism (slice 3.10): contacts with follow-up, and the Pulpit plan with guest preachers.
 * Nothing is deleted: a contact is closed, a guest is archived, a service is cancelled.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import {
  CONTACT_STATUSES, EVANGELISM, NAME_MAX, NOTE_MAX, PLAN_LOOKBACK_DAYS, SHORT_MAX, SLOT_STATUSES, canReadContacts, canReadGuests, canReadPlan, canWriteContacts, canWritePlan, isDay, phoneOk,
} from '../evangelism/rules.js';

export const evangelismRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const iso = (v: Date | string | null | undefined) => (v ? (v instanceof Date ? v : new Date(v)).toISOString() : null);
const dayOf = (v: Date | string | null | undefined) => iso(v)?.slice(0, 10) ?? '';
const toDate = (v: string) => new Date(`${v}T00:00:00Z`);
const todayIso = () => new Date().toISOString().slice(0, 10);

interface PersonRow { id: string; fullName: string; status?: string; archivedAt?: Date | string | null }
interface ContactRow { id: string; fullName: string; phone?: string | null; howMet?: string | null; metOn?: Date | string | null; assignedToId?: string | null; status: string; note?: string | null }
interface FollowRow { id: string; contactId: string; doneOn: Date | string; note: string; nextOn?: Date | string | null; recordedById: string }
interface GuestRow { id: string; name: string; church?: string | null; phone?: string | null; note?: string | null; status: string }
interface SlotRow { id: string; serviceOn: Date | string; preacherPersonId?: string | null; guestId?: string | null; theme?: string | null; bibleText?: string | null; status: string }

const accessOf = async (me: string) => (await loadAccessData(me)).data;
async function audit(actorId: string, resource: 'PEOPLE' | 'SCHEDULING', action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({ data: { at: new Date(), actorId, systemId: EVANGELISM, action, resource, detail, metaJson: JSON.stringify(meta) } });
}
async function people(ids: Array<string | null | undefined>) {
  const out = new Map<string, PersonRow>();
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (!uniq.length) return out;
  for (const p of (await prisma.person.findMany({ where: { id: { in: uniq } } })) as PersonRow[]) out.set(p.id, p);
  return out;
}
const activePerson = async (id: string) => {
  const p = (await prisma.person.findUnique({ where: { id } })) as PersonRow | null;
  return p && !p.archivedAt && (!p.status || p.status === 'ACTIVE') ? p : null;
};

/* ───────────── Contacts and follow-up ───────────── */

const contactFields = {
  fullName: z.string().trim().min(1).max(NAME_MAX),
  phone: z.string().trim().max(20).nullish(),
  howMet: z.string().trim().max(SHORT_MAX).nullish(),
  metOn: z.string().nullish(),
  assignedToId: z.string().min(1).nullish(),
  note: z.string().trim().max(NOTE_MAX).nullish(),
};

evangelismRouter.get('/contacts', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  if (!canReadContacts(me, data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const rows = ((await prisma.evangelismContact.findMany()) as ContactRow[]).filter((c) => !status || c.status === status);
  const follows = (await prisma.contactFollowUp.findMany()) as FollowRow[];
  const who = await people(rows.map((c) => c.assignedToId));
  const today = todayIso();
  res.json({
    canWrite: canWriteContacts(me, data),
    contacts: rows
      .map((c) => {
        const mine = follows.filter((f) => f.contactId === c.id).sort((a, b) => +new Date(b.doneOn) - +new Date(a.doneOn));
        const next = mine.find((f) => f.nextOn)?.nextOn;
        const nextOn = c.status === 'NEW' || c.status === 'FOLLOWING' ? (next ? dayOf(next) : null) : null;
        return {
          id: c.id, fullName: c.fullName, phone: c.phone ?? '', howMet: c.howMet ?? '', metOn: dayOf(c.metOn), status: c.status,
          assignedToId: c.assignedToId ?? null, assignedName: c.assignedToId ? who.get(c.assignedToId)?.fullName ?? '' : '',
          lastFollowUpOn: mine[0] ? dayOf(mine[0].doneOn) : null, nextOn, overdue: !!nextOn && nextOn < today,
        };
      })
      .sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.metOn.localeCompare(a.metOn)),
  });
});

evangelismRouter.post('/contacts', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z.object(contactFields).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the contact');
  const b = parsed.data;
  if (!phoneOk(b.phone)) return fail(res, 400, 'BAD_PHONE', 'Check the phone number');
  if (b.metOn && (!isDay(b.metOn) || b.metOn > todayIso())) return fail(res, 400, 'BAD_DATE', 'Check the date');
  if (!canWriteContacts(me, await accessOf(me))) return fail(res, 403, 'FORBIDDEN', 'You may not change contacts here');
  if (b.assignedToId && !(await activePerson(b.assignedToId))) return fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose an active member');
  const row = (await prisma.evangelismContact.create({
    data: { fullName: b.fullName, phone: b.phone || null, howMet: b.howMet || null, metOn: b.metOn ? toDate(b.metOn) : new Date(), assignedToId: b.assignedToId ?? null, status: 'NEW', note: b.note || null, createdById: me },
  })) as ContactRow;
  await audit(me, 'PEOPLE', 'CONTACT_ADDED', `Added contact “${b.fullName}”`, { contactId: row.id });
  res.status(201).json({ id: row.id });
});

async function loadContact(req: AuthedRequest, res: Res, write: boolean) {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  const c = (await prisma.evangelismContact.findUnique({ where: { id: String(req.params.id) } })) as ContactRow | null;
  if (!c || !canReadContacts(me, data)) {
    fail(res, 404, 'NOT_FOUND', 'Not found');
    return null;
  }
  if (write && !canWriteContacts(me, data)) {
    fail(res, 403, 'FORBIDDEN', 'You may not change contacts here');
    return null;
  }
  return { me, c, data };
}

evangelismRouter.get('/contacts/:id', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadContact(req, res, false);
  if (!got) return;
  const { me, c, data } = got;
  const follows = ((await prisma.contactFollowUp.findMany()) as FollowRow[]).filter((f) => f.contactId === c.id).sort((a, b) => +new Date(b.doneOn) - +new Date(a.doneOn));
  const who = await people([c.assignedToId, ...follows.map((f) => f.recordedById)]);
  res.json({
    contact: {
      id: c.id, fullName: c.fullName, phone: c.phone ?? '', howMet: c.howMet ?? '', metOn: dayOf(c.metOn), status: c.status, note: c.note ?? '',
      assignedToId: c.assignedToId ?? null, assignedName: c.assignedToId ? who.get(c.assignedToId)?.fullName ?? '' : '', canWrite: canWriteContacts(me, data),
    },
    followUps: follows.map((f) => ({ id: f.id, doneOn: dayOf(f.doneOn), note: f.note, nextOn: f.nextOn ? dayOf(f.nextOn) : null, byName: who.get(f.recordedById)?.fullName ?? '' })),
  });
});

evangelismRouter.post('/contacts/:id/followups', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadContact(req, res, true);
  if (!got) return;
  const parsed = z.object({ doneOn: z.string(), note: z.string().trim().min(1).max(NOTE_MAX), nextOn: z.string().nullish() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Write what happened');
  const b = parsed.data;
  if (!isDay(b.doneOn) || (b.nextOn && !isDay(b.nextOn))) return fail(res, 400, 'BAD_DATE', 'Check the date');
  if (b.doneOn > todayIso()) return fail(res, 400, 'FUTURE_DATE', 'A follow-up cannot be in the future');
  if (b.nextOn && b.nextOn < b.doneOn) return fail(res, 400, 'BAD_DATE', 'Check the date');
  if (got.c.status === 'JOINED' || got.c.status === 'CLOSED') return fail(res, 409, 'WRONG_STATE', 'This contact is closed');
  await prisma.contactFollowUp.create({ data: { contactId: got.c.id, doneOn: toDate(b.doneOn), note: b.note, nextOn: b.nextOn ? toDate(b.nextOn) : null, recordedById: got.me } });
  if (got.c.status === 'NEW') await prisma.evangelismContact.update({ where: { id: got.c.id }, data: { status: 'FOLLOWING' } });
  await audit(got.me, 'PEOPLE', 'CONTACT_FOLLOWED_UP', `Followed up “${got.c.fullName}”`, { contactId: got.c.id });
  res.status(201).json({ ok: true });
});

evangelismRouter.post('/contacts/:id/status', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadContact(req, res, true);
  if (!got) return;
  const parsed = z.object({ status: z.enum(CONTACT_STATUSES) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Choose a status');
  await prisma.evangelismContact.update({ where: { id: got.c.id }, data: { status: parsed.data.status } });
  await audit(got.me, 'PEOPLE', 'CONTACT_STATUS', `Marked “${got.c.fullName}” ${parsed.data.status}`, { contactId: got.c.id, status: parsed.data.status });
  res.json({ ok: true });
});

evangelismRouter.post('/contacts/:id/assign', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadContact(req, res, true);
  if (!got) return;
  const parsed = z.object({ personId: z.string().min(1).nullable() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Choose a person');
  if (parsed.data.personId && !(await activePerson(parsed.data.personId))) return fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose an active member');
  await prisma.evangelismContact.update({ where: { id: got.c.id }, data: { assignedToId: parsed.data.personId } });
  await audit(got.me, 'PEOPLE', 'CONTACT_ASSIGNED', `Assigned “${got.c.fullName}”`, { contactId: got.c.id, personId: parsed.data.personId });
  res.json({ ok: true });
});

/* ───────────── Pulpit plan and guest preachers ───────────── */

evangelismRouter.get('/pulpit/slots', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  if (!canReadPlan(me, data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const from = new Date(Date.now() - PLAN_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const rows = ((await prisma.pulpitSlot.findMany()) as SlotRow[]).filter((s) => dayOf(s.serviceOn) >= from).sort((a, b) => +new Date(a.serviceOn) - +new Date(b.serviceOn));
  const guests = new Map(((await prisma.guestPreacher.findMany()) as GuestRow[]).map((g) => [g.id, g]));
  const who = await people(rows.map((s) => s.preacherPersonId));
  res.json({
    canWrite: canWritePlan(me, data),
    canSeeGuests: canReadGuests(me, data),
    slots: rows.map((s) => ({
      id: s.id, serviceOn: dayOf(s.serviceOn), theme: s.theme ?? '', bibleText: s.bibleText ?? '', status: s.status,
      preacherId: s.preacherPersonId ?? null, guestId: s.guestId ?? null,
      preacherName: s.preacherPersonId ? who.get(s.preacherPersonId)?.fullName ?? '' : s.guestId ? guests.get(s.guestId)?.name ?? '' : '',
      isGuest: !!s.guestId,
    })),
  });
});

const slotFields = {
  personId: z.string().min(1).nullish(),
  guestId: z.string().min(1).nullish(),
  theme: z.string().trim().max(SHORT_MAX).nullish(),
  bibleText: z.string().trim().max(SHORT_MAX).nullish(),
};

async function checkPreacher(personId: string | null | undefined, guestId: string | null | undefined, res: Res) {
  if (personId && guestId) return void fail(res, 400, 'ONE_PREACHER', 'Choose a member or a guest, not both');
  if (personId && !(await activePerson(personId))) return void fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose an active member');
  if (guestId) {
    const g = (await prisma.guestPreacher.findUnique({ where: { id: guestId } })) as GuestRow | null;
    if (!g || g.status !== 'ACTIVE') return void fail(res, 404, 'NOT_FOUND', 'Guest not found');
  }
  return true;
}

evangelismRouter.post('/pulpit/slots', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z.object({ serviceOn: z.string(), ...slotFields }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the service');
  const b = parsed.data;
  if (!isDay(b.serviceOn)) return fail(res, 400, 'BAD_DATE', 'Check the date');
  if (!canWritePlan(me, await accessOf(me))) return fail(res, 403, 'FORBIDDEN', 'You may not change the pulpit plan');
  if (!(await checkPreacher(b.personId, b.guestId, res))) return;
  const clash = ((await prisma.pulpitSlot.findMany()) as SlotRow[]).some((s) => dayOf(s.serviceOn) === b.serviceOn && s.status !== 'CANCELLED');
  if (clash) return fail(res, 409, 'ALREADY_EXISTS', 'That day already has a service');
  const row = (await prisma.pulpitSlot.create({
    data: { serviceOn: toDate(b.serviceOn), preacherPersonId: b.personId ?? null, guestId: b.guestId ?? null, theme: b.theme || null, bibleText: b.bibleText || null, status: 'PLANNED', createdById: me },
  })) as SlotRow;
  await audit(me, 'SCHEDULING', 'PULPIT_PLANNED', `Planned the pulpit for ${b.serviceOn}`, { slotId: row.id });
  res.status(201).json({ id: row.id });
});

evangelismRouter.patch('/pulpit/slots/:id', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  const slot = (await prisma.pulpitSlot.findUnique({ where: { id: String(req.params.id) } })) as SlotRow | null;
  if (!slot || !canReadPlan(me, data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!canWritePlan(me, data)) return fail(res, 403, 'FORBIDDEN', 'You may not change the pulpit plan');
  const parsed = z.object({ ...slotFields, status: z.enum(SLOT_STATUSES).optional() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the service');
  const b = parsed.data;
  if (!(await checkPreacher(b.personId, b.guestId, res))) return;
  const patch: Record<string, unknown> = {};
  if (b.personId !== undefined || b.guestId !== undefined) {
    patch.preacherPersonId = b.personId ?? null;
    patch.guestId = b.guestId ?? null;
  }
  if (b.theme !== undefined) patch.theme = b.theme || null;
  if (b.bibleText !== undefined) patch.bibleText = b.bibleText || null;
  if (b.status) patch.status = b.status;
  await prisma.pulpitSlot.update({ where: { id: slot.id }, data: patch });
  await audit(me, 'SCHEDULING', 'PULPIT_CHANGED', `Changed the pulpit for ${dayOf(slot.serviceOn)}`, { slotId: slot.id, ...(b.status ? { status: b.status } : {}) });
  res.json({ ok: true });
});

const guestFields = {
  name: z.string().trim().min(1).max(NAME_MAX),
  church: z.string().trim().max(SHORT_MAX).nullish(),
  phone: z.string().trim().max(20).nullish(),
  note: z.string().trim().max(NOTE_MAX).nullish(),
};

evangelismRouter.get('/pulpit/guests', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  if (!canReadGuests(me, data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const slots = (await prisma.pulpitSlot.findMany()) as SlotRow[];
  const guests = ((await prisma.guestPreacher.findMany()) as GuestRow[]).filter((g) => g.status === 'ACTIVE').sort((a, b) => a.name.localeCompare(b.name));
  res.json({
    canWrite: canWritePlan(me, data),
    guests: guests.map((g) => {
      const visits = slots.filter((s) => s.guestId === g.id && s.status !== 'CANCELLED').map((s) => dayOf(s.serviceOn)).sort();
      return { id: g.id, name: g.name, church: g.church ?? '', phone: g.phone ?? '', note: g.note ?? '', visits: visits.length, lastVisitOn: visits.filter((d) => d <= todayIso()).pop() ?? null };
    }),
  });
});

evangelismRouter.post('/pulpit/guests', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z.object(guestFields).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the guest');
  const b = parsed.data;
  if (!phoneOk(b.phone)) return fail(res, 400, 'BAD_PHONE', 'Check the phone number');
  if (!canWritePlan(me, await accessOf(me))) return fail(res, 403, 'FORBIDDEN', 'You may not change guests here');
  const row = (await prisma.guestPreacher.create({ data: { name: b.name, church: b.church || null, phone: b.phone || null, note: b.note || null, status: 'ACTIVE', createdById: me } })) as GuestRow;
  await audit(me, 'SCHEDULING', 'GUEST_ADDED', `Added guest preacher “${b.name}”`, { guestId: row.id });
  res.status(201).json({ id: row.id });
});

evangelismRouter.post('/pulpit/guests/:id/archive', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  const g = (await prisma.guestPreacher.findUnique({ where: { id: String(req.params.id) } })) as GuestRow | null;
  if (!g || !canReadGuests(me, data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!canWritePlan(me, data)) return fail(res, 403, 'FORBIDDEN', 'You may not change guests here');
  await prisma.guestPreacher.update({ where: { id: g.id }, data: { status: 'ARCHIVED' } });
  await audit(me, 'SCHEDULING', 'GUEST_ARCHIVED', `Archived guest preacher “${g.name}”`, { guestId: g.id });
  res.json({ ok: true });
});
