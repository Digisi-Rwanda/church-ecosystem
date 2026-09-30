import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { authorizePerson } from '../policy/index.js';

export const assignmentsRouter = Router();

assignmentsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const personId =
    typeof req.query.personId === 'string'
      ? req.query.personId
      : req.auth!.personId;
  const mineOnly = personId === req.auth!.personId;
  if (!mineOnly) {
    res.status(403).json({ error: 'Can only list your own assignments for now' });
    return;
  }
  const assignments = await prisma.assignment.findMany({
    where: { personId },
    orderBy: { startDate: 'desc' },
  });
  res.json({ assignments });
});

const createSchema = z.object({
  personId: z.string().min(1),
  title: z.string().min(1),
  contextType: z.enum(['PROGRAM', 'PROJECT', 'EVENT']),
  contextId: z.string().min(1),
  contextLabel: z.string().min(1),
  systemId: z.string().optional(),
  orgUnitId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

/** Skeleton create — church leaders will gate this later. */
assignmentsRouter.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  // Assignments grant SYSTEM ENTER, so creating one is itself a privileged act.
  const gate = await authorizePerson({
    personId: req.auth!.personId,
    systemId: d.systemId ?? 'sys-main',
    resource: 'ASSIGNMENT',
    action: 'MANAGE',
  });
  if (!gate.allowed) {
    res.status(403).json({ error: gate.reason });
    return;
  }
  const assignment = await prisma.assignment.create({
    data: {
      personId: d.personId,
      title: d.title,
      contextType: d.contextType,
      contextId: d.contextId,
      contextLabel: d.contextLabel,
      systemId: d.systemId,
      orgUnitId: d.orgUnitId,
      status: 'ACTIVE',
      startDate: d.startDate ? new Date(d.startDate) : new Date(),
      endDate: d.endDate ? new Date(d.endDate) : null,
    },
  });
  await prisma.auditEvent.create({
    data: {
      actorId: req.auth!.personId,
      systemId: d.systemId,
      action: 'ASSIGNMENT_CREATE',
      resource: assignment.id,
      detail: `${d.title} · ${d.contextLabel}`,
    },
  });
  res.status(201).json({ assignment });
});
