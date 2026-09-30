import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authorizePerson, grantsForPerson } from '../policy/index.js';
import {
  pathParam,
  requireAuth,
  type AuthedRequest,
} from '../middleware/http.js';

export const peopleRouter = Router();

/** Directory access needs at least one real role — not just a bare account. */
async function isInvolved(personId: string): Promise<boolean> {
  const grants = await grantsForPerson(personId);
  return grants.some((g) => g.source !== 'ACCOUNT');
}

peopleRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await isInvolved(req.auth!.personId))) {
    res.status(403).json({ error: 'Directory is limited to church members with a role' });
    return;
  }
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const people = await prisma.person.findMany({
    where: q
      ? {
          OR: [
            { fullName: { contains: q } },
            { preferredName: { contains: q } },
            { email: { contains: q } },
            { phone: { contains: q } },
          ],
        }
      : undefined,
    orderBy: { fullName: 'asc' },
    take: 100,
  });
  res.json({ people });
});

peopleRouter.get('/:id', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await isInvolved(req.auth!.personId))) {
    res.status(403).json({ error: 'Directory is limited to church members with a role' });
    return;
  }
  const id = pathParam(req, 'id');
  if (!id) {
    res.status(400).json({ error: 'Missing id' });
    return;
  }
  const person = await prisma.person.findUnique({
    where: { id },
    include: {
      memberships: true,
      positions: true,
    },
  });
  if (!person) {
    res.status(404).json({ error: 'Person not found' });
    return;
  }
  res.json({ person });
});

const createSchema = z.object({
  fullName: z.string().min(1),
  preferredName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE', 'VISITOR']).optional(),
});

peopleRouter.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const gate = await authorizePerson({
    personId: req.auth!.personId,
    systemId: 'sys-main',
    resource: 'PERSON',
    action: 'MANAGE',
  });
  if (!gate.allowed) {
    res.status(403).json({ error: gate.reason });
    return;
  }
  const id = `p-${crypto.randomUUID().slice(0, 8)}`;
  const person = await prisma.person.create({
    data: {
      id,
      fullName: parsed.data.fullName,
      preferredName: parsed.data.preferredName,
      phone: parsed.data.phone,
      email: parsed.data.email || undefined,
      status: parsed.data.status ?? 'ACTIVE',
    },
  });
  await prisma.auditEvent.create({
    data: {
      actorId: req.auth!.personId,
      systemId: 'sys-main',
      action: 'CREATE',
      resource: 'PERSON',
      detail: person.id,
    },
  });
  res.status(201).json({ person });
});
