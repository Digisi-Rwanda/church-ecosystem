/**
 * Groups (slice 3.8): the Men and Women fellowship groups, the Children's Sunday School classes and
 * the Youth age groups. A group has members and meetings with attendance; nothing is deleted.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import {
  KIND_BY_SYSTEM, MEETS_MAX, NAME_MAX, NOTE_MAX, SESSIONS_SHOWN, agesProblem, ageOn, attendanceOf, canReadGroups, canWriteGroups, outsideAge, presentOf,
} from '../groups/rules.js';

export const groupsRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const iso = (v: Date | string | null | undefined) => (v ? (v instanceof Date ? v : new Date(v)).toISOString() : null);
const dayOf = (v: Date | string | null | undefined) => iso(v)?.slice(0, 10) ?? '';
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());

interface UnitRow { id: string; name: string; systemId?: string | null }
interface GroupRow { id: string; orgUnitId: string; systemId: string; kind: string; name: string; leaderPersonId?: string | null; ageFrom?: number | null; ageTo?: number | null; meetsOn?: string | null; status: string }
interface MemberRow { id: string; groupId: string; personId: string; joinedOn: Date | string; leftOn?: Date | string | null; status: string }
interface SessionRow { id: string; groupId: string; heldOn: Date | string; presentJson?: string | null; note?: string | null; recordedById: string }
interface PersonRow { id: string; fullName: string; status?: string; archivedAt?: Date | string | null; dateOfBirth?: string | null }

async function ctx(me: string) {
  const { data, units } = await loadAccessData(me);
  return { data, units: units as UnitRow[] };
}
type Ctx = Awaited<ReturnType<typeof ctx>>;
async function audit(actorId: string, systemId: string, action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({ data: { at: new Date(), actorId, systemId, action, resource: 'PEOPLE', detail, metaJson: JSON.stringify(meta) } });
}
const activePerson = async (id: string) => {
  const p = (await prisma.person.findUnique({ where: { id } })) as PersonRow | null;
  return p && !p.archivedAt && (!p.status || p.status === 'ACTIVE') ? p : null;
};
const fields = {
  name: z.string().trim().min(1).max(NAME_MAX),
  leaderId: z.string().min(1).nullish(),
  ageFrom: z.number().int().nullish(),
  ageTo: z.number().int().nullish(),
  meetsOn: z.string().trim().max(MEETS_MAX).nullish(),
};

async function load(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const c = await ctx(me);
  const g = (await prisma.unitGroup.findUnique({ where: { id: String(req.params.id) } })) as GroupRow | null;
  if (!g || !canReadGroups(me, g.systemId, c.data)) {
    fail(res, 404, 'NOT_FOUND', 'Group not found');
    return null;
  }
  return { me, c, g };
}
const membersOf = async (groupId: string) => ((await prisma.groupMember.findMany()) as MemberRow[]).filter((m) => m.groupId === groupId && m.status === 'ACTIVE');
const sessionsOf = async (groupId: string) =>
  ((await prisma.groupSession.findMany()) as SessionRow[]).filter((s) => s.groupId === groupId).sort((a, b) => +new Date(b.heldOn) - +new Date(a.heldOn));
async function people(ids: string[]) {
  const out = new Map<string, PersonRow>();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return out;
  for (const p of (await prisma.person.findMany({ where: { id: { in: uniq } } })) as PersonRow[]) out.set(p.id, p);
  return out;
}

groupsRouter.get('/options', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const c = await ctx(me);
  res.json({
    units: c.units.filter((u) => u.systemId && canWriteGroups(me, u.systemId, c.data)).map((u) => ({ id: u.id, name: u.name, systemId: u.systemId!, kind: KIND_BY_SYSTEM[u.systemId!] })),
    limits: { nameMax: NAME_MAX, meetsMax: MEETS_MAX, noteMax: NOTE_MAX },
  });
});

groupsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = typeof req.query.systemId === 'string' ? req.query.systemId : '';
  const c = await ctx(me);
  if (!systemId || !canReadGroups(me, systemId, c.data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const groups = ((await prisma.unitGroup.findMany()) as GroupRow[]).filter((g) => g.systemId === systemId).sort((a, b) => a.name.localeCompare(b.name));
  const members = (await prisma.groupMember.findMany()) as MemberRow[];
  const sessions = (await prisma.groupSession.findMany()) as SessionRow[];
  const who = await people(groups.map((g) => g.leaderPersonId ?? ''));
  res.json({
    kind: KIND_BY_SYSTEM[systemId],
    canWrite: canWriteGroups(me, systemId, c.data),
    groups: groups.map((g) => {
      const last = sessions.filter((s) => s.groupId === g.id).sort((a, b) => +new Date(b.heldOn) - +new Date(a.heldOn))[0];
      return {
        id: g.id, name: g.name, status: g.status, unitName: c.units.find((u) => u.id === g.orgUnitId)?.name ?? '', ageFrom: g.ageFrom ?? null, ageTo: g.ageTo ?? null,
        meetsOn: g.meetsOn ?? '', leaderName: g.leaderPersonId ? who.get(g.leaderPersonId)?.fullName ?? '' : '',
        members: members.filter((m) => m.groupId === g.id && m.status === 'ACTIVE').length, lastSessionOn: last ? dayOf(last.heldOn) : null,
      };
    }),
  });
});

groupsRouter.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z.object({ ...fields, unitId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid group');
  const b = parsed.data;
  if (agesProblem(b.ageFrom, b.ageTo)) return fail(res, 400, 'BAD_AGES', 'Check the ages');
  const c = await ctx(me);
  const unit = c.units.find((u) => u.id === b.unitId);
  if (!unit?.systemId || !(unit.systemId in KIND_BY_SYSTEM)) return fail(res, 404, 'NOT_FOUND', 'Unit not found');
  if (!canWriteGroups(me, unit.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not change groups here');
  if (b.leaderId && !(await activePerson(b.leaderId))) return fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose an active member');
  const row = (await prisma.unitGroup.create({
    data: { orgUnitId: unit.id, systemId: unit.systemId, kind: KIND_BY_SYSTEM[unit.systemId], name: b.name, leaderPersonId: b.leaderId ?? null, ageFrom: b.ageFrom ?? null, ageTo: b.ageTo ?? null, meetsOn: b.meetsOn || null, status: 'ACTIVE', createdById: me },
  })) as GroupRow;
  await audit(me, unit.systemId, 'GROUP_CREATED', `Created “${b.name}”`, { groupId: row.id });
  res.status(201).json({ id: row.id });
});

groupsRouter.get('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, c, g } = got;
  const members = await membersOf(g.id);
  const sessions = await sessionsOf(g.id);
  const recent = sessions.slice(0, SESSIONS_SHOWN);
  const who = await people([...members.map((m) => m.personId), g.leaderPersonId ?? '', ...recent.flatMap((s) => presentOf(s))]);
  const stats = attendanceOf(members.map((m) => m.personId), recent);
  const today = new Date().toISOString().slice(0, 10);
  res.json({
    group: {
      id: g.id, name: g.name, kind: g.kind, systemId: g.systemId, status: g.status, unitName: c.units.find((u) => u.id === g.orgUnitId)?.name ?? '', ageFrom: g.ageFrom ?? null, ageTo: g.ageTo ?? null,
      meetsOn: g.meetsOn ?? '', leaderId: g.leaderPersonId ?? null, leaderName: g.leaderPersonId ? who.get(g.leaderPersonId)?.fullName ?? '' : '', canWrite: g.status === 'ACTIVE' && canWriteGroups(me, g.systemId, c.data),
    },
    members: members
      .map((m) => {
        const p = who.get(m.personId);
        const age = ageOn(p?.dateOfBirth, today);
        const a = stats.get(m.personId)!;
        return { personId: m.personId, name: p?.fullName ?? '', joinedOn: dayOf(m.joinedOn), age, outsideAge: outsideAge(age, g.ageFrom, g.ageTo), came: a.came, of: a.of, rate: a.rate };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    sessions: recent.map((s) => ({ id: s.id, heldOn: dayOf(s.heldOn), present: presentOf(s).length, note: s.note ?? '', names: presentOf(s).map((id) => who.get(id)?.fullName ?? '').filter(Boolean) })),
  });
});

groupsRouter.patch('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, c, g } = got;
  if (!canWriteGroups(me, g.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not change groups here');
  const parsed = z.object(fields).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid group');
  const b = parsed.data;
  if (agesProblem(b.ageFrom, b.ageTo)) return fail(res, 400, 'BAD_AGES', 'Check the ages');
  if (b.leaderId && !(await activePerson(b.leaderId))) return fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose an active member');
  await prisma.unitGroup.update({ where: { id: g.id }, data: { name: b.name, leaderPersonId: b.leaderId ?? null, ageFrom: b.ageFrom ?? null, ageTo: b.ageTo ?? null, meetsOn: b.meetsOn || null } });
  await audit(me, g.systemId, 'GROUP_EDITED', `Edited “${b.name}”`, { groupId: g.id });
  res.json({ ok: true });
});

groupsRouter.post('/:id/close', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, c, g } = got;
  if (!canWriteGroups(me, g.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not change groups here');
  if (g.status === 'CLOSED') return fail(res, 409, 'WRONG_STATE', 'Already closed');
  await prisma.unitGroup.update({ where: { id: g.id }, data: { status: 'CLOSED' } });
  await audit(me, g.systemId, 'GROUP_CLOSED', `Closed “${g.name}”`, { groupId: g.id });
  res.json({ ok: true });
});

groupsRouter.post('/:id/members', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, c, g } = got;
  if (!canWriteGroups(me, g.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not change groups here');
  if (g.status !== 'ACTIVE') return fail(res, 409, 'WRONG_STATE', 'This group is closed');
  const parsed = z.object({ personId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Choose a person');
  if (!(await activePerson(parsed.data.personId))) return fail(res, 400, 'PERSON_NOT_ACTIVE', 'Choose an active member');
  if ((await membersOf(g.id)).some((m) => m.personId === parsed.data.personId)) return fail(res, 409, 'ALREADY_EXISTS', 'Already in this group');
  await prisma.groupMember.create({ data: { groupId: g.id, personId: parsed.data.personId, status: 'ACTIVE' } });
  await audit(me, g.systemId, 'GROUP_MEMBER_ADDED', `Added to “${g.name}”`, { groupId: g.id, personId: parsed.data.personId });
  res.status(201).json({ ok: true });
});

groupsRouter.delete('/:id/members/:personId', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, c, g } = got;
  if (!canWriteGroups(me, g.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not change groups here');
  const m = (await membersOf(g.id)).find((x) => x.personId === String(req.params.personId));
  if (!m) return fail(res, 404, 'NOT_FOUND', 'Not in this group');
  await prisma.groupMember.update({ where: { id: m.id }, data: { status: 'LEFT', leftOn: new Date() } });
  await audit(me, g.systemId, 'GROUP_MEMBER_LEFT', `Left “${g.name}”`, { groupId: g.id, personId: m.personId });
  res.json({ ok: true });
});

groupsRouter.post('/:id/sessions', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, c, g } = got;
  if (!canWriteGroups(me, g.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not change groups here');
  if (g.status !== 'ACTIVE') return fail(res, 409, 'WRONG_STATE', 'This group is closed');
  const parsed = z.object({ heldOn: z.string(), presentIds: z.array(z.string().min(1)).max(500), note: z.string().trim().max(NOTE_MAX).nullish() }).safeParse(req.body);
  if (!parsed.success || !isDay(parsed.data.heldOn)) return fail(res, 400, 'BAD_INPUT', 'Enter the day and who was present');
  if (parsed.data.heldOn > new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10)) return fail(res, 400, 'FUTURE_DATE', 'A meeting is recorded after it happened');
  const memberIds = new Set((await membersOf(g.id)).map((m) => m.personId));
  const present = [...new Set(parsed.data.presentIds)];
  if (present.some((id) => !memberIds.has(id))) return fail(res, 400, 'NOT_A_MEMBER', 'Only members of the group can be marked present');
  if ((await sessionsOf(g.id)).some((s) => dayOf(s.heldOn) === parsed.data.heldOn)) return fail(res, 409, 'ALREADY_EXISTS', 'A meeting is already recorded for that day');
  const row = (await prisma.groupSession.create({ data: { groupId: g.id, heldOn: new Date(`${parsed.data.heldOn}T00:00:00Z`), presentJson: JSON.stringify(present), note: parsed.data.note || null, recordedById: me } })) as SessionRow;
  await audit(me, g.systemId, 'GROUP_SESSION_RECORDED', `${present.length} present in “${g.name}”`, { groupId: g.id, sessionId: row.id });
  res.status(201).json({ id: row.id });
});
