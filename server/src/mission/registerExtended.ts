import type { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authorizePerson } from '../policy/index.js';
import {
  pathParam,
  requireAuth,
  type AuthedRequest,
} from '../middleware/http.js';
import { toStoredVisibility } from './visibility.js';
import { parseStewardship } from './stewardshipJson.js';
import * as life from './lifecycle.js';

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function serializeProgram(p: {
  id: string;
  name: string;
  description: string;
  orgUnitId: string | null;
  ownerSystemId: string;
  visibility: string;
  status: string;
  programType: string | null;
  scheduleHint: string | null;
  parentProgramId: string | null;
  cohortLabel: string | null;
  createdByPersonId: string | null;
  approvedByPersonId: string | null;
  approvedAt: Date | null;
  stewardshipJson: string | null;
  stewardshipVersion: number;
  metaJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const meta = parseJsonObject(p.metaJson);
  const steward = parseStewardship(p.stewardshipJson);
  return {
    ...p,
    visibility: toStoredVisibility(p.visibility),
    approvedAt: p.approvedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    leaderPersonIds: (meta.leaderPersonIds as string[] | undefined) ?? undefined,
    roles: meta.roles,
    eligibility: meta.eligibility,
    ...steward,
  };
}

type MissionKind = 'PROGRAM' | 'EVENT' | 'TASK' | 'PROJECT';

/** Owning system of a mission resource, or null if it does not exist. */
async function ownerSystemOf(kind: MissionKind, id: string): Promise<string | null> {
  if (kind === 'PROGRAM') return (await prisma.program.findUnique({ where: { id } }))?.ownerSystemId ?? null;
  if (kind === 'EVENT') return (await prisma.churchEvent.findUnique({ where: { id } }))?.ownerSystemId ?? null;
  if (kind === 'PROJECT') return (await prisma.churchProject.findUnique({ where: { id } }))?.ownerSystemId ?? null;
  const t = await prisma.workTask.findUnique({ where: { id } });
  return t ? (t.systemId ?? 'sys-main') : null;
}

async function requireAuthz(
  req: AuthedRequest,
  kind: MissionKind,
  id: string,
  action: 'VIEW' | 'MANAGE',
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const systemId = await ownerSystemOf(kind, id);
  if (!systemId) return { ok: false, status: 404, error: `${kind} not found` };
  const d = await authorizePerson({
    personId: req.auth!.personId,
    systemId,
    resource: kind,
    action,
  });
  return d.allowed ? { ok: true } : { ok: false, status: 403, error: d.reason };
}

async function requireProgramManage(
  req: AuthedRequest,
  programId: string,
): Promise<
  | { ok: true; program: NonNullable<Awaited<ReturnType<typeof prisma.program.findUnique>>> }
  | { ok: false; status: number; error: string }
> {
  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) return { ok: false, status: 404, error: 'Program not found' };
  const decision = await authorizePerson({
    personId: req.auth!.personId,
    systemId: program.ownerSystemId,
    resource: 'PROGRAM',
    action: 'MANAGE',
  });
  if (!decision.allowed) return { ok: false, status: 403, error: decision.reason };
  return { ok: true, program };
}

export function registerMissionExtendedRoutes(router: Router) {
  /* ── Program lifecycle ── */

  const transitions: Array<{
    path: string;
    run: (id: string, req: AuthedRequest) => Promise<life.TransitionResult<unknown> | { ok: true; entity: unknown; gap?: number; openRequired?: number } | { ok: false; status: number; error: string }>;
  }> = [
    {
      path: '/programs/:id/submit',
      run: (id) => life.submitProgram(id),
    },
    {
      path: '/programs/:id/approve',
      run: (id, req) => life.approveProgram(id, req.auth!.personId),
    },
    {
      path: '/programs/:id/start',
      run: (id) => life.startProgram(id),
    },
    {
      path: '/programs/:id/pause',
      run: (id) => life.pauseProgram(id),
    },
    {
      path: '/programs/:id/begin-close',
      run: (id) => life.beginCloseProgram(id),
    },
    {
      path: '/programs/:id/abandon-close',
      run: (id) => life.abandonCloseProgram(id),
    },
  ];

  for (const t of transitions) {
    router.post(t.path, requireAuth, async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const gate = await requireProgramManage(req, id);
      if (!gate.ok) {
        // approve is leadership-gated inside lifecycle; still need VIEW at least
        if (t.path.endsWith('/approve')) {
          const program = await prisma.program.findUnique({ where: { id } });
          if (!program) {
            res.status(404).json({ error: 'Program not found' });
            return;
          }
          const view = await authorizePerson({
            personId: req.auth!.personId,
            systemId: program.ownerSystemId,
            resource: 'PROGRAM',
            action: 'VIEW',
          });
          if (!view.allowed) {
            res.status(403).json({ error: view.reason });
            return;
          }
        } else {
          res.status(gate.status).json({ error: gate.error });
          return;
        }
      }
      const result = await t.run(id, req);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      const entity = result.entity as Parameters<typeof serializeProgram>[0];
      res.json({
        program: serializeProgram(entity),
        ...('gap' in result && result.gap !== undefined ? { gap: result.gap } : {}),
        ...('openRequired' in result && result.openRequired !== undefined
          ? { openRequired: result.openRequired }
          : {}),
      });
    });
  }

  const endSchema = z.object({
    workSummary: z.string().min(1),
    moneySummary: z.string().min(1),
    leftoverDecision: z.string().min(1),
    leftoverNote: z.string().optional(),
    narrative: z.string().optional(),
    forceClose: z.boolean().optional(),
    forceReason: z.string().optional(),
    usedCost: z.number().optional(),
  });

  router.post(
    '/programs/:id/end',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const gate = await requireProgramManage(req, id);
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
        return;
      }
      const parsed = endSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
        return;
      }
      const result = await life.endProgram(id, {
        ...parsed.data,
        closedByPersonId: req.auth!.personId,
      });
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ program: serializeProgram(result.entity!) });
    },
  );

  const stewardSchema = z.object({
    expectedVersion: z.number().int().optional(),
    patch: z.record(z.string(), z.unknown()),
  });

  router.patch(
    '/programs/:id/stewardship',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const gate = await requireProgramManage(req, id);
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
        return;
      }
      const parsed = stewardSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
        return;
      }
      const result = await life.patchProgramStewardship(
        id,
        parsed.data.patch as Parameters<typeof life.patchProgramStewardship>[1],
        parsed.data.expectedVersion,
      );
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ program: serializeProgram(result.entity!) });
    },
  );

  /* ── Activities / enrollments / attendance ── */

  router.get(
    '/programs/:id/activities',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const program = await prisma.program.findUnique({ where: { id } });
      if (!program) {
        res.status(404).json({ error: 'Program not found' });
        return;
      }
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: program.ownerSystemId,
        resource: 'PROGRAM',
        action: 'VIEW',
      });
      if (!decision.allowed) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      const activities = await prisma.programActivity.findMany({
        where: { programId: id },
        orderBy: { startsAt: 'asc' },
      });
      res.json({
        activities: activities.map((a) => ({
          id: a.id,
          programId: a.programId,
          title: a.title,
          startsAt: a.startsAt.toISOString(),
          endsAt: a.endsAt?.toISOString() ?? undefined,
          location: a.location ?? undefined,
          sessionClosedAt: a.sessionClosedAt?.toISOString() ?? undefined,
        })),
      });
    },
  );

  const activityCreateSchema = z.object({
    title: z.string().min(1),
    startsAt: z.string().min(1),
    endsAt: z.string().optional(),
    location: z.string().optional(),
  });

  router.post(
    '/programs/:id/activities',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const gate = await requireProgramManage(req, id);
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
        return;
      }
      const parsed = activityCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
        return;
      }
      const activity = await prisma.programActivity.create({
        data: {
          programId: id,
          title: parsed.data.title,
          startsAt: new Date(parsed.data.startsAt),
          endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : undefined,
          location: parsed.data.location,
        },
      });
      res.status(201).json({
        activity: {
          id: activity.id,
          programId: activity.programId,
          title: activity.title,
          startsAt: activity.startsAt.toISOString(),
          endsAt: activity.endsAt?.toISOString() ?? undefined,
          location: activity.location ?? undefined,
        },
      });
    },
  );

  router.get(
    '/programs/:id/enrollments',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const program = await prisma.program.findUnique({ where: { id } });
      if (!program) {
        res.status(404).json({ error: 'Program not found' });
        return;
      }
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: program.ownerSystemId,
        resource: 'PROGRAM',
        action: 'VIEW',
      });
      if (!decision.allowed) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      const enrollments = await prisma.programEnrollment.findMany({
        where: { programId: id },
        orderBy: { enrolledOn: 'desc' },
      });
      res.json({
        enrollments: enrollments.map((e) => ({
          id: e.id,
          programId: e.programId,
          personId: e.personId,
          role: e.role,
          roleKey: e.roleKey ?? undefined,
          status: e.status,
          enrolledOn: e.enrolledOn.toISOString().slice(0, 10),
          endedOn: e.endedOn?.toISOString().slice(0, 10),
          completedOn: e.completedOn?.toISOString().slice(0, 10),
        })),
      });
    },
  );

  const enrollSchema = z.object({
    personId: z.string().min(1),
    role: z.enum(['LEADER', 'PARTICIPANT']).optional(),
    roleKey: z.string().optional(),
  });

  router.post(
    '/programs/:id/enrollments',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const gate = await requireProgramManage(req, id);
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
        return;
      }
      if (gate.program.status !== 'ACTIVE' && gate.program.status !== 'SETUP') {
        res.status(400).json({ error: 'Program must be ACTIVE (or SETUP) to enroll' });
        return;
      }
      const parsed = enrollSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
        return;
      }
      try {
        const enrollment = await prisma.programEnrollment.create({
          data: {
            programId: id,
            personId: parsed.data.personId,
            role: parsed.data.role ?? 'PARTICIPANT',
            roleKey: parsed.data.roleKey,
          },
        });
        res.status(201).json({
          enrollment: {
            id: enrollment.id,
            programId: enrollment.programId,
            personId: enrollment.personId,
            role: enrollment.role,
            roleKey: enrollment.roleKey ?? undefined,
            status: enrollment.status,
            enrolledOn: enrollment.enrolledOn.toISOString().slice(0, 10),
          },
        });
      } catch {
        res.status(409).json({ error: 'Already enrolled' });
      }
    },
  );

  const attendanceSchema = z.object({
    personId: z.string().min(1),
    status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
  });

  router.get(
    '/activities/:id/attendance',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const activity = await prisma.programActivity.findUnique({
        where: { id },
        include: { program: true },
      });
      if (!activity) {
        res.status(404).json({ error: 'Activity not found' });
        return;
      }
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: activity.program.ownerSystemId,
        resource: 'PROGRAM',
        action: 'VIEW',
      });
      if (!decision.allowed) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      const rows = await prisma.activityAttendance.findMany({
        where: { activityId: id },
      });
      res.json({
        attendance: rows.map((a) => ({
          id: a.id,
          activityId: a.activityId,
          personId: a.personId,
          status: a.status,
          recordedAt: a.recordedAt.toISOString(),
        })),
      });
    },
  );

  router.post(
    '/activities/:id/attendance',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const activity = await prisma.programActivity.findUnique({
        where: { id },
        include: { program: true },
      });
      if (!activity) {
        res.status(404).json({ error: 'Activity not found' });
        return;
      }
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: activity.program.ownerSystemId,
        resource: 'PROGRAM',
        action: 'MANAGE',
      });
      if (!decision.allowed) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      if (activity.sessionClosedAt) {
        res.status(400).json({ error: 'Session is closed' });
        return;
      }
      const parsed = attendanceSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
        return;
      }
      const row = await prisma.activityAttendance.upsert({
        where: {
          activityId_personId: {
            activityId: id,
            personId: parsed.data.personId,
          },
        },
        create: {
          activityId: id,
          personId: parsed.data.personId,
          status: parsed.data.status,
        },
        update: {
          status: parsed.data.status,
          recordedAt: new Date(),
        },
      });
      res.json({
        attendance: {
          id: row.id,
          activityId: row.activityId,
          personId: row.personId,
          status: row.status,
          recordedAt: row.recordedAt.toISOString(),
        },
      });
    },
  );

  /* ── Project / event / task transitions ── */

  router.post(
    '/projects/:id/submit',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const project = await prisma.churchProject.findUnique({ where: { id } });
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: project.ownerSystemId,
        resource: 'PROJECT',
        action: 'MANAGE',
      });
      if (!decision.allowed) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      const result = await life.submitProject(id);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ project: result.entity });
    },
  );

  router.post(
    '/projects/:id/start',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const project = await prisma.churchProject.findUnique({ where: { id } });
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: project.ownerSystemId,
        resource: 'PROJECT',
        action: 'MANAGE',
      });
      if (!decision.allowed) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      const forceSpendGap = req.body?.forceSpendGap === true;
      const forceReason =
        typeof req.body?.forceReason === 'string'
          ? req.body.forceReason
          : undefined;
      const result = await life.startProject(id, {
        forceSpendGap,
        forceReason,
      });
      if (!result.ok) {
        res.status(result.status).json({
          error: result.error,
          gap: 'gap' in result ? result.gap : undefined,
        });
        return;
      }
      res.json({
        project: result.entity,
        gap: result.gap,
        openRequired: result.openRequired,
      });
    },
  );

  router.patch(
    '/projects/:id/stewardship',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const project = await prisma.churchProject.findUnique({ where: { id } });
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: project.ownerSystemId,
        resource: 'PROJECT',
        action: 'MANAGE',
      });
      if (!decision.allowed) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      const parsed = stewardSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
        return;
      }
      const result = await life.patchProjectStewardship(
        id,
        parsed.data.patch as Parameters<typeof life.patchProjectStewardship>[1],
        parsed.data.expectedVersion,
      );
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ project: result.entity });
    },
  );

  const eventPatchSchema = z.object({
    status: z.string().optional(),
    lifecyclePhase: z.enum(['PREPARE', 'DELIVER', 'CLOSE']).optional(),
  });

  router.patch(
    '/events/:id',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const event = await prisma.churchEvent.findUnique({ where: { id } });
      if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: event.ownerSystemId,
        resource: 'EVENT',
        action: 'MANAGE',
      });
      if (!decision.allowed) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      const parsed = eventPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
        return;
      }
      if (
        parsed.data.status &&
        event.status === 'PENDING_APPROVAL' &&
        parsed.data.status !== 'PENDING_APPROVAL' &&
        parsed.data.status !== 'CANCELLED'
      ) {
        res.status(409).json({
          error: 'Awaiting approval — use the approval chain, not a status edit',
        });
        return;
      }
      const result = await life.setEventStatus(id, parsed.data);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ event: result.entity });
    },
  );

  const taskStatusSchema = z.object({
    status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']),
  });

  router.patch(
    '/tasks/:id',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const task = await prisma.workTask.findUnique({ where: { id } });
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      const sid = task.systemId ?? 'sys-main';
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: sid,
        resource: 'TASK',
        action: 'MANAGE',
      });
      const isOwner = task.ownerPersonId === req.auth!.personId;
      if (!decision.allowed && !isOwner) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      const parsed = taskStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
        return;
      }
      const result = await life.setTaskStatus(id, parsed.data.status);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ task: result.entity });
    },
  );

  /* ── Event registrations + mission shares ── */

  const regSchema = z.object({
    personId: z.string().min(1),
      status: z
      .enum(['REGISTERED', 'WAITLIST', 'CANCELLED', 'ATTENDED', 'NO_SHOW'])
      .optional(),
  });

  router.get(
    '/events/:id/registrations',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const event = await prisma.churchEvent.findUnique({ where: { id } });
      if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: event.ownerSystemId,
        resource: 'EVENT',
        action: 'VIEW',
      });
      if (!decision.allowed) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      const registrations = await prisma.eventRegistration.findMany({
        where: { eventId: id },
      });
      const { mapRegistration, expireAndPromote } = await import(
        '../mission/eventRegistrations.js'
      );
      await expireAndPromote(id);
      const fresh = await prisma.eventRegistration.findMany({
        where: { eventId: id },
      });
      res.json({
        registrations: fresh.map(mapRegistration),
      });
    },
  );

  router.post(
    '/events/:id/registrations',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const event = await prisma.churchEvent.findUnique({ where: { id } });
      if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: event.ownerSystemId,
        resource: 'EVENT',
        action: 'MANAGE',
      });
      const selfReg = req.body?.personId === req.auth!.personId;
      if (!decision.allowed && !selfReg) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      if (!decision.allowed) {
        // Self-registration: only for events the person may actually see.
        const publicEvent = ['GENERAL', 'CHURCH'].includes(String(event.visibility));
        const canSee = publicEvent
          ? { allowed: true }
          : await authorizePerson({
              personId: req.auth!.personId,
              systemId: event.ownerSystemId,
              resource: 'EVENT',
              action: 'VIEW',
            });
        if (!canSee.allowed) {
          res.status(403).json({ error: 'You cannot register for this event' });
          return;
        }
      }
      const parsed = regSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
        return;
      }
      // Only event managers may set a status; self-registration is always REGISTERED.
      let status = decision.allowed ? (parsed.data.status ?? 'REGISTERED') : 'REGISTERED';
      const { expireAndPromote, mapRegistration } = await import(
        '../mission/eventRegistrations.js'
      );
      await expireAndPromote(id);
      if (event.capacity != null && status === 'REGISTERED') {
        const count = await prisma.eventRegistration.count({
          where: { eventId: id, status: { in: ['REGISTERED', 'ATTENDED'] } },
        });
        if (count >= event.capacity) status = 'WAITLIST';
      }
      try {
        const registration = await prisma.eventRegistration.create({
          data: {
            eventId: id,
            personId: parsed.data.personId,
            status,
          },
        });
        res.status(201).json({
          registration: mapRegistration(registration),
        });
      } catch {
        res.status(409).json({ error: 'Already registered' });
      }
    },
  );

  router.post(
    '/events/:id/registrations/cancel',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const event = await prisma.churchEvent.findUnique({ where: { id } });
      if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }
      const personId =
        typeof req.body?.personId === 'string'
          ? req.body.personId
          : req.auth!.personId;
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: event.ownerSystemId,
        resource: 'EVENT',
        action: 'MANAGE',
      });
      const selfCancel = personId === req.auth!.personId;
      if (!decision.allowed && !selfCancel) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      const { cancelRegistration } = await import(
        '../mission/eventRegistrations.js'
      );
      const result = await cancelRegistration(id, personId);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({
        registration: result.registration,
        promoted: result.promoted,
      });
    },
  );

  const shareSchema = z.object({
    kind: z.enum(['PROGRAM', 'EVENT', 'TASK', 'PROJECT']),
    resourceId: z.string().min(1),
    personId: z.string().min(1),
    action: z.enum(['VIEW', 'MANAGE']).optional(),
    reason: z.string().optional(),
    endDate: z.string().optional(),
  });

  router.post('/shares', requireAuth, async (req: AuthedRequest, res) => {
    const parsed = shareSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }
    const gate = await requireAuthz(req, parsed.data.kind, parsed.data.resourceId, 'MANAGE');
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.error });
      return;
    }
    const share = await prisma.missionShare.create({
      data: {
        kind: parsed.data.kind,
        resourceId: parsed.data.resourceId,
        personId: parsed.data.personId,
        action: parsed.data.action ?? 'VIEW',
        grantedByPersonId: req.auth!.personId,
        reason: parsed.data.reason,
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
      },
    });
    res.status(201).json({
      share: {
        id: share.id,
        kind: share.kind,
        resourceId: share.resourceId,
        personId: share.personId,
        action: share.action,
        grantedByPersonId: share.grantedByPersonId,
        reason: share.reason ?? undefined,
        status: share.status,
        startDate: share.startDate.toISOString().slice(0, 10),
        endDate: share.endDate?.toISOString().slice(0, 10),
      },
    });
  });

  router.get('/shares', requireAuth, async (req: AuthedRequest, res) => {
    const kind =
      typeof req.query.kind === 'string' ? req.query.kind : undefined;
    const resourceId =
      typeof req.query.resourceId === 'string' ? req.query.resourceId : undefined;
    const personId =
      typeof req.query.personId === 'string' ? req.query.personId : undefined;
    const me = req.auth!.personId;
    if (kind && resourceId) {
      const gate = await requireAuthz(req, kind as MissionKind, resourceId, 'MANAGE');
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
        return;
      }
    } else if (personId !== me) {
      // Without a specific resource you may only list your own shares.
      res.status(403).json({ error: 'Specify kind + resourceId you manage, or list your own shares' });
      return;
    }
    const shares = await prisma.missionShare.findMany({
      where: {
        ...(kind ? { kind } : {}),
        ...(resourceId ? { resourceId } : {}),
        ...(personId ? { personId } : {}),
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      shares: shares.map((s) => ({
        id: s.id,
        kind: s.kind,
        resourceId: s.resourceId,
        personId: s.personId,
        action: s.action,
        grantedByPersonId: s.grantedByPersonId,
        reason: s.reason ?? undefined,
        status: s.status,
        startDate: s.startDate.toISOString().slice(0, 10),
        endDate: s.endDate?.toISOString().slice(0, 10),
      })),
    });
  });

  /* ── Approval chains + project close-out ── */

  router.get(
    '/projects/:id/approvals',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const gate = await requireAuthz(req, 'PROJECT', id, 'VIEW');
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
        return;
      }
      const result = await life.getApprovalChainFor('PROJECT', id);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json(result);
    },
  );

  router.post(
    '/projects/:id/approve-level',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      const levelKey =
        typeof req.body?.levelKey === 'string' ? req.body.levelKey : '';
      if (!id || !levelKey) {
        res.status(400).json({ error: 'Missing id or levelKey' });
        return;
      }
      const project = await prisma.churchProject.findUnique({ where: { id } });
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: project.ownerSystemId,
        resource: 'PROJECT',
        action: 'VIEW',
      });
      if (!decision.allowed) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      const result = await life.approveProjectLevel({
        projectId: id,
        levelKey,
        personId: req.auth!.personId,
      });
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ project: result.entity, approvals: result.approvals });
    },
  );

  router.post(
    '/projects/:id/approve',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const result = await life.approveProjectSimple(id, req.auth!.personId);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ project: result.entity });
    },
  );

  router.post(
    '/projects/:id/begin-close',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const project = await prisma.churchProject.findUnique({ where: { id } });
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: project.ownerSystemId,
        resource: 'PROJECT',
        action: 'MANAGE',
      });
      if (!decision.allowed) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      const result = await life.beginCloseProject(id);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ project: result.entity });
    },
  );

  router.post(
    '/projects/:id/complete',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const project = await prisma.churchProject.findUnique({ where: { id } });
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: project.ownerSystemId,
        resource: 'PROJECT',
        action: 'MANAGE',
      });
      if (!decision.allowed) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      const parsed = endSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid body',
          details: parsed.error.flatten(),
        });
        return;
      }
      const result = await life.completeProject(id, {
        ...parsed.data,
        closedByPersonId: req.auth!.personId,
      });
      if (!result.ok) {
        res.status(result.status).json({
          error: result.error,
          ...('openTasks' in result ? { openTasks: result.openTasks } : {}),
        });
        return;
      }
      res.json({ project: result.entity });
    },
  );

  router.post(
    '/projects/:id/cancel',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const project = await prisma.churchProject.findUnique({ where: { id } });
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: project.ownerSystemId,
        resource: 'PROJECT',
        action: 'MANAGE',
      });
      if (!decision.allowed) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      const result = await life.cancelProject(id);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ project: result.entity });
    },
  );

  router.get(
    '/events/:id/approvals',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const gate = await requireAuthz(req, 'EVENT', id, 'VIEW');
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
        return;
      }
      const result = await life.getApprovalChainFor('EVENT', id);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json(result);
    },
  );

  router.post(
    '/events/:id/approve-level',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      const levelKey =
        typeof req.body?.levelKey === 'string' ? req.body.levelKey : '';
      if (!id || !levelKey) {
        res.status(400).json({ error: 'Missing id or levelKey' });
        return;
      }
      const event = await prisma.churchEvent.findUnique({ where: { id } });
      if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: event.ownerSystemId,
        resource: 'EVENT',
        action: 'VIEW',
      });
      if (!decision.allowed) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      const result = await life.approveEventLevel({
        eventId: id,
        levelKey,
        personId: req.auth!.personId,
      });
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ event: result.entity, approvals: result.approvals });
    },
  );

  function parseCollab(raw: string | null | undefined): string[] {
    if (!raw) return [];
    try {
      const v = JSON.parse(raw) as unknown;
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return [];
    }
  }

  const collabSchema = z.object({
    collaboratorSystemIds: z.array(z.string()).optional(),
    collaboratorPersonIds: z.array(z.string()).optional(),
    addSystemId: z.string().optional(),
    addPersonId: z.string().optional(),
  });

  router.patch(
    '/events/:id/collaborators',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const event = await prisma.churchEvent.findUnique({ where: { id } });
      if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: event.ownerSystemId,
        resource: 'EVENT',
        action: 'MANAGE',
      });
      if (!decision.allowed) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      const parsed = collabSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid body' });
        return;
      }
      let sysIds = parseCollab(event.collaboratorSystemIds);
      let personIds = parseCollab(event.collaboratorPersonIds);
      if (parsed.data.collaboratorSystemIds) {
        sysIds = parsed.data.collaboratorSystemIds.filter(
          (s) => s !== event.ownerSystemId,
        );
      }
      if (parsed.data.collaboratorPersonIds) {
        personIds = parsed.data.collaboratorPersonIds;
      }
      if (parsed.data.addSystemId && parsed.data.addSystemId !== event.ownerSystemId) {
        sysIds = [...new Set([...sysIds, parsed.data.addSystemId])];
      }
      if (parsed.data.addPersonId) {
        personIds = [...new Set([...personIds, parsed.data.addPersonId])];
      }
      const updated = await prisma.churchEvent.update({
        where: { id },
        data: {
          collaboratorSystemIds: JSON.stringify(sysIds),
          collaboratorPersonIds: JSON.stringify(personIds),
        },
      });
      res.json({
        event: {
          ...updated,
          collaboratorSystemIds: sysIds,
          collaboratorPersonIds: personIds,
        },
      });
    },
  );

  router.patch(
    '/projects/:id/collaborators',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const project = await prisma.churchProject.findUnique({ where: { id } });
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: project.ownerSystemId,
        resource: 'PROJECT',
        action: 'MANAGE',
      });
      if (!decision.allowed) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      const parsed = collabSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid body' });
        return;
      }
      let sysIds = parseCollab(project.collaboratorSystemIds);
      let personIds = parseCollab(project.collaboratorPersonIds);
      if (parsed.data.collaboratorSystemIds) {
        sysIds = parsed.data.collaboratorSystemIds.filter(
          (s) => s !== project.ownerSystemId,
        );
      }
      if (parsed.data.collaboratorPersonIds) {
        personIds = parsed.data.collaboratorPersonIds;
      }
      if (
        parsed.data.addSystemId &&
        parsed.data.addSystemId !== project.ownerSystemId
      ) {
        sysIds = [...new Set([...sysIds, parsed.data.addSystemId])];
      }
      if (parsed.data.addPersonId) {
        personIds = [...new Set([...personIds, parsed.data.addPersonId])];
      }
      const updated = await prisma.churchProject.update({
        where: { id },
        data: {
          collaboratorSystemIds: JSON.stringify(sysIds),
          collaboratorPersonIds: JSON.stringify(personIds),
        },
      });
      res.json({
        project: {
          ...updated,
          collaboratorSystemIds: sysIds,
          collaboratorPersonIds: personIds,
        },
      });
    },
  );

  const attendSchema = z.object({
    personId: z.string().min(1),
    attended: z.boolean(),
  });

  router.post(
    '/events/:id/attendance',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const event = await prisma.churchEvent.findUnique({ where: { id } });
      if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: event.ownerSystemId,
        resource: 'EVENT',
        action: 'MANAGE',
      });
      if (!decision.allowed) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      const parsed = attendSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid body' });
        return;
      }
      const status = parsed.data.attended ? 'ATTENDED' : 'NO_SHOW';
      const registration = await prisma.eventRegistration.upsert({
        where: {
          eventId_personId: {
            eventId: id,
            personId: parsed.data.personId,
          },
        },
        create: {
          eventId: id,
          personId: parsed.data.personId,
          status,
          attendedAt: parsed.data.attended ? new Date() : undefined,
        },
        update: {
          status,
          attendedAt: parsed.data.attended ? new Date() : null,
        },
      });
      const { mapRegistration: mapReg } = await import(
        '../mission/eventRegistrations.js'
      );
      res.json({
        registration: mapReg(registration),
      });
    },
  );

  router.post(
    '/events/:id/complete',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const event = await prisma.churchEvent.findUnique({ where: { id } });
      if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: event.ownerSystemId,
        resource: 'EVENT',
        action: 'MANAGE',
      });
      if (!decision.allowed) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      if (event.status === 'COMPLETED' || event.status === 'CANCELLED') {
        res.status(400).json({ error: 'Already closed' });
        return;
      }
      const { markRemainingNoShows } = await import(
        '../mission/eventRegistrations.js'
      );
      await markRemainingNoShows(id);
      const updated = await prisma.churchEvent.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          lifecyclePhase: 'CLOSE',
        },
      });
      res.json({ event: updated });
    },
  );

  const nextStepsSchema = z.object({
    personId: z.string().min(1),
    enrollProgramId: z.string().optional(),
    addMembershipType: z.string().optional(),
    membershipLabel: z.string().optional(),
    createFollowUpTask: z
      .object({
        title: z.string().min(1),
        ownerPersonId: z.string().min(1),
      })
      .optional(),
  });

  router.post(
    '/events/:id/next-steps',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const event = await prisma.churchEvent.findUnique({ where: { id } });
      if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: event.ownerSystemId,
        resource: 'EVENT',
        action: 'MANAGE',
      });
      if (!decision.allowed) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      const parsed = nextStepsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
        return;
      }
      const out: Record<string, unknown> = { ok: true };

      if (parsed.data.enrollProgramId) {
        try {
          await prisma.programEnrollment.create({
            data: {
              programId: parsed.data.enrollProgramId,
              personId: parsed.data.personId,
              role: 'PARTICIPANT',
            },
          });
          out.enrolled = true;
        } catch {
          out.enrolled = 'already';
        }
      }

      if (parsed.data.addMembershipType) {
        const membership = await prisma.membership.create({
          data: {
            personId: parsed.data.personId,
            systemId: 'sys-main',
            type: parsed.data.addMembershipType,
            label:
              parsed.data.membershipLabel ?? parsed.data.addMembershipType,
            status: 'ACTIVE',
          },
        });
        out.membershipId = membership.id;
      }

      if (parsed.data.createFollowUpTask) {
        const task = await prisma.workTask.create({
          data: {
            title: parsed.data.createFollowUpTask.title,
            ownerPersonId: parsed.data.createFollowUpTask.ownerPersonId,
            createdByPersonId: req.auth!.personId,
            systemId: event.ownerSystemId,
            visibility: event.visibility,
            contextType: 'EVENT',
            contextId: event.id,
            contextLabel: event.name,
            status: 'TODO',
          },
        });
        out.taskId = task.id;
      }

      res.json(out);
    },
  );

  // ─── W2: Pulse + Session Mode + money hooks ───

  router.get(
    '/programs/:id/pulse',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const program = await prisma.program.findUnique({ where: { id } });
      if (!program) {
        res.status(404).json({ error: 'Program not found' });
        return;
      }
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: program.ownerSystemId,
        resource: 'PROGRAM',
        action: 'VIEW',
      });
      if (!decision.allowed) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      const now = new Date();
      const next = await prisma.programActivity.findFirst({
        where: {
          programId: id,
          sessionClosedAt: null,
        },
        orderBy: { startsAt: 'asc' },
      });
      const enrollments = await prisma.programEnrollment.count({
        where: { programId: id, status: 'ACTIVE' },
      });
      const { buildPulseFromStewardship } = await import('../mission/health.js');
      const {
        parseStewardship,
        serializeStewardship,
        upsertHealthSnapshot,
      } = await import('../mission/stewardshipJson.js');
      const pulse = buildPulseFromStewardship({
        kind: 'PROGRAM',
        id: program.id,
        name: program.name,
        status: program.status,
        stewardshipJson: program.stewardshipJson,
        enrollmentCount: enrollments,
        nextSession: next
          ? {
              id: next.id,
              title: next.title,
              startsAt: next.startsAt.toISOString(),
              sessionClosedAt: next.sessionClosedAt?.toISOString(),
            }
          : null,
        scheduleScore: next
          ? next.startsAt.getTime() < now.getTime() - 86400000
            ? 35
            : 85
          : undefined,
      });
      const today = now.toISOString().slice(0, 10);
      const s = parseStewardship(program.stewardshipJson);
      const already = (s.healthSnapshots ?? []).some((h) => h.date === today);
      if (!already && program.status !== 'ENDED') {
        const nextS = upsertHealthSnapshot(s, {
          date: today,
          score: pulse.health.score,
          tone: pulse.health.tone,
          label: pulse.health.label,
          parts: pulse.health.parts,
        });
        await prisma.program.update({
          where: { id },
          data: { stewardshipJson: serializeStewardship(nextS) },
        });
        pulse.healthSnapshots = (nextS.healthSnapshots ?? [])
          .filter(
            (h): h is { date: string; score: number; tone: string; label: string } =>
              typeof h.date === 'string' &&
              typeof h.score === 'number' &&
              typeof h.tone === 'string' &&
              typeof h.label === 'string',
          )
          .slice(-14);
      }
      res.json({ pulse });
    },
  );

  router.get(
    '/projects/:id/pulse',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const project = await prisma.churchProject.findUnique({ where: { id } });
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const decision = await authorizePerson({
        personId: req.auth!.personId,
        systemId: project.ownerSystemId,
        resource: 'PROJECT',
        action: 'VIEW',
      });
      if (!decision.allowed) {
        res.status(403).json({ error: decision.reason });
        return;
      }
      const { buildPulseFromStewardship } = await import('../mission/health.js');
      const {
        parseStewardship,
        serializeStewardship,
        upsertHealthSnapshot,
      } = await import('../mission/stewardshipJson.js');
      const pulse = buildPulseFromStewardship({
        kind: 'PROJECT',
        id: project.id,
        name: project.name,
        status: project.status,
        stewardshipJson: project.stewardshipJson,
      });
      const today = new Date().toISOString().slice(0, 10);
      const s = parseStewardship(project.stewardshipJson);
      const already = (s.healthSnapshots ?? []).some((h) => h.date === today);
      if (!already && project.status !== 'DONE' && project.status !== 'CANCELLED') {
        const nextS = upsertHealthSnapshot(s, {
          date: today,
          score: pulse.health.score,
          tone: pulse.health.tone,
          label: pulse.health.label,
          parts: pulse.health.parts,
        });
        await prisma.churchProject.update({
          where: { id },
          data: { stewardshipJson: serializeStewardship(nextS) },
        });
        pulse.healthSnapshots = (nextS.healthSnapshots ?? [])
          .filter(
            (h): h is { date: string; score: number; tone: string; label: string } =>
              typeof h.date === 'string' &&
              typeof h.score === 'number' &&
              typeof h.tone === 'string' &&
              typeof h.label === 'string',
          )
          .slice(-14);
      }
      res.json({ pulse });
    },
  );

  router.post(
    '/activities/:id/close',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const id = pathParam(req, 'id');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const activity = await prisma.programActivity.findUnique({
        where: { id },
      });
      if (!activity) {
        res.status(404).json({ error: 'Activity not found' });
        return;
      }
      const gate = await requireProgramManage(req, activity.programId);
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
        return;
      }
      const { closeActivitySession } = await import('../mission/moneyHooks.js');
      const result = await closeActivitySession(id, {
        completeLinkedDelivery: req.body?.completeLinkedDelivery !== false,
      });
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({
        activity: {
          id: result.activity.id,
          programId: result.activity.programId,
          title: result.activity.title,
          startsAt: result.activity.startsAt.toISOString(),
          sessionClosedAt: result.activity.sessionClosedAt?.toISOString(),
        },
        alreadyClosed: result.alreadyClosed,
        deliveryCompleted: result.deliveryCompleted,
      });
    },
  );

  const giftSchema = z.object({
    amount: z.number().positive(),
    label: z.string().min(1),
    fundId: z.string().min(1),
    donationId: z.string().min(1),
    programId: z.string().optional(),
    projectId: z.string().optional(),
    note: z.string().optional(),
  });

  router.post(
    '/stewardship/designated-gift',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const parsed = giftSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
        return;
      }
      if (!parsed.data.programId && !parsed.data.projectId) {
        res.status(400).json({ error: 'programId or projectId required' });
        return;
      }
      for (const [kind, rid] of [
        ['PROGRAM', parsed.data.programId],
        ['PROJECT', parsed.data.projectId],
      ] as const) {
        if (!rid) continue;
        const gate = await requireAuthz(req, kind, rid, 'MANAGE');
        if (!gate.ok) {
          res.status(gate.status).json({ error: gate.error });
          return;
        }
      }
      const giftFund = await prisma.fund.findUnique({ where: { id: parsed.data.fundId } });
      if (!giftFund) {
        res.status(404).json({ error: 'Fund not found' });
        return;
      }
      const { applyDesignatedGiftToStewardship } = await import(
        '../mission/moneyHooks.js'
      );
      const results = [];
      if (parsed.data.programId) {
        const r = await applyDesignatedGiftToStewardship({
          kind: 'PROGRAM',
          id: parsed.data.programId,
          amount: parsed.data.amount,
          label: parsed.data.label,
          fundId: parsed.data.fundId,
          donationId: parsed.data.donationId,
          personId: req.auth!.personId,
          note: parsed.data.note,
        });
        results.push({ kind: 'PROGRAM', ...r });
      }
      if (parsed.data.projectId) {
        const r = await applyDesignatedGiftToStewardship({
          kind: 'PROJECT',
          id: parsed.data.projectId,
          amount: parsed.data.amount,
          label: parsed.data.label,
          fundId: parsed.data.fundId,
          donationId: parsed.data.donationId,
          personId: req.auth!.personId,
          note: parsed.data.note,
        });
        results.push({ kind: 'PROJECT', ...r });
      }
      const failed = results.find((r) => !r.ok);
      if (failed && 'error' in failed) {
        res.status(failed.status ?? 400).json({ error: failed.error, results });
        return;
      }
      res.json({ ok: true, results });
    },
  );

  const usedCostSchema = z.object({
    amount: z.number().positive(),
    programId: z.string().optional(),
    projectId: z.string().optional(),
    expenseId: z.string().optional(),
  });

  router.post(
    '/stewardship/used-cost',
    requireAuth,
    async (req: AuthedRequest, res) => {
      const parsed = usedCostSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
        return;
      }
      if (!parsed.data.programId && !parsed.data.projectId) {
        res.status(400).json({ error: 'programId or projectId required' });
        return;
      }
      for (const [kind, rid] of [
        ['PROGRAM', parsed.data.programId],
        ['PROJECT', parsed.data.projectId],
      ] as const) {
        if (!rid) continue;
        const gate = await requireAuthz(req, kind, rid, 'MANAGE');
        if (!gate.ok) {
          res.status(gate.status).json({ error: gate.error });
          return;
        }
      }
      const { incrementUsedCost } = await import('../mission/moneyHooks.js');
      const results = [];
      if (parsed.data.programId) {
        results.push(
          await incrementUsedCost({
            kind: 'PROGRAM',
            id: parsed.data.programId,
            amount: parsed.data.amount,
            expenseId: parsed.data.expenseId,
          }),
        );
      }
      if (parsed.data.projectId) {
        results.push(
          await incrementUsedCost({
            kind: 'PROJECT',
            id: parsed.data.projectId,
            amount: parsed.data.amount,
            expenseId: parsed.data.expenseId,
          }),
        );
      }
      const failed = results.find((r) => !r.ok);
      if (failed && 'error' in failed) {
        res.status(failed.status ?? 400).json({ error: failed.error });
        return;
      }
      res.json({ ok: true, results });
    },
  );
}
