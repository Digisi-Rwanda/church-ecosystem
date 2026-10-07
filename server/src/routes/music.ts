/**
 * Music ministry (slice 3.12): choirs and their register, the month plan, and the oversight summary.
 * Nothing is deleted: a choir is retired, a member leaves, a service or assignment is removed.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import {
  LABEL_MAX, MUSIC, NAME_MAX, ROLES, SERVICE_KINDS, canManageChoirs, canOversee, canReadChoir, canReadPlan, canWriteChoir, canWritePlan, isMonth, monthOf, roleMayServe,
} from '../music/rules.js';

export const musicRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const iso = (v: Date | string | null | undefined) => (v ? (v instanceof Date ? v : new Date(v)).toISOString() : null);
const dayOf = (v: Date | string | null | undefined) => iso(v)?.slice(0, 10) ?? '';
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());

interface ChoirRow { id: string; name: string; role: string; systemId?: string | null; orgUnitId?: string | null; active: boolean }
interface MemberRow { id: string; choirId: string; personId: string; status: string; joinedOn?: Date | string | null }
interface PlanRow { id: string; periodKey: string; status: string; publishedAt?: Date | string | null }
interface ServiceRow { id: string; planId: string; serviceOn: Date | string; kind: string; label?: string | null; status: string }
interface AssignRow { id: string; serviceId: string; choirId: string; status: string }
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
  const all = (await choirs()).filter((c) => canReadChoir(me, c.systemId, data));
  const members = await membersOf();
  res.json({
    canManage: canManageChoirs(me, data),
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

/* ───────────── Month plan ───────────── */

async function planView(plan: PlanRow) {
  const services = ((await prisma.musicService.findMany()) as ServiceRow[]).filter((s) => s.planId === plan.id && s.status === 'ACTIVE').sort((a, b) => +new Date(a.serviceOn) - +new Date(b.serviceOn));
  const ids = new Set(services.map((s) => s.id));
  const assigns = ((await prisma.musicAssignment.findMany()) as AssignRow[]).filter((a) => ids.has(a.serviceId) && a.status === 'ACTIVE');
  const byId = new Map((await choirs()).map((c) => [c.id, c]));
  return {
    id: plan.id, periodKey: plan.periodKey, status: plan.status, publishedAt: iso(plan.publishedAt),
    services: services.map((s) => ({
      id: s.id, serviceOn: dayOf(s.serviceOn), kind: s.kind, label: s.label ?? '',
      choirs: assigns.filter((a) => a.serviceId === s.id).map((a) => ({ choirId: a.choirId, name: byId.get(a.choirId)?.name ?? '' })),
    })),
  };
}

musicRouter.get('/plan', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  if (!canReadPlan(me, data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const month = typeof req.query.month === 'string' ? req.query.month : '';
  if (!isMonth(month)) return fail(res, 400, 'BAD_INPUT', 'Choose a month');
  const canWrite = canWritePlan(me, data);
  const plan = ((await prisma.musicPlan.findMany()) as PlanRow[]).find((p) => p.periodKey === month);
  // Members see only what has been published; planners see drafts too.
  const visible = plan && (canWrite || plan.status === 'PUBLISHED') ? await planView(plan) : null;
  res.json({
    canWrite,
    plan: visible,
    choirs: canWrite ? (await choirs()).filter((c) => c.active).map((c) => ({ id: c.id, name: c.name, role: c.role })).sort((a, b) => a.name.localeCompare(b.name)) : [],
  });
});

musicRouter.post('/plan', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z.object({ month: z.string() }).safeParse(req.body);
  if (!parsed.success || !isMonth(parsed.data.month)) return fail(res, 400, 'BAD_INPUT', 'Choose a month');
  if (!canWritePlan(me, await accessOf(me))) return fail(res, 403, 'FORBIDDEN', 'You may not change the plan');
  if (((await prisma.musicPlan.findMany()) as PlanRow[]).some((p) => p.periodKey === parsed.data.month)) return fail(res, 409, 'ALREADY_EXISTS', 'This month already has a plan');
  const row = (await prisma.musicPlan.create({ data: { periodKey: parsed.data.month, status: 'DRAFT', createdById: me } })) as PlanRow;
  await audit(me, 'SCHEDULING', 'PLAN_CREATED', `Started the plan for ${parsed.data.month}`, { planId: row.id });
  res.status(201).json({ id: row.id });
});

async function loadPlan(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  const plan = (await prisma.musicPlan.findUnique({ where: { id: String(req.params.id) } })) as PlanRow | null;
  if (!plan || !canReadPlan(me, data)) {
    fail(res, 404, 'NOT_FOUND', 'Plan not found');
    return null;
  }
  if (!canWritePlan(me, data)) {
    fail(res, 403, 'FORBIDDEN', 'You may not change the plan');
    return null;
  }
  return { me, plan };
}

musicRouter.post('/plan/:id/services', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadPlan(req, res);
  if (!got) return;
  const parsed = z.object({ serviceOn: z.string(), kind: z.enum(SERVICE_KINDS), label: z.string().trim().max(LABEL_MAX).nullish() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the service');
  const b = parsed.data;
  if (!isDay(b.serviceOn)) return fail(res, 400, 'BAD_DATE', 'Check the date');
  if (monthOf(b.serviceOn) !== got.plan.periodKey) return fail(res, 400, 'OUTSIDE_MONTH', 'The day is outside this plan’s month');
  const clash = ((await prisma.musicService.findMany()) as ServiceRow[]).some((s) => s.planId === got.plan.id && s.status === 'ACTIVE' && dayOf(s.serviceOn) === b.serviceOn && s.kind === b.kind);
  if (clash) return fail(res, 409, 'ALREADY_EXISTS', 'This service is already in the plan');
  const row = (await prisma.musicService.create({ data: { planId: got.plan.id, serviceOn: new Date(`${b.serviceOn}T00:00:00Z`), kind: b.kind, label: b.label || null, status: 'ACTIVE' } })) as ServiceRow;
  await audit(got.me, 'SCHEDULING', 'PLAN_SERVICE_ADDED', `Added ${b.kind} on ${b.serviceOn}`, { planId: got.plan.id, serviceId: row.id });
  res.status(201).json({ id: row.id });
});

async function loadService(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  const s = (await prisma.musicService.findUnique({ where: { id: String(req.params.sid) } })) as ServiceRow | null;
  if (!s || s.status !== 'ACTIVE' || !canReadPlan(me, data)) {
    fail(res, 404, 'NOT_FOUND', 'Service not found');
    return null;
  }
  if (!canWritePlan(me, data)) {
    fail(res, 403, 'FORBIDDEN', 'You may not change the plan');
    return null;
  }
  return { me, s };
}

musicRouter.delete('/services/:sid', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadService(req, res);
  if (!got) return;
  await prisma.musicService.update({ where: { id: got.s.id }, data: { status: 'REMOVED' } });
  await audit(got.me, 'SCHEDULING', 'PLAN_SERVICE_REMOVED', `Removed ${got.s.kind} on ${dayOf(got.s.serviceOn)}`, { serviceId: got.s.id });
  res.json({ ok: true });
});

musicRouter.post('/services/:sid/assignments', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadService(req, res);
  if (!got) return;
  const parsed = z.object({ choirId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Choose a choir');
  const c = (await prisma.musicChoir.findUnique({ where: { id: parsed.data.choirId } })) as ChoirRow | null;
  if (!c || !c.active) return fail(res, 404, 'NOT_FOUND', 'Choir not found');
  if (!roleMayServe(c.role, got.s.kind)) return fail(res, 400, 'CHOIR_NOT_ALLOWED', 'This choir does not serve at this service');
  const mine = ((await prisma.musicAssignment.findMany()) as AssignRow[]).filter((a) => a.serviceId === got.s.id && a.status === 'ACTIVE');
  if (mine.some((a) => a.choirId === c.id)) return fail(res, 409, 'ALREADY_EXISTS', 'This choir is already on this service');
  await prisma.musicAssignment.create({ data: { serviceId: got.s.id, choirId: c.id, status: 'ACTIVE' } });
  await audit(got.me, 'SCHEDULING', 'PLAN_CHOIR_ASSIGNED', `Assigned “${c.name}” to ${got.s.kind} on ${dayOf(got.s.serviceOn)}`, { serviceId: got.s.id, choirId: c.id });
  res.status(201).json({ ok: true });
});

musicRouter.delete('/services/:sid/assignments/:choirId', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadService(req, res);
  if (!got) return;
  const row = ((await prisma.musicAssignment.findMany()) as AssignRow[]).find((a) => a.serviceId === got.s.id && a.choirId === String(req.params.choirId) && a.status === 'ACTIVE');
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Not on this service');
  await prisma.musicAssignment.update({ where: { id: row.id }, data: { status: 'REMOVED' } });
  await audit(got.me, 'SCHEDULING', 'PLAN_CHOIR_REMOVED', `Took a choir off ${got.s.kind} on ${dayOf(got.s.serviceOn)}`, { serviceId: got.s.id, choirId: row.choirId });
  res.json({ ok: true });
});

musicRouter.post('/plan/:id/publish', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadPlan(req, res);
  if (!got) return;
  const view = await planView(got.plan);
  if (view.services.length === 0) return fail(res, 400, 'EMPTY_PLAN', 'Add at least one service first');
  await prisma.musicPlan.update({ where: { id: got.plan.id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
  await audit(got.me, 'SCHEDULING', 'PLAN_PUBLISHED', `Published the plan for ${got.plan.periodKey}`, { planId: got.plan.id });
  res.json({ ok: true });
});

/* ───────────── Oversight ───────────── */

musicRouter.get('/oversight', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const data = await accessOf(me);
  if (!canOversee(me, data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const month = typeof req.query.month === 'string' ? req.query.month : '';
  if (!isMonth(month)) return fail(res, 400, 'BAD_INPUT', 'Choose a month');
  const plan = ((await prisma.musicPlan.findMany()) as PlanRow[]).find((p) => p.periodKey === month);
  const view = plan ? await planView(plan) : null;
  const members = await membersOf();
  const list = (await choirs()).filter((c) => c.active);
  res.json({
    month, planStatus: view?.status ?? null,
    choirs: list
      .map((c) => {
        const served = (view?.services ?? []).filter((s) => s.choirs.some((x) => x.choirId === c.id));
        const n = members.filter((m) => m.choirId === c.id).length;
        return { id: c.id, name: c.name, role: c.role, members: n, services: served.length, days: served.map((s) => s.serviceOn), noMembers: n === 0, notScheduled: !!view && served.length === 0 };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    emptyServices: (view?.services ?? []).filter((s) => s.choirs.length === 0).map((s) => ({ id: s.id, serviceOn: s.serviceOn, kind: s.kind })),
  });
});
