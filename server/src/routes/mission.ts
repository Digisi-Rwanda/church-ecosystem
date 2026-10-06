import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authorizePerson } from '../policy/index.js';
import {
  pathParam,
  requireAuth,
  type AuthedRequest,
} from '../middleware/http.js';
import { toStoredVisibility } from '../mission/visibility.js';
import { registerMissionExtendedRoutes } from '../mission/registerExtended.js';
import { parseStewardship } from '../mission/stewardshipJson.js';

export const missionRouter = Router();

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function toJsonArray(ids: string[] | undefined): string | undefined {
  if (!ids?.length) return undefined;
  return JSON.stringify(ids);
}

missionRouter.get('/programs', requireAuth, async (req: AuthedRequest, res) => {
  const ownerSystemId =
    typeof req.query.ownerSystemId === 'string'
      ? req.query.ownerSystemId
      : undefined;
  const status =
    typeof req.query.status === 'string' ? req.query.status : undefined;

  const programs = await prisma.program.findMany({
    where: {
      ...(ownerSystemId ? { ownerSystemId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { name: 'asc' },
  });

  const visible = [];
  for (const p of programs) {
    const decision = await authorizePerson({
      personId: req.auth!.personId,
      systemId: p.ownerSystemId,
      resource: 'PROGRAM',
      action: 'VIEW',
    });
    if (decision.allowed) visible.push(p);
  }
  res.json({ programs: visible });
});

missionRouter.get('/programs/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = pathParam(req, 'id');
  if (!id) {
    res.status(400).json({ error: 'Missing id' });
    return;
  }
  const program = await prisma.program.findUnique({
    where: { id },
  });
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
  const steward = parseStewardship(program.stewardshipJson);
  res.json({
    program: {
      ...program,
      visibility: toStoredVisibility(program.visibility),
      approvedAt: program.approvedAt?.toISOString() ?? null,
      ...steward,
    },
  });
});

const programCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  ownerSystemId: z.string().min(1),
  visibility: z.enum(['GENERAL', 'MINISTRY', 'SELECTED', 'CHURCH', 'MINISTRY_PRIVATE', 'SELECTIVE']).optional(),
  status: z
    .enum([
      'DRAFT',
      'PENDING_APPROVAL',
      'SETUP',
      'ACTIVE',
      'PAUSED',
      'CLOSING',
      'ENDED',
    ])
    .optional(),
  programType: z.string().optional(),
  scheduleHint: z.string().optional(),
  parentProgramId: z.string().optional(),
  cohortLabel: z.string().optional(),
});

missionRouter.post('/programs', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = programCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const decision = await authorizePerson({
    personId: req.auth!.personId,
    systemId: parsed.data.ownerSystemId,
    resource: 'PROGRAM',
    action: 'MANAGE',
  });
  if (!decision.allowed) {
    res.status(403).json({ error: decision.reason });
    return;
  }
  const program = await prisma.program.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? '',
      ownerSystemId: parsed.data.ownerSystemId,
      visibility: toStoredVisibility(parsed.data.visibility),
      status: parsed.data.status ?? 'DRAFT',
      programType: parsed.data.programType,
      scheduleHint: parsed.data.scheduleHint,
      parentProgramId: parsed.data.parentProgramId,
      cohortLabel: parsed.data.cohortLabel,
      createdByPersonId: req.auth!.personId,
    },
  });
  res.status(201).json({
    program: {
      ...program,
      visibility: toStoredVisibility(program.visibility),
    },
  });
});

missionRouter.get('/events', requireAuth, async (req: AuthedRequest, res) => {
  const ownerSystemId =
    typeof req.query.ownerSystemId === 'string'
      ? req.query.ownerSystemId
      : undefined;
  const events = await prisma.churchEvent.findMany({
    where: ownerSystemId ? { ownerSystemId } : undefined,
    orderBy: { startsAt: 'asc' },
  });
  const visible = [];
  for (const e of events) {
    const decision = await authorizePerson({
      personId: req.auth!.personId,
      systemId: e.ownerSystemId,
      resource: 'EVENT',
      action: 'VIEW',
    });
    if (decision.allowed) {
      visible.push({
        ...e,
        collaboratorSystemIds: parseJsonArray(e.collaboratorSystemIds),
        collaboratorPersonIds: parseJsonArray(e.collaboratorPersonIds),
      });
    }
  }
  res.json({ events: visible });
});

missionRouter.get('/events/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = pathParam(req, 'id');
  if (!id) {
    res.status(400).json({ error: 'Missing id' });
    return;
  }
  const event = await prisma.churchEvent.findUnique({
    where: { id },
  });
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
  res.json({
    event: {
      ...event,
      collaboratorSystemIds: parseJsonArray(event.collaboratorSystemIds),
      collaboratorPersonIds: parseJsonArray(event.collaboratorPersonIds),
    },
  });
});

const eventCreateSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  description: z.string().optional(),
  ownerSystemId: z.string().min(1),
  visibility: z
    .enum([
      'GENERAL',
      'MINISTRY',
      'SELECTED',
      'CHURCH',
      'MINISTRY_PRIVATE',
      'SELECTIVE',
    ])
    .optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().optional(),
  location: z.string().optional(),
  status: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  registrationMode: z.string().optional(),
  beyondOwnerScope: z.boolean().optional(),
  programId: z.string().optional(),
  projectId: z.string().optional(),
});

missionRouter.post('/events', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = eventCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const decision = await authorizePerson({
    personId: req.auth!.personId,
    systemId: parsed.data.ownerSystemId,
    resource: 'EVENT',
    action: 'MANAGE',
  });
  if (!decision.allowed) {
    res.status(403).json({ error: decision.reason });
    return;
  }
  const status =
    parsed.data.status ??
    (parsed.data.beyondOwnerScope ? 'PENDING_APPROVAL' : 'CONFIRMED');
  const event = await prisma.churchEvent.create({
    data: {
      name: parsed.data.name,
      type: parsed.data.type ?? 'OTHER',
      description: parsed.data.description,
      ownerSystemId: parsed.data.ownerSystemId,
      visibility: toStoredVisibility(parsed.data.visibility),
      startsAt: new Date(parsed.data.startsAt),
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : undefined,
      location: parsed.data.location,
      status,
      capacity: parsed.data.capacity,
      registrationMode: parsed.data.registrationMode,
      beyondOwnerScope: parsed.data.beyondOwnerScope ?? false,
      programId: parsed.data.programId,
      projectId: parsed.data.projectId,
      createdByPersonId: req.auth!.personId,
    },
  });
  res.status(201).json({
    event: {
      ...event,
      visibility: toStoredVisibility(event.visibility),
      collaboratorSystemIds: parseJsonArray(event.collaboratorSystemIds),
      collaboratorPersonIds: parseJsonArray(event.collaboratorPersonIds),
    },
  });
});

missionRouter.get('/tasks', requireAuth, async (req: AuthedRequest, res) => {
  const systemId =
    typeof req.query.systemId === 'string' ? req.query.systemId : undefined;
  const tasks = await prisma.workTask.findMany({
    where: systemId ? { systemId } : undefined,
    orderBy: { startDate: 'desc' },
  });
  const visible = [];
  for (const t of tasks) {
    const sid = t.systemId ?? 'sys-main';
    const decision = await authorizePerson({
      personId: req.auth!.personId,
      systemId: sid,
      resource: 'TASK',
      action: 'VIEW',
    });
    const isOwner = t.ownerPersonId === req.auth!.personId;
    if (decision.allowed || isOwner) {
      visible.push({
        ...t,
        helperPersonIds: parseJsonArray(t.helperPersonIds),
      });
    }
  }
  res.json({ tasks: visible });
});

missionRouter.get('/tasks/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = pathParam(req, 'id');
  if (!id) {
    res.status(400).json({ error: 'Missing id' });
    return;
  }
  const task = await prisma.workTask.findUnique({
    where: { id },
  });
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  const sid = task.systemId ?? 'sys-main';
  const decision = await authorizePerson({
    personId: req.auth!.personId,
    systemId: sid,
    resource: 'TASK',
    action: 'VIEW',
  });
  if (!decision.allowed && task.ownerPersonId !== req.auth!.personId) {
    res.status(403).json({ error: decision.reason });
    return;
  }
  res.json({
    task: { ...task, helperPersonIds: parseJsonArray(task.helperPersonIds) },
  });
});

const taskCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  ownerPersonId: z.string().optional(),
  helperPersonIds: z.array(z.string()).optional(),
  systemId: z.string().optional(),
  visibility: z
    .enum([
      'GENERAL',
      'MINISTRY',
      'SELECTED',
      'CHURCH',
      'MINISTRY_PRIVATE',
      'SELECTIVE',
    ])
    .optional(),
  status: z.string().optional(),
  dueDate: z.string().optional(),
  grantsSystemAccess: z.boolean().optional(),
  contextType: z.string().optional(),
  contextId: z.string().optional(),
  contextLabel: z.string().optional(),
});

missionRouter.post('/tasks', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = taskCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const systemId = parsed.data.systemId ?? 'sys-main';
  const decision = await authorizePerson({
    personId: req.auth!.personId,
    systemId,
    resource: 'TASK',
    action: 'MANAGE',
  });
  if (!decision.allowed) {
    res.status(403).json({ error: decision.reason });
    return;
  }
  const ownerPersonId = parsed.data.ownerPersonId ?? req.auth!.personId;
  const helpers = (parsed.data.helperPersonIds ?? []).filter(
    (id) => id && id !== ownerPersonId,
  );
  const rawContext = parsed.data.contextType ?? 'NONE';
  const contextType = rawContext === 'GENERAL' ? 'NONE' : rawContext;
  const task = await prisma.workTask.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      ownerPersonId,
      helperPersonIds: toJsonArray(helpers),
      createdByPersonId: req.auth!.personId,
      systemId,
      visibility: toStoredVisibility(parsed.data.visibility),
      status: parsed.data.status ?? 'TODO',
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      grantsSystemAccess: parsed.data.grantsSystemAccess ?? false,
      contextType,
      contextId: parsed.data.contextId,
      contextLabel: parsed.data.contextLabel,
    },
  });
  res.status(201).json({
    task: {
      ...task,
      visibility: toStoredVisibility(task.visibility),
      helperPersonIds: parseJsonArray(task.helperPersonIds),
    },
  });
});

missionRouter.get('/projects', requireAuth, async (req: AuthedRequest, res) => {
  const ownerSystemId =
    typeof req.query.ownerSystemId === 'string'
      ? req.query.ownerSystemId
      : undefined;
  const projects = await prisma.churchProject.findMany({
    where: ownerSystemId ? { ownerSystemId } : undefined,
    orderBy: { name: 'asc' },
  });
  const visible = [];
  for (const p of projects) {
    const decision = await authorizePerson({
      personId: req.auth!.personId,
      systemId: p.ownerSystemId,
      resource: 'PROJECT',
      action: 'VIEW',
    });
    if (decision.allowed) visible.push(p);
  }
  res.json({ projects: visible });
});

missionRouter.get('/projects/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = pathParam(req, 'id');
  if (!id) {
    res.status(400).json({ error: 'Missing id' });
    return;
  }
  const project = await prisma.churchProject.findUnique({
    where: { id },
  });
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
  res.json({ project });
});

const projectCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  ownerSystemId: z.string().min(1),
  visibility: z
    .enum([
      'GENERAL',
      'MINISTRY',
      'SELECTED',
      'CHURCH',
      'MINISTRY_PRIVATE',
      'SELECTIVE',
    ])
    .optional(),
  status: z
    .enum([
      'DRAFT',
      'PENDING_APPROVAL',
      'PLANNED',
      'ACTIVE',
      'PAUSED',
      'CLOSING',
      'DONE',
      'CANCELLED',
    ])
    .optional(),
  programId: z.string().optional(),
  beyondOwnerScope: z.boolean().optional(),
  leadPersonId: z.string().optional(),
  collaboratorSystemIds: z.array(z.string()).optional(),
});

missionRouter.post('/projects', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = projectCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const decision = await authorizePerson({
    personId: req.auth!.personId,
    systemId: parsed.data.ownerSystemId,
    resource: 'PROJECT',
    action: 'MANAGE',
  });
  if (!decision.allowed) {
    res.status(403).json({ error: decision.reason });
    return;
  }
  const project = await prisma.churchProject.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? '',
      ownerSystemId: parsed.data.ownerSystemId,
      visibility: toStoredVisibility(parsed.data.visibility),
      status: parsed.data.status ?? 'DRAFT',
      programId: parsed.data.programId,
      beyondOwnerScope: parsed.data.beyondOwnerScope ?? false,
      leadPersonId: parsed.data.leadPersonId,
      collaboratorSystemIds: toJsonArray(parsed.data.collaboratorSystemIds),
      createdByPersonId: req.auth!.personId,
    },
  });
  res.status(201).json({
    project: {
      ...project,
      visibility: toStoredVisibility(project.visibility),
      collaboratorSystemIds: parseJsonArray(project.collaboratorSystemIds),
      collaboratorPersonIds: parseJsonArray(project.collaboratorPersonIds),
    },
  });
});

registerMissionExtendedRoutes(missionRouter);
