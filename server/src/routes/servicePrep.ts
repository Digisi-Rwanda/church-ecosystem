/**
 * Service preparation: for each service, the pulpit (edited here), the choir and the Protocol team (read from
 * the Music and Protocol schedules). Pulpit roles are defined by the church; nothing is built in except one
 * starting role, "Preacher", which can be renamed. Entries are never deleted: a cancelled entry stays on record.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { buildMusicCalendar } from '../music/engine.js';
import { loadChoirs, loadMonthRows } from '../music/store.js';
import { parse } from '../music/schedule.js';
import type { MusicAssignment, MusicServiceSlot } from '../music/types.js';
import { loadMusicConfig } from '../scheduling/configLoader.js';
import { MAX_ITEMS, OWNER_KINDS, TIME_RE, TITLE_MAX, chain, endTimeOf, ownerProblem, runWarnings, type OwnerKind } from '../servicePrep/runSheet.js';
import {
  CHURCH, DEFAULT_ROLE, ENTRY_STATUSES, NAME_MAX, SHORT_MAX, canRead, canWrite, codeKey, isDay, isLeader, monthOf, whoProblem,
} from '../servicePrep/rules.js';

export const servicePrepRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (day: string, n: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const PROTOCOL_PREFIX = 'psvc-'; // the Protocol team's service ids are the Music service id with this prefix

interface RoleRow { id: string; code: string; name: string; displayOrder: number; active: boolean }
interface EntryRow {
  id: string; serviceDate: string; serviceCode: string | null; roleId: string; personId: string | null; guestId: string | null; guestName: string | null;
  theme: string | null; bibleText: string | null; status: string;
}
interface PersonRow { id: string; fullName: string; status?: string; archivedAt?: Date | string | null }
interface GuestRow { id: string; name: string; status: string }

async function audit(actorId: string, action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({ data: { at: new Date(), actorId, systemId: CHURCH, action, resource: 'SCHEDULING', detail, metaJson: JSON.stringify(meta) } });
}

/** The church always has at least the starting role; it is created the first time anyone looks. */
async function roles(): Promise<RoleRow[]> {
  let rows = (await prisma.servicePulpitRole.findMany()) as RoleRow[];
  if (rows.length === 0) {
    await prisma.servicePulpitRole.create({ data: { ...DEFAULT_ROLE, displayOrder: 0, active: true } });
    rows = (await prisma.servicePulpitRole.findMany()) as RoleRow[];
  }
  return rows.sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
}
const editorSet = async () => new Set(((await prisma.servicePrepEditor.findMany()) as Array<{ personId: string }>).map((e) => e.personId));

async function who(me: string) {
  const data = (await loadAccessData(me)).data;
  const editors = await editorSet();
  return { me, data, editors, write: canWrite(me, data, editors), read: canRead(me, data, editors), leader: isLeader(me, data) };
}

async function nameMaps(personIds: Array<string | null | undefined>, guestIds: Array<string | null | undefined>) {
  const people = new Map<string, string>();
  const ids = [...new Set(personIds.filter((x): x is string => !!x))];
  if (ids.length) for (const p of (await prisma.person.findMany({ where: { id: { in: ids } } })) as PersonRow[]) people.set(p.id, p.fullName);
  const guests = new Map<string, string>();
  const gids = [...new Set(guestIds.filter((x): x is string => !!x))];
  if (gids.length) for (const g of (await prisma.guestPreacher.findMany({ where: { id: { in: gids } } })) as GuestRow[]) guests.set(g.id, g.name);
  return { people, guests };
}

const monthsBetween = (from: string, to: string): string[] => {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  const last = to.slice(0, 7);
  while (`${y}-${String(m).padStart(2, '0')}` <= last && out.length < 6) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
};

interface MonthServices { month: string; musicState: 'CONFIRMED' | 'PUBLISHED' | null; services: MusicServiceSlot[]; assignments: MusicAssignment[] }

/** The services of a month: from the confirmed or published Music month when there is one, else from the live calendar. */
async function monthServices(month: string, rows: Awaited<ReturnType<typeof loadMonthRows>>, liveServices: Awaited<ReturnType<typeof loadMusicConfig>>['services']): Promise<MonthServices> {
  const row = rows.find((r) => r.periodKey === month);
  if (row) {
    return {
      month, musicState: row.state === 'PUBLISHED' ? 'PUBLISHED' : 'CONFIRMED',
      services: parse<MusicServiceSlot[]>(row.servicesJson, []), assignments: parse<MusicAssignment[]>(row.assignmentsJson, []),
    };
  }
  let services: MusicServiceSlot[] = [];
  try { services = buildMusicCalendar(month, 'MONTH', liveServices); } catch { services = []; }
  return { month, musicState: null, services, assignments: [] };
}

/** What the Protocol team looks like for one month: nothing yet, in progress, or published (names shown only then). */
async function protocolMonth(month: string) {
  const plan = ((await prisma.protocolPlan.findMany()) as Array<{ monthKey: string; status: string }>).find((p) => p.monthKey === month);
  if (!plan) return { state: 'NONE' as const, slots: [] as Array<{ serviceId: string; personId: string; role: string }> };
  if (plan.status !== 'PUBLISHED') return { state: 'IN_PROGRESS' as const, slots: [] };
  const slots = ((await prisma.protocolSlot.findMany()) as Array<{ monthKey: string; serviceId: string; personId: string; role: string }>).filter((s) => s.monthKey === month);
  return { state: 'PUBLISHED' as const, slots };
}

const entryOn = (e: EntryRow, date: string, code: string) => e.serviceDate === date && (e.serviceCode === null || codeKey(e.serviceCode) === code);

/* ───────────── What the page needs to start ───────────── */

servicePrepRouter.get('/state', requireAuth, async (req: AuthedRequest, res) => {
  const w = await who(req.auth!.personId);
  if (!w.read) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const editorIds = w.leader ? [...w.editors] : [];
  const nm = await nameMaps(editorIds, []);
  res.json({
    canWrite: w.write, isLeader: w.leader, roles: await roles(),
    editors: editorIds.map((id) => ({ personId: id, name: nm.people.get(id) ?? id })),
  });
});

/* ───────────── Upcoming services ───────────── */

servicePrepRouter.get('/services', requireAuth, async (req: AuthedRequest, res) => {
  const w = await who(req.auth!.personId);
  if (!w.read) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const from = typeof req.query.from === 'string' && isDay(req.query.from) ? req.query.from : todayIso();
  const to = typeof req.query.to === 'string' && isDay(req.query.to) ? req.query.to : addDays(from, 60);
  if (to < from || addDays(from, 186) < to) return fail(res, 400, 'BAD_RANGE', 'Choose a range of up to six months');
  const [rows, cfg, roleRows, entries] = await Promise.all([
    loadMonthRows(), loadMusicConfig(), roles(),
    prisma.servicePulpitEntry.findMany({ where: { serviceDate: { gte: from, lte: to } } }) as Promise<EntryRow[]>,
  ]);
  const activeRoles = roleRows.filter((r) => r.active);
  const out: unknown[] = [];
  for (const month of monthsBetween(from, to)) {
    const m = await monthServices(month, rows, cfg.services);
    const proto = await protocolMonth(month);
    for (const s of m.services.filter((x) => x.date >= from && x.date <= to).sort((a, b) => a.date.localeCompare(b.date) || String(a.time ?? '').localeCompare(String(b.time ?? '')))) {
      const code = codeKey(s.kind);
      const mine = entries.filter((e) => e.status !== 'CANCELLED' && entryOn(e, s.date, code));
      out.push({
        date: s.date, code, label: s.label, time: s.time ?? null,
        pulpit: { roles: activeRoles.length, filled: activeRoles.filter((r) => mine.some((e) => e.roleId === r.id)).length },
        choir: { required: s.musicRequired !== false, state: m.musicState, count: m.musicState === 'PUBLISHED' ? new Set(m.assignments.filter((a) => a.serviceId === s.id).map((a) => a.unitId)).size : null },
        protocol: { required: s.protocolRequired !== false, state: proto.state, count: proto.state === 'PUBLISHED' ? proto.slots.filter((p) => p.serviceId === `${PROTOCOL_PREFIX}${s.id}`).length : null },
      });
    }
  }
  res.json({ canWrite: w.write, from, to, services: out });
});

/* ───────────── One service ───────────── */

servicePrepRouter.get('/services/:date/:code', requireAuth, async (req: AuthedRequest, res) => {
  const w = await who(req.auth!.personId);
  if (!w.read) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const date = String(req.params.date);
  const code = codeKey(String(req.params.code));
  if (!isDay(date)) return fail(res, 400, 'BAD_DATE', 'Check the date');
  const [rows, cfg, roleRows, entries, choirs] = await Promise.all([
    loadMonthRows(), loadMusicConfig(), roles(),
    prisma.servicePulpitEntry.findMany({ where: { serviceDate: date } }) as Promise<EntryRow[]>,
    loadChoirs(),
  ]);
  const m = await monthServices(monthOf(date), rows, cfg.services);
  const slot = m.services.find((s) => s.date === date && codeKey(s.kind) === code);
  if (!slot) return fail(res, 404, 'NOT_FOUND', 'No such service on that date');
  const proto = await protocolMonth(m.month);
  const mine = entries.filter((e) => entryOn(e, date, code));
  const nm = await nameMaps([...mine.map((e) => e.personId), ...proto.slots.map((p) => p.personId)], mine.map((e) => e.guestId));
  const choirNames = new Map(choirs.map((c) => [c.id, c.name]));
  const roleById = new Map(roleRows.map((r) => [r.id, r]));
  const team = proto.slots.filter((p) => p.serviceId === `${PROTOCOL_PREFIX}${slot.id}`);
  res.json({
    canWrite: w.write,
    service: { date, code, label: slot.label, time: slot.time ?? null },
    pulpit: {
      roles: roleRows,
      entries: mine.sort((a, b) => (roleById.get(a.roleId)?.displayOrder ?? 0) - (roleById.get(b.roleId)?.displayOrder ?? 0)).map((e) => ({
        id: e.id, roleId: e.roleId, roleName: roleById.get(e.roleId)?.name ?? '', wholeDay: e.serviceCode === null,
        personId: e.personId, guestId: e.guestId, guestName: e.guestName,
        name: e.personId ? nm.people.get(e.personId) ?? '' : e.guestId ? nm.guests.get(e.guestId) ?? '' : e.guestName ?? '',
        theme: e.theme ?? '', bibleText: e.bibleText ?? '', status: e.status,
      })),
    },
    choir: {
      required: slot.musicRequired !== false, state: m.musicState,
      // Names appear only once Music has published the month, the same rule the choirs themselves follow.
      choirs: m.musicState === 'PUBLISHED'
        ? [...new Set(m.assignments.filter((a) => a.serviceId === slot.id).map((a) => a.unitId))].map((id) => ({ id, name: choirNames.get(id) ?? id }))
        : [],
    },
    protocol: {
      required: slot.protocolRequired !== false, state: proto.state,
      team: team.map((p) => ({ personId: p.personId, name: nm.people.get(p.personId) ?? p.personId, role: p.role })),
    },
  });
});

/* ───────────── Pulpit roles ───────────── */

const roleBody = z.object({ name: z.string().trim().min(1).max(NAME_MAX), active: z.boolean().optional(), displayOrder: z.number().int().min(0).max(999).optional() });
const slug = (name: string) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'role';

servicePrepRouter.post('/roles', requireAuth, async (req: AuthedRequest, res) => {
  const w = await who(req.auth!.personId);
  if (!w.read) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!w.write) return fail(res, 403, 'FORBIDDEN', 'You may not change the pulpit roles');
  const parsed = roleBody.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Give the role a name');
  const existing = await roles();
  if (existing.some((r) => r.name.toLowerCase() === parsed.data.name.toLowerCase())) return fail(res, 409, 'ALREADY_EXISTS', 'There is already a role with that name');
  let code = slug(parsed.data.name);
  while (existing.some((r) => r.code === code)) code = `${code}-2`;
  const row = (await prisma.servicePulpitRole.create({
    data: { code, name: parsed.data.name, active: parsed.data.active ?? true, displayOrder: parsed.data.displayOrder ?? existing.length },
  })) as RoleRow;
  await audit(w.me, 'PULPIT_ROLE_ADDED', `Added the pulpit role “${row.name}”`, { roleId: row.id });
  res.status(201).json({ id: row.id });
});

servicePrepRouter.patch('/roles/:id', requireAuth, async (req: AuthedRequest, res) => {
  const w = await who(req.auth!.personId);
  if (!w.read) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!w.write) return fail(res, 403, 'FORBIDDEN', 'You may not change the pulpit roles');
  const parsed = roleBody.partial().safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the role');
  const existing = await roles();
  const row = existing.find((r) => r.id === String(req.params.id));
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Role not found');
  const b = parsed.data;
  if (b.name && existing.some((r) => r.id !== row.id && r.name.toLowerCase() === b.name!.toLowerCase())) return fail(res, 409, 'ALREADY_EXISTS', 'There is already a role with that name');
  if (b.active === false && existing.filter((r) => r.active && r.id !== row.id).length === 0) return fail(res, 409, 'LAST_ROLE', 'Keep at least one active role');
  await prisma.servicePulpitRole.update({ where: { id: row.id }, data: { ...(b.name ? { name: b.name } : {}), ...(b.active !== undefined ? { active: b.active } : {}), ...(b.displayOrder !== undefined ? { displayOrder: b.displayOrder } : {}) } });
  await audit(w.me, 'PULPIT_ROLE_CHANGED', `Changed the pulpit role “${row.name}”`, { roleId: row.id });
  res.json({ ok: true });
});

/* ───────────── Pulpit entries ───────────── */

const entryFields = {
  personId: z.string().min(1).nullish(),
  guestId: z.string().min(1).nullish(),
  guestName: z.string().trim().max(NAME_MAX).nullish(),
  theme: z.string().trim().max(SHORT_MAX).nullish(),
  bibleText: z.string().trim().max(SHORT_MAX).nullish(),
};

async function checkWho(b: { personId?: string | null; guestId?: string | null; guestName?: string | null }, res: Res): Promise<boolean> {
  const problem = whoProblem(b);
  if (problem) { fail(res, 400, 'WHO', problem); return false; }
  if (b.personId) {
    const p = (await prisma.person.findUnique({ where: { id: b.personId } })) as PersonRow | null;
    if (!p || p.archivedAt || (p.status && p.status !== 'ACTIVE')) { fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose an active member'); return false; }
  }
  if (b.guestId) {
    const g = (await prisma.guestPreacher.findUnique({ where: { id: b.guestId } })) as GuestRow | null;
    if (!g || g.status !== 'ACTIVE') { fail(res, 404, 'NOT_FOUND', 'Guest not found'); return false; }
  }
  return true;
}

servicePrepRouter.post('/entries', requireAuth, async (req: AuthedRequest, res) => {
  const w = await who(req.auth!.personId);
  if (!w.read) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!w.write) return fail(res, 403, 'FORBIDDEN', 'You may not change the pulpit');
  const parsed = z.object({ serviceDate: z.string(), serviceCode: z.string().trim().min(1).max(40).nullish(), roleId: z.string().min(1), ...entryFields }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the entry');
  const b = parsed.data;
  if (!isDay(b.serviceDate)) return fail(res, 400, 'BAD_DATE', 'Check the date');
  const role = (await roles()).find((r) => r.id === b.roleId);
  if (!role || !role.active) return fail(res, 400, 'BAD_ROLE', 'Choose an active role');
  if (!(await checkWho(b, res))) return;
  const code = b.serviceCode ? codeKey(b.serviceCode) : null;
  const clash = ((await prisma.servicePulpitEntry.findMany({ where: { serviceDate: b.serviceDate, roleId: b.roleId } })) as EntryRow[])
    .some((e) => e.status !== 'CANCELLED' && (e.serviceCode === null ? code === null : code !== null && codeKey(e.serviceCode) === code));
  if (clash) return fail(res, 409, 'ALREADY_EXISTS', `${role.name} is already planned for this service`);
  const row = (await prisma.servicePulpitEntry.create({
    data: {
      serviceDate: b.serviceDate, serviceCode: code, roleId: role.id, personId: b.personId ?? null, guestId: b.guestId ?? null,
      guestName: b.guestName?.trim() || null, theme: b.theme || null, bibleText: b.bibleText || null, status: 'PLANNED', createdById: w.me, updatedAt: new Date(),
    },
  })) as EntryRow;
  await audit(w.me, 'PULPIT_PLANNED', `Planned ${role.name} for ${b.serviceDate}${code ? ` (${code})` : ''}`, { entryId: row.id });
  res.status(201).json({ id: row.id });
});

servicePrepRouter.patch('/entries/:id', requireAuth, async (req: AuthedRequest, res) => {
  const w = await who(req.auth!.personId);
  if (!w.read) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!w.write) return fail(res, 403, 'FORBIDDEN', 'You may not change the pulpit');
  const row = (await prisma.servicePulpitEntry.findUnique({ where: { id: String(req.params.id) } })) as EntryRow | null;
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Entry not found');
  const parsed = z.object({ ...entryFields, serviceCode: z.string().trim().min(1).max(40).nullish(), status: z.enum(ENTRY_STATUSES).optional() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the entry');
  const b = parsed.data;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (b.personId !== undefined || b.guestId !== undefined || b.guestName !== undefined) {
    const next = { personId: b.personId ?? null, guestId: b.guestId ?? null, guestName: b.guestName ?? null };
    if (!(await checkWho(next, res))) return;
    Object.assign(patch, { personId: next.personId, guestId: next.guestId, guestName: next.guestName?.trim() || null });
  }
  if (b.serviceCode !== undefined) patch.serviceCode = b.serviceCode ? codeKey(b.serviceCode) : null;
  if (b.theme !== undefined) patch.theme = b.theme || null;
  if (b.bibleText !== undefined) patch.bibleText = b.bibleText || null;
  if (b.status) patch.status = b.status;
  await prisma.servicePulpitEntry.update({ where: { id: row.id }, data: patch });
  await audit(w.me, 'PULPIT_CHANGED', `Changed the pulpit for ${row.serviceDate}`, { entryId: row.id, ...(b.status ? { status: b.status } : {}) });
  res.json({ ok: true });
});

/* ───────────── Coordinators the leader lets edit ───────────── */

servicePrepRouter.post('/editors', requireAuth, async (req: AuthedRequest, res) => {
  const w = await who(req.auth!.personId);
  if (!w.read) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!w.leader) return fail(res, 403, 'FORBIDDEN', 'Only the Church Leader can choose who may edit');
  const parsed = z.object({ personId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Choose a person');
  const p = (await prisma.person.findUnique({ where: { id: parsed.data.personId } })) as PersonRow | null;
  if (!p || p.archivedAt || (p.status && p.status !== 'ACTIVE')) return fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose an active member');
  if (w.editors.has(p.id)) return res.json({ ok: true });
  await prisma.servicePrepEditor.create({ data: { personId: p.id, grantedById: w.me } });
  await audit(w.me, 'SERVICE_PREP_EDITOR_ADDED', `Let ${p.fullName} edit Service preparation`, { personId: p.id });
  res.status(201).json({ ok: true });
});

servicePrepRouter.delete('/editors/:personId', requireAuth, async (req: AuthedRequest, res) => {
  const w = await who(req.auth!.personId);
  if (!w.read) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!w.leader) return fail(res, 403, 'FORBIDDEN', 'Only the Church Leader can choose who may edit');
  const id = String(req.params.personId);
  if (w.editors.has(id)) {
    await prisma.servicePrepEditor.delete({ where: { personId: id } });
    await audit(w.me, 'SERVICE_PREP_EDITOR_REMOVED', 'Removed a coordinator from Service preparation', { personId: id });
  }
  res.json({ ok: true });
});

/* ───────────── The run-sheet of a service, and the church's template ───────────── */

interface RunItemRow {
  id: string; position: number; title: string; startTime: string; minutes: number; ownerKind: string;
  personId: string | null; roleId: string | null; ownerLabel: string | null; note: string | null;
}
interface TemplateRow { id: string; position: number; title: string; minutes: number; ownerKind: string; roleId: string | null; ownerLabel: string | null; note: string | null }

const itemBody = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX),
  minutes: z.number().int().min(1).max(600),
  ownerKind: z.enum(OWNER_KINDS),
  roleId: z.string().min(1).nullish(),
  ownerLabel: z.string().trim().max(NAME_MAX).nullish(),
  note: z.string().trim().max(200).nullish(),
});
const sheetItem = itemBody.extend({ startTime: z.string().regex(TIME_RE), personId: z.string().min(1).nullish() });
const sheetBody = z.object({ endTime: z.string().regex(TIME_RE).nullish(), items: z.array(sheetItem).max(MAX_ITEMS) });
const templateBody = z.object({ items: z.array(itemBody).max(MAX_ITEMS) });

/** The service of a date and code, with its month; null when there is no such service. */
async function findService(date: string, code: string) {
  const [rows, cfg] = await Promise.all([loadMonthRows(), loadMusicConfig()]);
  const m = await monthServices(monthOf(date), rows, cfg.services);
  const slot = m.services.find((s) => s.date === date && codeKey(s.kind) === code);
  return slot ? { slot, m } : null;
}

async function roleProblem(roleId: string | null | undefined, res: Res): Promise<boolean> {
  if (!roleId) return true;
  if (!(await roles()).some((r) => r.id === roleId)) { fail(res, 400, 'BAD_ROLE', 'Choose a pulpit role that exists'); return false; }
  return true;
}

/** Names for the owners of a service's items: members, the pulpit role's planned person, the choirs, the Protocol team. */
async function ownerNames(items: Array<{ ownerKind: string; personId?: string | null; roleId?: string | null; ownerLabel?: string | null }>, date: string, code: string, found: NonNullable<Awaited<ReturnType<typeof findService>>>) {
  const entries = (await prisma.servicePulpitEntry.findMany({ where: { serviceDate: date } })) as EntryRow[];
  const live = entries.filter((e) => e.status !== 'CANCELLED' && entryOn(e, date, code));
  const nm = await nameMaps([...items.map((i) => i.personId), ...live.map((e) => e.personId)], []);
  const choirNames = new Map((await loadChoirs()).map((c) => [c.id, c.name]));
  const choirs = found.m.musicState === 'PUBLISHED'
    ? [...new Set(found.m.assignments.filter((a) => a.serviceId === found.slot.id).map((a) => a.unitId))].map((id) => choirNames.get(id) ?? id).join(', ')
    : '';
  return (i: { ownerKind: string; personId?: string | null; roleId?: string | null; ownerLabel?: string | null }): string => {
    if (i.ownerKind === 'PERSON') return (i.personId && nm.people.get(i.personId)) || '';
    if (i.ownerKind === 'PULPIT') {
      const e = live.find((x) => x.roleId === i.roleId);
      return e ? (e.personId ? nm.people.get(e.personId) ?? '' : e.guestName ?? '') : '';
    }
    if (i.ownerKind === 'CHOIR') return choirs;
    if (i.ownerKind === 'PROTOCOL') return '';
    return i.ownerLabel ?? '';
  };
}

servicePrepRouter.get('/run/:date/:code', requireAuth, async (req: AuthedRequest, res) => {
  const w = await who(req.auth!.personId);
  if (!w.read) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const date = String(req.params.date);
  const code = codeKey(String(req.params.code));
  if (!isDay(date)) return fail(res, 400, 'BAD_DATE', 'Check the date');
  const found = await findService(date, code);
  if (!found) return fail(res, 404, 'NOT_FOUND', 'No such service on that date');
  const [rows, sheet, template, roleRows] = await Promise.all([
    prisma.serviceRunItem.findMany({ where: { serviceDate: date, serviceCode: code } }) as Promise<RunItemRow[]>,
    prisma.serviceRunSheet.findUnique({ where: { serviceDate_serviceCode: { serviceDate: date, serviceCode: code } } }) as Promise<{ endTime: string | null } | null>,
    prisma.serviceRunTemplateItem.count({ where: { serviceCode: code } }) as Promise<number>,
    roles(),
  ]);
  const items = rows.sort((a, b) => a.position - b.position);
  const name = await ownerNames(items, date, code, found);
  const nm = await nameMaps(items.map((i) => i.personId), []);
  const endTime = sheet?.endTime ?? null;
  res.json({
    canWrite: w.write, startTime: found.slot.time ?? null, endTime, hasTemplate: template > 0, roles: roleRows.filter((r) => r.active),
    items: items.map((i) => ({
      id: i.id, title: i.title, startTime: i.startTime, minutes: i.minutes, endTime: endTimeOf(i), ownerKind: i.ownerKind as OwnerKind,
      personId: i.personId, personName: i.personId ? nm.people.get(i.personId) ?? '' : '', roleId: i.roleId, ownerLabel: i.ownerLabel ?? '', ownerName: name(i), note: i.note ?? '',
    })),
    warnings: runWarnings(items, endTime),
  });
});

/** Save the whole run-sheet in the order given. */
servicePrepRouter.put('/run/:date/:code', requireAuth, async (req: AuthedRequest, res) => {
  const w = await who(req.auth!.personId);
  if (!w.read) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!w.write) return fail(res, 403, 'FORBIDDEN', 'You may not change the run-sheet');
  const date = String(req.params.date);
  const code = codeKey(String(req.params.code));
  if (!isDay(date)) return fail(res, 400, 'BAD_DATE', 'Check the date');
  if (!(await findService(date, code))) return fail(res, 404, 'NOT_FOUND', 'No such service on that date');
  const parsed = sheetBody.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the run-sheet');
  const { items, endTime } = parsed.data;
  for (const it of items) {
    const problem = ownerProblem(it);
    if (problem) return fail(res, 400, 'OWNER', problem);
    if (!(await roleProblem(it.roleId, res))) return;
    if (it.ownerKind === 'PERSON' && it.personId) {
      const p = (await prisma.person.findUnique({ where: { id: it.personId } })) as PersonRow | null;
      if (!p || p.archivedAt || (p.status && p.status !== 'ACTIVE')) return fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose an active member');
    }
  }
  const keep = (i: (typeof items)[number]) => ({
    personId: i.ownerKind === 'PERSON' ? i.personId ?? null : null, roleId: i.ownerKind === 'PULPIT' ? i.roleId ?? null : null,
    ownerLabel: i.ownerKind === 'TEXT' ? i.ownerLabel?.trim() || null : null, note: i.note || null,
  });
  await prisma.$transaction([
    prisma.serviceRunItem.deleteMany({ where: { serviceDate: date, serviceCode: code } }),
    prisma.serviceRunItem.createMany({
      data: items.map((i, n) => ({ serviceDate: date, serviceCode: code, position: n, title: i.title, startTime: i.startTime, minutes: i.minutes, ownerKind: i.ownerKind, ...keep(i) })),
    }),
    prisma.serviceRunSheet.upsert({
      where: { serviceDate_serviceCode: { serviceDate: date, serviceCode: code } },
      create: { serviceDate: date, serviceCode: code, endTime: endTime ?? null, updatedById: w.me, updatedAt: new Date() },
      update: { endTime: endTime ?? null, updatedById: w.me, updatedAt: new Date() },
    }),
  ]);
  await audit(w.me, 'SERVICE_RUN_SAVED', `Saved the run-sheet for ${date} (${code})`, { date, code, items: items.length });
  res.json({ ok: true, warnings: runWarnings(items, endTime ?? null) });
});

/** Replace the run-sheet with the church's template, laid out from the service's start time. */
servicePrepRouter.post('/run/:date/:code/from-template', requireAuth, async (req: AuthedRequest, res) => {
  const w = await who(req.auth!.personId);
  if (!w.read) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!w.write) return fail(res, 403, 'FORBIDDEN', 'You may not change the run-sheet');
  const date = String(req.params.date);
  const code = codeKey(String(req.params.code));
  if (!isDay(date)) return fail(res, 400, 'BAD_DATE', 'Check the date');
  const found = await findService(date, code);
  if (!found) return fail(res, 404, 'NOT_FOUND', 'No such service on that date');
  const start = found.slot.time;
  if (!start || !TIME_RE.test(start)) return fail(res, 400, 'NO_START', 'This service has no start time, so the template cannot be laid out');
  const tpl = ((await prisma.serviceRunTemplateItem.findMany({ where: { serviceCode: code } })) as TemplateRow[]).sort((a, b) => a.position - b.position);
  if (tpl.length === 0) return fail(res, 404, 'NO_TEMPLATE', 'There is no template for this kind of service yet');
  const rows = chain(start, tpl);
  await prisma.$transaction([
    prisma.serviceRunItem.deleteMany({ where: { serviceDate: date, serviceCode: code } }),
    prisma.serviceRunItem.createMany({
      data: rows.map((r, n) => ({ serviceDate: date, serviceCode: code, position: n, title: r.title, startTime: r.startTime, minutes: r.minutes, ownerKind: r.ownerKind, personId: null, roleId: r.roleId, ownerLabel: r.ownerLabel, note: r.note })),
    }),
  ]);
  await audit(w.me, 'SERVICE_RUN_FROM_TEMPLATE', `Started the run-sheet for ${date} (${code}) from the template`, { date, code, items: rows.length });
  res.json({ ok: true });
});

servicePrepRouter.get('/run-template/:code', requireAuth, async (req: AuthedRequest, res) => {
  const w = await who(req.auth!.personId);
  if (!w.read) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const code = codeKey(String(req.params.code));
  const rows = ((await prisma.serviceRunTemplateItem.findMany({ where: { serviceCode: code } })) as TemplateRow[]).sort((a, b) => a.position - b.position);
  res.json({ canWrite: w.write, code, roles: (await roles()).filter((r) => r.active), items: rows.map((r) => ({ title: r.title, minutes: r.minutes, ownerKind: r.ownerKind as OwnerKind, roleId: r.roleId, ownerLabel: r.ownerLabel ?? '', note: r.note ?? '' })) });
});

servicePrepRouter.put('/run-template/:code', requireAuth, async (req: AuthedRequest, res) => {
  const w = await who(req.auth!.personId);
  if (!w.read) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!w.write) return fail(res, 403, 'FORBIDDEN', 'You may not change the template');
  const code = codeKey(String(req.params.code));
  const parsed = templateBody.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the template');
  for (const it of parsed.data.items) {
    if (it.ownerKind === 'PERSON') return fail(res, 400, 'OWNER', 'A template names a role or a group, not a person');
    const problem = ownerProblem(it);
    if (problem) return fail(res, 400, 'OWNER', problem);
    if (!(await roleProblem(it.roleId, res))) return;
  }
  await prisma.$transaction([
    prisma.serviceRunTemplateItem.deleteMany({ where: { serviceCode: code } }),
    prisma.serviceRunTemplateItem.createMany({
      data: parsed.data.items.map((i, n) => ({
        serviceCode: code, position: n, title: i.title, minutes: i.minutes, ownerKind: i.ownerKind,
        roleId: i.ownerKind === 'PULPIT' ? i.roleId ?? null : null, ownerLabel: i.ownerKind === 'TEXT' ? i.ownerLabel?.trim() || null : null, note: i.note || null,
      })),
    }),
  ]);
  await audit(w.me, 'SERVICE_RUN_TEMPLATE_SAVED', `Saved the run-sheet template for ${code}`, { code, items: parsed.data.items.length });
  res.json({ ok: true });
});
