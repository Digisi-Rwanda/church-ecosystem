/**
 * Schedule (slice 3.1): month plans, slots and assignments. A planner (W) builds a unit's month,
 * an approver (C) confirms it, a publisher (P) shares it with the team. Assignees are told once it
 * is published and may decline with a reason. Music and Protocol documents stay as they were.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { notifySafely } from '../lib/notify.js';
import {
  NOTE_MAX, ROLE_MAX, SLOT_KINDS, TITLE_MAX, canConfirm, canPublish, canRead, canSeePlan, canWrite, isMonthKey,
  isPlanner, monthOf, monthRange, moveProblem, rangeProblem,
} from '../schedule/rules.js';

export const scheduleRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const iso = (v: Date | string | null | undefined) => (v ? (v instanceof Date ? v : new Date(v)).toISOString() : null);
const CHURCH = 'sys-main';

interface PlanRow {
  id: string; orgUnitId: string; systemId: string; month: string; status: string; createdById: string;
  confirmedAt?: Date | string | null; publishedAt?: Date | string | null;
}
interface SlotRow {
  id: string; planId: string; orgUnitId: string; systemId: string; title: string; kind: string; startsAt: Date | string;
  endsAt?: Date | string | null; location?: string | null; notes?: string | null; churchWide: boolean; createdById: string;
}
interface AsgRow {
  id: string; slotId: string; personId: string; role: string; status: string; declineReason?: string | null; createdById: string;
}
interface UnitRow { id: string; name: string; code?: string | null; kind?: string | null; systemId?: string | null }

async function audit(actorId: string, systemId: string, action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({
    data: { at: new Date(), actorId, systemId, action, resource: 'SCHEDULING', detail, metaJson: JSON.stringify(meta) },
  });
}

async function names(ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids)];
  const out = new Map<string, string>();
  if (!uniq.length) return out;
  const rows = (await prisma.person.findMany({ where: { id: { in: uniq } } })) as Array<{ id: string; fullName: string }>;
  for (const p of rows) out.set(p.id, p.fullName);
  return out;
}

const time = (v: Date | string) => new Date(v).getTime();
const byStart = (a: SlotRow, b: SlotRow) => time(a.startsAt) - time(b.startsAt);

async function shapeSlots(slots: SlotRow[], me: string) {
  const asgs = ((await prisma.slotAssignment.findMany()) as AsgRow[]).filter((a) => slots.some((s) => s.id === a.slotId));
  const who = await names(asgs.map((a) => a.personId));
  return [...slots].sort(byStart).map((s) => ({
    id: s.id, title: s.title, kind: s.kind, startsAt: iso(s.startsAt), endsAt: iso(s.endsAt),
    location: s.location ?? null, notes: s.notes ?? null, churchWide: s.churchWide,
    assignments: asgs.filter((a) => a.slotId === s.id).map((a) => ({
      id: a.id, personId: a.personId, personName: who.get(a.personId) ?? '', role: a.role, status: a.status,
      declineReason: a.declineReason ?? null, mine: a.personId === me,
    })),
  }));
}

scheduleRouter.get('/options', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const { data, units } = await loadAccessData(me);
  res.json({
    units: (units as UnitRow[])
      .filter((u) => u.systemId && canWrite(me, u.systemId, data))
      .map((u) => ({ id: u.id, name: u.name, systemId: u.systemId! })),
    kinds: SLOT_KINDS,
    limits: { titleMax: TITLE_MAX, roleMax: ROLE_MAX, noteMax: NOTE_MAX },
  });
});

scheduleRouter.get('/month', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = String(req.query.systemId ?? '');
  const month = String(req.query.month ?? '');
  if (!systemId || !isMonthKey(month)) return fail(res, 400, 'BAD_INPUT', 'systemId and month (YYYY-MM) are required');
  const { data, units } = await loadAccessData(me);
  if (!canRead(me, systemId, data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const plans = ((await prisma.monthPlan.findMany()) as PlanRow[]).filter((p) => p.systemId === systemId && p.month === month);
  const planner = canWrite(me, systemId, data);
  const out: unknown[] = [];
  for (const u of (units as UnitRow[]).filter((x) => x.systemId === systemId)) {
    const plan = plans.find((p) => p.orgUnitId === u.id) ?? null;
    const visible = plan && canSeePlan(plan.status, me, systemId, data) ? plan : null;
    if (!visible && !planner) continue;
    const slots = visible ? ((await prisma.scheduleSlot.findMany()) as SlotRow[]).filter((s) => s.planId === visible.id) : [];
    out.push({
      unitId: u.id, unitName: u.name,
      plan: visible && { id: visible.id, status: visible.status, confirmedAt: iso(visible.confirmedAt), publishedAt: iso(visible.publishedAt) },
      slots: await shapeSlots(slots, me),
    });
  }
  res.json({
    month, systemId,
    canWrite: planner, canConfirm: canConfirm(me, systemId, data), canPublish: canPublish(me, systemId, data),
    units: out,
  });
});

/** The church calendar: published slots marked for the whole church, from every unit. */
scheduleRouter.get('/church', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const month = String(req.query.month ?? '');
  if (!isMonthKey(month)) return fail(res, 400, 'BAD_INPUT', 'month (YYYY-MM) is required');
  const { data, units } = await loadAccessData(me);
  if (!canRead(me, CHURCH, data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const published = new Set(
    ((await prisma.monthPlan.findMany()) as PlanRow[]).filter((p) => p.month === month && p.status === 'PUBLISHED').map((p) => p.id),
  );
  const slots = ((await prisma.scheduleSlot.findMany()) as SlotRow[]).filter((s) => s.churchWide && published.has(s.planId)).sort(byStart);
  res.json({
    month,
    slots: slots.map((s) => ({
      id: s.id, title: s.title, kind: s.kind, startsAt: iso(s.startsAt), endsAt: iso(s.endsAt), location: s.location ?? null,
      unitName: (units as UnitRow[]).find((u) => u.id === s.orgUnitId)?.name ?? '',
    })),
  });
});

/** My upcoming duties on published plans, across every unit. */
scheduleRouter.get('/mine', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const { units } = await loadAccessData(me);
  const mine = ((await prisma.slotAssignment.findMany()) as AsgRow[]).filter((a) => a.personId === me && a.status === 'ASSIGNED');
  const slots = (await prisma.scheduleSlot.findMany()) as SlotRow[];
  const plans = (await prisma.monthPlan.findMany()) as PlanRow[];
  const since = Date.now() - 24 * 3600 * 1000;
  const duties = mine.flatMap((a) => {
    const s = slots.find((x) => x.id === a.slotId);
    const p = s && plans.find((x) => x.id === s.planId);
    if (!s || !p || p.status !== 'PUBLISHED' || time(s.startsAt) < since) return [];
    return [{
      assignmentId: a.id, role: a.role, slotId: s.id, title: s.title, kind: s.kind, startsAt: iso(s.startsAt), endsAt: iso(s.endsAt),
      location: s.location ?? null, systemId: s.systemId, unitName: (units as UnitRow[]).find((u) => u.id === s.orgUnitId)?.name ?? '',
    }];
  });
  duties.sort((a, b) => time(a.startsAt!) - time(b.startsAt!));
  res.json({ duties: duties.slice(0, 100) });
});

const slotBody = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX),
  kind: z.enum(SLOT_KINDS).default('OTHER'),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullish(),
  location: z.string().trim().max(TITLE_MAX).nullish(),
  notes: z.string().trim().max(NOTE_MAX).nullish(),
  churchWide: z.boolean().default(false),
});

async function loadSlot(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const { data, units } = await loadAccessData(me);
  const slot = (await prisma.scheduleSlot.findUnique({ where: { id: String(req.params.id) } })) as SlotRow | null;
  const plan = slot ? ((await prisma.monthPlan.findUnique({ where: { id: slot.planId } })) as PlanRow | null) : null;
  if (!slot || !plan || !canSeePlan(plan.status, me, slot.systemId, data)) {
    fail(res, 404, 'NOT_FOUND', 'Slot not found');
    return null;
  }
  return { me, data, units: units as UnitRow[], slot, plan };
}

scheduleRouter.post('/slots', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = slotBody.extend({ unitId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid slot');
  const b = parsed.data;
  const { data, units } = await loadAccessData(me);
  const unit = (units as UnitRow[]).find((u) => u.id === b.unitId);
  if (!unit?.systemId || !canRead(me, unit.systemId, data) && !isPlanner(me, unit.systemId, data)) return fail(res, 404, 'NOT_FOUND', 'Unit not found');
  if (!canWrite(me, unit.systemId, data)) return fail(res, 403, 'FORBIDDEN', 'You may not plan here');
  const start = new Date(b.startsAt);
  const end = b.endsAt ? new Date(b.endsAt) : null;
  if (rangeProblem(start, end)) return fail(res, 400, 'BAD_RANGE', 'The end must be after the start');
  const month = monthOf(start);
  const plans = (await prisma.monthPlan.findMany()) as PlanRow[];
  let plan = plans.find((p) => p.orgUnitId === unit.id && p.month === month) ?? null;
  if (plan && plan.status !== 'DRAFT') return fail(res, 409, 'PLAN_LOCKED', 'This month is no longer a draft');
  if (!plan) {
    plan = (await prisma.monthPlan.create({
      data: { orgUnitId: unit.id, systemId: unit.systemId, month, status: 'DRAFT', createdById: me },
    })) as PlanRow;
  }
  const slot = (await prisma.scheduleSlot.create({
    data: {
      planId: plan.id, orgUnitId: unit.id, systemId: unit.systemId, title: b.title, kind: b.kind, startsAt: start, endsAt: end,
      location: b.location || null, notes: b.notes || null, churchWide: b.churchWide, createdById: me,
    },
  })) as SlotRow;
  await audit(me, unit.systemId, 'SCHEDULE_SLOT_ADDED', `Added ${slot.title}`, { slotId: slot.id, planId: plan.id });
  res.status(201).json({ slotId: slot.id, planId: plan.id, month });
});

scheduleRouter.patch('/slots/:id', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadSlot(req, res);
  if (!got) return;
  const { me, data, slot, plan } = got;
  if (!canWrite(me, slot.systemId, data)) return fail(res, 403, 'FORBIDDEN', 'You may not plan here');
  if (plan.status !== 'DRAFT') return fail(res, 409, 'PLAN_LOCKED', 'This month is no longer a draft');
  const parsed = slotBody.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid slot');
  const b = parsed.data;
  const start = new Date(b.startsAt);
  const end = b.endsAt ? new Date(b.endsAt) : null;
  if (rangeProblem(start, end)) return fail(res, 400, 'BAD_RANGE', 'The end must be after the start');
  if (monthOf(start) !== plan.month) return fail(res, 400, 'WRONG_MONTH', 'The date must stay inside this month');
  await prisma.scheduleSlot.update({
    where: { id: slot.id },
    data: { title: b.title, kind: b.kind, startsAt: start, endsAt: end, location: b.location || null, notes: b.notes || null, churchWide: b.churchWide },
  });
  await audit(me, slot.systemId, 'SCHEDULE_SLOT_EDITED', `Edited ${b.title}`, { slotId: slot.id });
  res.json({ ok: true });
});

scheduleRouter.delete('/slots/:id', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadSlot(req, res);
  if (!got) return;
  const { me, data, slot, plan } = got;
  if (!canWrite(me, slot.systemId, data)) return fail(res, 403, 'FORBIDDEN', 'You may not plan here');
  if (plan.status !== 'DRAFT') return fail(res, 409, 'PLAN_LOCKED', 'This month is no longer a draft');
  await prisma.slotAssignment.deleteMany({ where: { slotId: slot.id } });
  await prisma.scheduleSlot.delete({ where: { id: slot.id } });
  await audit(me, slot.systemId, 'SCHEDULE_SLOT_REMOVED', `Removed ${slot.title}`, { slotId: slot.id });
  res.json({ ok: true });
});

const assignBody = z.object({ personId: z.string().min(1), role: z.string().trim().min(1).max(ROLE_MAX) });

async function addAssignment(slot: SlotRow, plan: PlanRow, me: string, personId: string, role: string, res: Res) {
  const person = await prisma.person.findUnique({ where: { id: personId } });
  if (!person) return fail(res, 404, 'NOT_FOUND', 'Person not found');
  const live = ((await prisma.slotAssignment.findMany()) as AsgRow[]).filter((a) => a.slotId === slot.id && a.personId === personId && a.status === 'ASSIGNED');
  if (live.length) return fail(res, 409, 'ALREADY_ASSIGNED', 'This person is already on this slot');
  const a = (await prisma.slotAssignment.create({ data: { slotId: slot.id, personId, role, status: 'ASSIGNED', createdById: me } })) as AsgRow;
  if (plan.status === 'PUBLISHED') await tellAssignee(a, slot);
  await audit(me, slot.systemId, 'SCHEDULE_ASSIGNED', `Assigned ${role} on ${slot.title}`, { slotId: slot.id, assignmentId: a.id, personId });
  return res.status(201).json({ assignmentId: a.id });
}

async function tellAssignee(a: AsgRow, slot: SlotRow) {
  await notifySafely(prisma as never, {
    kind: 'FOR_INFORMATION', toPersonId: a.personId, systemId: slot.systemId,
    title: `You are on the plan: ${slot.title}`,
    body: `${a.role}, ${new Date(slot.startsAt).toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    href: `/s/${slot.systemId}/schedule`, sourceKey: `sched-pub:${a.id}`,
  });
}

scheduleRouter.post('/slots/:id/assign', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadSlot(req, res);
  if (!got) return;
  const { me, data, slot, plan } = got;
  if (!canWrite(me, slot.systemId, data)) return fail(res, 403, 'FORBIDDEN', 'You may not plan here');
  if (plan.status !== 'DRAFT') return fail(res, 409, 'PLAN_LOCKED', 'This month is no longer a draft');
  const parsed = assignBody.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid assignment');
  await addAssignment(slot, plan, me, parsed.data.personId, parsed.data.role, res);
});

async function loadAssignment(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const { data } = await loadAccessData(me);
  const a = (await prisma.slotAssignment.findUnique({ where: { id: String(req.params.id) } })) as AsgRow | null;
  const slot = a ? ((await prisma.scheduleSlot.findUnique({ where: { id: a.slotId } })) as SlotRow | null) : null;
  const plan = slot ? ((await prisma.monthPlan.findUnique({ where: { id: slot.planId } })) as PlanRow | null) : null;
  if (!a || !slot || !plan || !(a.personId === me && plan.status === 'PUBLISHED') && !canSeePlan(plan.status, me, slot.systemId, data)) {
    fail(res, 404, 'NOT_FOUND', 'Assignment not found');
    return null;
  }
  return { me, data, a, slot, plan };
}

scheduleRouter.delete('/assignments/:id', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadAssignment(req, res);
  if (!got) return;
  const { me, data, a, slot, plan } = got;
  if (!canWrite(me, slot.systemId, data)) return fail(res, 403, 'FORBIDDEN', 'You may not plan here');
  if (plan.status !== 'DRAFT') return fail(res, 409, 'PLAN_LOCKED', 'This month is no longer a draft');
  await prisma.slotAssignment.delete({ where: { id: a.id } });
  await audit(me, slot.systemId, 'SCHEDULE_UNASSIGNED', `Removed ${a.role} on ${slot.title}`, { slotId: slot.id, assignmentId: a.id });
  res.json({ ok: true });
});

scheduleRouter.post('/assignments/:id/decline', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadAssignment(req, res);
  if (!got) return;
  const { me, a, slot, plan } = got;
  if (a.personId !== me) return fail(res, 403, 'NOT_YOURS', 'Only the person assigned may decline');
  if (plan.status !== 'PUBLISHED' || a.status !== 'ASSIGNED') return fail(res, 409, 'WRONG_STATE', 'This duty cannot be declined now');
  const parsed = z.object({ reason: z.string().trim().min(1).max(NOTE_MAX) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'REASON_REQUIRED', 'Please give a reason');
  await prisma.slotAssignment.update({ where: { id: a.id }, data: { status: 'DECLINED', declineReason: parsed.data.reason, respondedAt: new Date() } });
  const who = await names([me]);
  for (const to of new Set([slot.createdById, plan.createdById])) {
    if (to === me) continue;
    await notifySafely(prisma as never, {
      kind: 'WAITING_FOR_ME', toPersonId: to, systemId: slot.systemId,
      title: `${who.get(me) ?? 'Someone'} cannot serve: ${slot.title}`, body: parsed.data.reason,
      href: `/s/${slot.systemId}/schedule`, important: true, sourceKey: `sched-decline:${a.id}`,
    });
  }
  await audit(me, slot.systemId, 'SCHEDULE_DECLINED', `Declined ${a.role} on ${slot.title}`, { slotId: slot.id, assignmentId: a.id });
  res.json({ ok: true });
});

/** A planner puts someone else in a declined place; allowed even after the plan is published. */
scheduleRouter.post('/assignments/:id/replace', requireAuth, async (req: AuthedRequest, res) => {
  const got = await loadAssignment(req, res);
  if (!got) return;
  const { me, data, a, slot, plan } = got;
  if (!canWrite(me, slot.systemId, data)) return fail(res, 403, 'FORBIDDEN', 'You may not plan here');
  if (a.status !== 'DECLINED') return fail(res, 409, 'WRONG_STATE', 'Only a declined place can be replaced');
  const parsed = z.object({ personId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Choose a person');
  await prisma.slotAssignment.update({ where: { id: a.id }, data: { status: 'REPLACED' } });
  await addAssignment(slot, plan, me, parsed.data.personId, a.role, res);
});

async function movePlan(action: 'confirm' | 'publish' | 'reopen', req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const { data } = await loadAccessData(me);
  const plan = (await prisma.monthPlan.findUnique({ where: { id: String(req.params.id) } })) as PlanRow | null;
  if (!plan || !canSeePlan(plan.status, me, plan.systemId, data)) return fail(res, 404, 'NOT_FOUND', 'Plan not found');
  const allowed =
    action === 'confirm' ? canConfirm(me, plan.systemId, data)
    : action === 'publish' ? canPublish(me, plan.systemId, data)
    : canConfirm(me, plan.systemId, data) || canPublish(me, plan.systemId, data);
  if (!allowed) return fail(res, 403, 'FORBIDDEN', 'You may not do this');
  const slots = ((await prisma.scheduleSlot.findMany()) as SlotRow[]).filter((s) => s.planId === plan.id);
  const problem = moveProblem(action, plan, slots.length);
  if (problem) return fail(res, 409, problem, problem === 'EMPTY_PLAN' ? 'Add at least one slot first' : 'Not possible in this state');
  const now = new Date();
  if (action === 'confirm') {
    await prisma.monthPlan.update({ where: { id: plan.id }, data: { status: 'CONFIRMED', confirmedById: me, confirmedAt: now } });
  } else if (action === 'publish') {
    await prisma.monthPlan.update({ where: { id: plan.id }, data: { status: 'PUBLISHED', publishedById: me, publishedAt: now } });
    const asgs = ((await prisma.slotAssignment.findMany()) as AsgRow[]).filter((a) => a.status === 'ASSIGNED');
    for (const s of slots) for (const a of asgs.filter((x) => x.slotId === s.id)) await tellAssignee(a, s);
  } else {
    await prisma.monthPlan.update({ where: { id: plan.id }, data: { status: 'DRAFT', confirmedById: null, confirmedAt: null, publishedById: null, publishedAt: null } });
  }
  await audit(me, plan.systemId, `SCHEDULE_PLAN_${action.toUpperCase()}`, `${action} plan ${plan.month}`, { planId: plan.id });
  res.json({ ok: true });
}

for (const action of ['confirm', 'publish', 'reopen'] as const) {
  scheduleRouter.post(`/plans/:id/${action}`, requireAuth, (req: AuthedRequest, res) => movePlan(action, req, res));
}
