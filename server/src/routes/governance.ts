/**
 * Governance (slice 2.2): meetings in every unit (the Board is a Central Administration
 * meeting), the decision register, and decisions about work that become tasks.
 * Every answer comes from the letters engine; the server decides, the screens only show.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { notifySafely } from '../lib/notify.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import type { AccessData } from '../capabilities/engine.js';
import { loadSettings } from '../settings/store.js';
import {
  TEXT_MAX,
  TITLE_MAX,
  canRead,
  canWrite,
  dayStart,
  dueIsFuture,
  mayApprove,
  workProblem,
} from '../governance/rules.js';

export const governanceRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const iso = (v: Date | string | null | undefined) => (v ? (v instanceof Date ? v : new Date(v)).toISOString() : null);

interface MeetingRow {
  id: string; orgUnitId: string; systemId: string; typeCode: string; title: string; scheduledAt: Date | string;
  location?: string | null; agenda?: string | null; minutes?: string | null; attendeesJson?: string | null;
  status: string; createdById: string; heldAt?: Date | string | null; cancelledReason?: string | null;
}
interface DecisionRow {
  id: string; meetingId?: string | null; orgUnitId: string; systemId: string; title: string; detail?: string | null;
  status: string; createdById: string; createdAt: Date | string; decidedAt?: Date | string | null; decidedById?: string | null;
  rejectReason?: string | null; withdrawnReason?: string | null; ownerPersonId?: string | null; dueDate?: Date | string | null; taskId?: string | null;
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

const attendees = (m: MeetingRow): string[] => {
  try {
    const v = JSON.parse(m.attendeesJson ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

async function context(me: string) {
  const { data, units } = await loadAccessData(me);
  const settings = await loadSettings();
  return { data, units: units as UnitRow[], settings };
}

const typeName = (types: Array<{ code: string; name: string }>, code: string) => types.find((t) => t.code === code)?.name ?? code;

function shapeMeeting(m: MeetingRow, ctx: { data: AccessData; units: UnitRow[]; settings: Awaited<ReturnType<typeof loadSettings>> }, me: string, decisionCount = 0) {
  return {
    id: m.id,
    orgUnitId: m.orgUnitId,
    unitName: ctx.units.find((u) => u.id === m.orgUnitId)?.name ?? '',
    systemId: m.systemId,
    typeCode: m.typeCode,
    typeName: typeName(ctx.settings['meetings.types'], m.typeCode),
    title: m.title,
    scheduledAt: iso(m.scheduledAt),
    location: m.location ?? null,
    status: m.status,
    decisionCount,
    canWrite: canWrite(me, m.systemId, ctx.data),
  };
}

/* ───────────── what the forms may offer ───────────── */

governanceRouter.get('/options', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const ctx = await context(me);
  res.json({
    units: ctx.units
      .filter((u) => u.systemId && canWrite(me, u.systemId, ctx.data))
      .map((u) => ({ id: u.id, name: u.name, code: u.code ?? null, kind: u.kind ?? null, systemId: u.systemId! })),
    meetingTypes: ctx.settings['meetings.types'],
    limits: { titleMax: TITLE_MAX, textMax: TEXT_MAX },
  });
});

/* ───────────── meetings ───────────── */

governanceRouter.get('/meetings', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const ctx = await context(me);
  const unitId = typeof req.query.unitId === 'string' ? req.query.unitId : undefined;
  const systemId = typeof req.query.systemId === 'string' ? req.query.systemId : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const rows = (await prisma.meeting.findMany()) as MeetingRow[];
  const decisions = (await prisma.decision.findMany()) as DecisionRow[];
  const shown = rows
    .filter((m) => canRead(me, m.systemId, ctx.data))
    .filter((m) => !unitId || m.orgUnitId === unitId)
    .filter((m) => !systemId || m.systemId === systemId)
    .filter((m) => !status || m.status === status)
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
    .slice(0, 200);
  res.json({ meetings: shown.map((m) => shapeMeeting(m, ctx, me, decisions.filter((d) => d.meetingId === m.id).length)) });
});

governanceRouter.get('/meetings/:id', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const ctx = await context(me);
  const m = (await prisma.meeting.findUnique({ where: { id: String(req.params.id) } })) as MeetingRow | null;
  // A meeting you may not read looks exactly like one that does not exist.
  if (!m || !canRead(me, m.systemId, ctx.data)) return fail(res, 404, 'NOT_FOUND', 'Meeting not found');
  const decisions = ((await prisma.decision.findMany({ where: { meetingId: m.id } })) as DecisionRow[]).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const who = await names([...attendees(m), m.createdById, ...decisions.map((d) => d.createdById), ...decisions.map((d) => d.ownerPersonId)]);
  res.json({
    meeting: {
      ...shapeMeeting(m, ctx, me, decisions.length),
      agenda: m.agenda ?? '',
      minutes: m.minutes ?? '',
      createdByName: who.get(m.createdById) ?? '',
      heldAt: iso(m.heldAt),
      cancelledReason: m.cancelledReason ?? null,
      attendees: attendees(m).map((id) => ({ id, name: who.get(id) ?? id })),
    },
    decisions: decisions.map((d) => shapeDecision(d, ctx, me, who)),
  });
});

const meetingSchema = z.object({
  orgUnitId: z.string().min(1),
  typeCode: z.string().min(1),
  title: z.string().trim().max(TITLE_MAX).optional(),
  scheduledAt: z.string().min(8),
  location: z.string().trim().max(200).optional(),
  agenda: z.string().trim().max(TEXT_MAX).optional(),
});

governanceRouter.post('/meetings', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = meetingSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_REQUEST', 'Choose a unit, a kind of meeting and a time');
  const d = parsed.data;
  const me = req.auth!.personId;
  const ctx = await context(me);
  const unit = ctx.units.find((u) => u.id === d.orgUnitId);
  if (!unit) return fail(res, 404, 'UNIT_NOT_FOUND', 'Unit not found');
  if (!unit.systemId) return fail(res, 409, 'UNIT_HAS_NO_SYSTEM', 'This unit belongs to no system yet');
  if (!canWrite(me, unit.systemId, ctx.data)) return fail(res, 403, 'NOT_ALLOWED', 'You may not draft meetings for this unit');
  const type = ctx.settings['meetings.types'].find((t) => t.code === d.typeCode);
  if (!type) return fail(res, 400, 'BAD_TYPE', 'That kind of meeting is not in Settings');
  const at = new Date(d.scheduledAt);
  if (Number.isNaN(at.getTime())) return fail(res, 400, 'BAD_DATES', 'Give the date and time of the meeting');
  const row = (await prisma.meeting.create({
    data: {
      orgUnitId: unit.id,
      systemId: unit.systemId,
      typeCode: type.code,
      title: d.title || `${type.name}, ${unit.name}`,
      scheduledAt: at,
      location: d.location || null,
      agenda: d.agenda || null,
      status: 'PLANNED',
      createdById: me,
    },
  })) as MeetingRow;
  await audit(me, unit.systemId, 'MEETING_PLANNED', `Planned ${row.title}`, { meetingId: row.id, unitId: unit.id, typeCode: type.code });
  res.status(201).json({ meeting: { id: row.id } });
});

async function writableMeeting(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const ctx = await context(me);
  const m = (await prisma.meeting.findUnique({ where: { id: String(req.params.id) } })) as MeetingRow | null;
  if (!m || !canRead(me, m.systemId, ctx.data)) {
    fail(res, 404, 'NOT_FOUND', 'Meeting not found');
    return null;
  }
  if (!canWrite(me, m.systemId, ctx.data)) {
    fail(res, 403, 'NOT_ALLOWED', 'You may not change this meeting');
    return null;
  }
  return { me, m };
}

const heldSchema = z.object({
  minutes: z.string().trim().max(TEXT_MAX).optional(),
  attendeeIds: z.array(z.string().min(1)).max(300).optional(),
});

governanceRouter.post('/meetings/:id/held', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = heldSchema.safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 400, 'BAD_REQUEST', 'Check the minutes and who attended');
  const got = await writableMeeting(req, res);
  if (!got) return;
  const { me, m } = got;
  if (m.status !== 'PLANNED') return fail(res, 409, 'NOT_PLANNED', 'Only a planned meeting can be marked held');
  const ids = [...new Set(parsed.data.attendeeIds ?? [])];
  if (ids.length) {
    const found = (await prisma.person.findMany({ where: { id: { in: ids } } })) as Array<{ id: string }>;
    if (found.length !== ids.length) return fail(res, 400, 'UNKNOWN_ATTENDEE', 'Someone on the attendance list is not a known person');
  }
  await prisma.meeting.update({
    where: { id: m.id },
    data: { status: 'HELD', heldAt: new Date(), heldById: me, minutes: parsed.data.minutes || null, attendeesJson: JSON.stringify(ids) },
  });
  await audit(me, m.systemId, 'MEETING_HELD', `Marked ${m.title} held`, { meetingId: m.id, attendees: ids.length });
  res.json({ ok: true });
});

const reasonSchema = z.object({ reason: z.string().trim().min(3).max(300) });

governanceRouter.post('/meetings/:id/cancel', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = reasonSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_REQUEST', 'Say why the meeting is cancelled');
  const got = await writableMeeting(req, res);
  if (!got) return;
  const { me, m } = got;
  if (m.status !== 'PLANNED') return fail(res, 409, 'NOT_PLANNED', 'Only a planned meeting can be cancelled');
  await prisma.meeting.update({ where: { id: m.id }, data: { status: 'CANCELLED', cancelledReason: parsed.data.reason } });
  await audit(me, m.systemId, 'MEETING_CANCELLED', `Cancelled ${m.title}`, { meetingId: m.id, reason: parsed.data.reason });
  res.json({ ok: true });
});

/* ───────────── the decision register ───────────── */

function shapeDecision(d: DecisionRow, ctx: { data: AccessData; units: UnitRow[]; settings: unknown }, me: string, who: Map<string, string>, meetingTitle?: string | null) {
  const approval = d.status === 'DRAFT' ? mayApprove(me, d.systemId, d.createdById, ctx.data) : null;
  return {
    id: d.id,
    meetingId: d.meetingId ?? null,
    meetingTitle: meetingTitle ?? null,
    orgUnitId: d.orgUnitId,
    unitName: ctx.units.find((u) => u.id === d.orgUnitId)?.name ?? '',
    systemId: d.systemId,
    title: d.title,
    detail: d.detail ?? '',
    status: d.status,
    createdAt: iso(d.createdAt),
    authorName: who.get(d.createdById) ?? '',
    decidedAt: iso(d.decidedAt),
    decidedByName: d.decidedById ? (who.get(d.decidedById) ?? '') : null,
    rejectReason: d.rejectReason ?? null,
    owner: d.ownerPersonId ? { id: d.ownerPersonId, name: who.get(d.ownerPersonId) ?? '' } : null,
    dueDate: d.dueDate ? iso(d.dueDate)!.slice(0, 10) : null,
    taskId: d.taskId ?? null,
    canApprove: !!approval?.allowed,
    canWithdraw: d.status === 'DRAFT' && d.createdById === me,
  };
}

governanceRouter.get('/decisions', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const ctx = await context(me);
  const unitId = typeof req.query.unitId === 'string' ? req.query.unitId : undefined;
  const systemId = typeof req.query.systemId === 'string' ? req.query.systemId : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  const rows = ((await prisma.decision.findMany()) as DecisionRow[])
    .filter((d) => canRead(me, d.systemId, ctx.data))
    .filter((d) => !unitId || d.orgUnitId === unitId)
    .filter((d) => !systemId || d.systemId === systemId)
    .filter((d) => !status || d.status === status)
    .filter((d) => !q || d.title.toLowerCase().includes(q) || (d.detail ?? '').toLowerCase().includes(q))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 300);
  const meetings = (await prisma.meeting.findMany()) as MeetingRow[];
  const who = await names(rows.flatMap((d) => [d.createdById, d.decidedById, d.ownerPersonId]));
  res.json({
    decisions: rows.map((d) => shapeDecision(d, ctx, me, who, meetings.find((m) => m.id === d.meetingId)?.title ?? null)),
  });
});

const decisionSchema = z.object({
  meetingId: z.string().min(1).optional(),
  orgUnitId: z.string().min(1).optional(),
  title: z.string().trim().min(3).max(TITLE_MAX),
  detail: z.string().trim().max(TEXT_MAX).optional(),
  work: z.object({ ownerPersonId: z.string().optional(), dueDate: z.string().optional() }).optional(),
});

governanceRouter.post('/decisions', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_REQUEST', 'Give the decision a title and a unit or meeting');
  const d = parsed.data;
  const me = req.auth!.personId;
  const ctx = await context(me);
  let unitId = d.orgUnitId;
  let systemId: string | null = null;
  if (d.meetingId) {
    const m = (await prisma.meeting.findUnique({ where: { id: d.meetingId } })) as MeetingRow | null;
    if (!m || !canRead(me, m.systemId, ctx.data)) return fail(res, 404, 'NOT_FOUND', 'Meeting not found');
    if (m.status === 'CANCELLED') return fail(res, 409, 'MEETING_CANCELLED', 'A cancelled meeting takes no decisions');
    unitId = m.orgUnitId;
    systemId = m.systemId;
  } else {
    const unit = ctx.units.find((u) => u.id === unitId);
    if (!unit) return fail(res, 404, 'UNIT_NOT_FOUND', 'Unit not found');
    if (!unit.systemId) return fail(res, 409, 'UNIT_HAS_NO_SYSTEM', 'This unit belongs to no system yet');
    systemId = unit.systemId;
  }
  if (!canWrite(me, systemId, ctx.data)) return fail(res, 403, 'NOT_ALLOWED', 'You may not draft decisions here');
  const problem = workProblem(d.work);
  if (problem) return fail(res, 400, 'WORK_NEEDS_OWNER_AND_DATE', problem);
  let due: Date | null = null;
  if (d.work) {
    due = dayStart(d.work.dueDate!);
    if (!due || !dueIsFuture(due)) return fail(res, 400, 'BAD_DATES', 'Give a real date that is not in the past');
    const owner = (await prisma.person.findUnique({ where: { id: d.work.ownerPersonId! } })) as { status: string; archivedAt?: Date | null } | null;
    if (!owner) return fail(res, 404, 'PERSON_NOT_FOUND', 'Owner not found');
    if (owner.archivedAt || owner.status !== 'ACTIVE') return fail(res, 409, 'PERSON_NOT_ACTIVE', 'Only an active person can own a task');
  }
  const row = (await prisma.decision.create({
    data: {
      meetingId: d.meetingId ?? null,
      orgUnitId: unitId!,
      systemId,
      title: d.title,
      detail: d.detail || null,
      status: 'DRAFT',
      createdById: me,
      createdAt: new Date(),
      ownerPersonId: d.work?.ownerPersonId ?? null,
      dueDate: due,
    },
  })) as DecisionRow;
  await audit(me, systemId, 'DECISION_DRAFTED', `Drafted “${d.title}”`, { decisionId: row.id, meetingId: d.meetingId ?? null, work: !!d.work });
  res.status(201).json({ decision: { id: row.id } });
});

async function findDecision(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const ctx = await context(me);
  const d = (await prisma.decision.findUnique({ where: { id: String(req.params.id) } })) as DecisionRow | null;
  if (!d || !canRead(me, d.systemId, ctx.data)) {
    fail(res, 404, 'NOT_FOUND', 'Decision not found');
    return null;
  }
  return { me, d, ctx };
}

governanceRouter.post('/decisions/:id/approve', requireAuth, async (req: AuthedRequest, res) => {
  const got = await findDecision(req, res);
  if (!got) return;
  const { me, d, ctx } = got;
  if (d.status !== 'DRAFT') return fail(res, 409, 'NOT_DRAFT', 'Only a draft decision can be approved');
  const ok = mayApprove(me, d.systemId, d.createdById, ctx.data);
  if (!ok.allowed) {
    return ok.reason === 'OWN_ENTRY'
      ? fail(res, 403, 'OWN_ENTRY', 'Nobody approves their own decision')
      : fail(res, 403, 'NOT_ALLOWED', 'You may not approve decisions here');
  }
  const now = new Date();
  let taskId: string | null = null;
  if (d.ownerPersonId && d.dueDate) {
    const task = (await prisma.workTask.create({
      data: {
        title: d.title,
        description: d.detail ?? null,
        ownerPersonId: d.ownerPersonId,
        createdByPersonId: me,
        contextType: 'DECISION',
        contextId: d.id,
        contextLabel: d.title,
        systemId: d.systemId,
        status: 'TODO',
        dueDate: d.dueDate,
        startDate: now,
        visibility: 'MINISTRY',
      },
    })) as { id: string };
    taskId = task.id;
  }
  await prisma.decision.update({ where: { id: d.id }, data: { status: 'APPROVED', decidedAt: now, decidedById: me, taskId } });
  await audit(me, d.systemId, 'DECISION_APPROVED', `Approved “${d.title}”`, { decisionId: d.id, taskId });
  if (taskId && d.ownerPersonId) {
    await notifySafely(prisma as never, {
      kind: 'FOR_INFORMATION',
      toPersonId: d.ownerPersonId,
      systemId: d.systemId,
      title: 'A decision gave you a task',
      body: d.title.slice(0, 200),
      important: true,
      sourceKey: `decision-task:${d.id}`,
    });
  }
  res.json({ ok: true, taskId });
});

governanceRouter.post('/decisions/:id/reject', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = reasonSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_REQUEST', 'Say why it is not approved');
  const got = await findDecision(req, res);
  if (!got) return;
  const { me, d, ctx } = got;
  if (d.status !== 'DRAFT') return fail(res, 409, 'NOT_DRAFT', 'Only a draft decision can be turned down');
  const ok = mayApprove(me, d.systemId, d.createdById, ctx.data);
  if (!ok.allowed) {
    return ok.reason === 'OWN_ENTRY'
      ? fail(res, 403, 'OWN_ENTRY', 'You cannot turn down your own decision; withdraw it instead')
      : fail(res, 403, 'NOT_ALLOWED', 'You may not decide on decisions here');
  }
  await prisma.decision.update({ where: { id: d.id }, data: { status: 'REJECTED', decidedAt: new Date(), decidedById: me, rejectReason: parsed.data.reason } });
  await audit(me, d.systemId, 'DECISION_REJECTED', `Turned down “${d.title}”`, { decisionId: d.id, reason: parsed.data.reason });
  res.json({ ok: true });
});

governanceRouter.post('/decisions/:id/withdraw', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = reasonSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_REQUEST', 'Say why you are withdrawing it');
  const got = await findDecision(req, res);
  if (!got) return;
  const { me, d } = got;
  if (d.status !== 'DRAFT') return fail(res, 409, 'NOT_DRAFT', 'Only a draft decision can be withdrawn');
  if (d.createdById !== me) return fail(res, 403, 'NOT_ALLOWED', 'Only the author withdraws a draft');
  await prisma.decision.update({ where: { id: d.id }, data: { status: 'WITHDRAWN', withdrawnReason: parsed.data.reason } });
  await audit(me, d.systemId, 'DECISION_WITHDRAWN', `Withdrew “${d.title}”`, { decisionId: d.id, reason: parsed.data.reason });
  res.json({ ok: true });
});
