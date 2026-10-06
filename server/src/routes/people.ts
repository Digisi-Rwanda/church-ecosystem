import { Router } from 'express';
import { z } from 'zod';
import { filterPerson, SELF_EDITABLE } from '../policy/personFields.js';
import { personTier } from '../policy/personAccess.js';
import { prisma } from '../lib/prisma.js';
import { nextMemberCode, personWithNationalId } from '../lib/codes.js';
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

const tierOf = personTier;

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
  // The list is a directory: identity details never travel here; contact details only for the people module.
  const viewer = req.auth!.personId;
  const tier = await tierOf(viewer, '\u0000');
  const shown = tier === 'FULL' || tier === 'BASIC' ? 'BASIC' : 'DIRECTORY';
  res.json({ people: people.map((p) => filterPerson(p as Record<string, unknown>, shown)) });
});

/**
 * Records for the app's local copy. What comes back depends on the viewer:
 * Church Leader → everyone, every field; Catechist → everyone, basic fields;
 * anyone else → only their own record. Paged with ?limit (max 500) and ?offset.
 */
peopleRouter.get('/records', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const tier = await tierOf(me, '\u0000');
  if (tier === 'NONE') {
    const self = await prisma.person.findUnique({ where: { id: me } });
    res.json({
      tier: 'SELF',
      total: self ? 1 : 0,
      offset: 0,
      people: self ? [filterPerson(self as Record<string, unknown>, 'SELF')] : [],
    });
    return;
  }
  const [rows, total] = await Promise.all([
    prisma.person.findMany({ orderBy: { fullName: 'asc' }, skip: offset, take: limit }),
    prisma.person.count(),
  ]);
  res.json({
    tier,
    total,
    offset,
    people: rows.map((r) =>
      filterPerson(r as Record<string, unknown>, r.id === me ? 'SELF' : tier),
    ),
  });
});

peopleRouter.get('/:id', requireAuth, async (req: AuthedRequest, res) => {
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
  const tier = await tierOf(req.auth!.personId, id);
  const visible = filterPerson(person as Record<string, unknown>, tier);
  if (!visible) {
    res.status(403).json({ error: 'You can only open your own profile' });
    return;
  }
  res.json({ person: visible, tier });
});

peopleRouter.patch('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = pathParam(req, 'id');
  if (!id) {
    res.status(400).json({ error: 'Missing id' });
    return;
  }
  const actor = req.auth!.personId;
  const tier = await tierOf(actor, id);
  if (req.body && typeof req.body === 'object' && 'memberCode' in req.body) {
    res.status(400).json({ error: 'A member code never changes', code: 'CODE_IS_FIXED' });
    return;
  }
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  let data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) if (v !== undefined) data[k] = v;
  if (tier === 'FULL') {
    const gate = await authorizePerson({
      personId: actor,
      systemId: 'sys-main',
      resource: 'PERSON',
      action: 'MANAGE',
    });
    if (!gate.allowed) {
      res.status(403).json({ error: gate.reason });
      return;
    }
  } else if (tier === 'SELF' && actor === id) {
    const extra = Object.keys(data).filter((k) => !(SELF_EDITABLE as readonly string[]).includes(k));
    if (extra.length) {
      res.status(403).json({ error: `You can edit only: ${SELF_EDITABLE.join(', ')}` });
      return;
    }
  } else {
    res.status(403).json({ error: 'Not allowed to edit this record' });
    return;
  }
  if (!Object.keys(data).length) {
    res.status(400).json({ error: 'Nothing to change' });
    return;
  }
  if (data.email === '') data.email = null;
  const existing = await prisma.person.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Person not found' });
    return;
  }
  if (typeof data.nationalId === 'string') {
    const twin = await personWithNationalId(prisma, data.nationalId, id);
    if (twin) {
      res.status(409).json({ error: 'This national ID is already registered', code: 'DUPLICATE_NATIONAL_ID', personId: twin.id });
      return;
    }
  }
  const person = await prisma.person.update({ where: { id }, data });
  await prisma.auditEvent.create({
    data: {
      actorId: actor,
      systemId: 'sys-main',
      action: 'UPDATE',
      resource: 'PERSON',
      detail: `${id}: ${Object.keys(data).join(',')}`,
    },
  });
  res.json({ person: filterPerson(person as Record<string, unknown>, tier) });
});

const photoSchema = z.string().max(40_000).nullable();
const patchSchema = z.object({
  fullName: z.string().min(1).optional(),
  preferredName: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().or(z.literal('')).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'VISITOR']).optional(),
  dateOfBirth: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  nationalId: z.string().nullable().optional(),
  joinedChurchOn: z.string().nullable().optional(),
  pastoralNotes: z.string().nullable().optional(),
  photoUrl: photoSchema.optional(),
});

const createSchema = z.object({
  id: z.string().regex(/^p-[A-Za-z0-9-]{3,40}$/).optional(),
  fullName: z.string().min(1),
  preferredName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE', 'VISITOR']).optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  address: z.string().optional(),
  nationalId: z.string().optional(),
  joinedChurchOn: z.string().optional(),
  pastoralNotes: z.string().optional(),
  photoUrl: z.string().max(40_000).optional(),
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
  const id = parsed.data.id ?? `p-${crypto.randomUUID().slice(0, 8)}`;
  if (await prisma.person.findUnique({ where: { id } })) {
    res.status(409).json({ error: 'A person with this id already exists' });
    return;
  }
  const twin = await personWithNationalId(prisma, parsed.data.nationalId);
  if (twin) {
    res.status(409).json({ error: 'This national ID is already registered', code: 'DUPLICATE_NATIONAL_ID', personId: twin.id });
    return;
  }
  const person = await prisma.person.create({
    data: {
      id,
      memberCode: await nextMemberCode(prisma),
      fullName: parsed.data.fullName,
      preferredName: parsed.data.preferredName,
      phone: parsed.data.phone,
      email: parsed.data.email || undefined,
      status: parsed.data.status ?? 'ACTIVE',
      dateOfBirth: parsed.data.dateOfBirth,
      gender: parsed.data.gender,
      address: parsed.data.address,
      nationalId: parsed.data.nationalId,
      joinedChurchOn: parsed.data.joinedChurchOn,
      pastoralNotes: parsed.data.pastoralNotes,
      photoUrl: parsed.data.photoUrl,
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
