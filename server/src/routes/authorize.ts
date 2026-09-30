import { Router } from 'express';
import { z } from 'zod';
import {
  authorizePerson,
  grantsForPerson,
  grantsForPersonInSystem,
} from '../policy/index.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';

/** Only yourself — or someone who may see full person records — can be probed. */
async function mayActAs(callerId: string, targetId: string): Promise<boolean> {
  if (callerId === targetId) return true;
  const d = await authorizePerson({
    personId: callerId,
    systemId: 'sys-main',
    resource: 'PERSON',
    action: 'VIEW_FULL',
  });
  return d.allowed;
}

/**
 * Server policy engine — same rules as SPA authorize.ts / choirAccess grants,
 * evaluated against Prisma memberships, positions, and FundAccessGrant rows.
 */
export const authorizeRouter = Router();

const probeSchema = z.object({
  systemId: z.string().min(1),
  resource: z.string().min(1),
  action: z.string().min(1),
  fundId: z.string().optional(),
  personId: z.string().optional(),
});

authorizeRouter.post('/probe', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = probeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const personId = parsed.data.personId ?? req.auth!.personId;
  if (!(await mayActAs(req.auth!.personId, personId))) {
    res.status(403).json({ error: 'Cannot evaluate access for another person' });
    return;
  }
  const decision = await authorizePerson({
    personId,
    systemId: parsed.data.systemId,
    resource: parsed.data.resource,
    action: parsed.data.action,
    fundId: parsed.data.fundId,
  });

  res.json({
    ...decision,
    engine: 'server-policy-v1',
    reasons: [decision.reason],
  });
});

authorizeRouter.get('/grants', requireAuth, async (req: AuthedRequest, res) => {
  const personId =
    typeof req.query.personId === 'string'
      ? req.query.personId
      : req.auth!.personId;
  const systemId =
    typeof req.query.systemId === 'string' ? req.query.systemId : undefined;
  if (!(await mayActAs(req.auth!.personId, personId))) {
    res.status(403).json({ error: 'Cannot list grants of another person' });
    return;
  }
  const grants = systemId
    ? await grantsForPersonInSystem(personId, systemId)
    : await grantsForPerson(personId);
  res.json({
    personId,
    systemId: systemId ?? null,
    count: grants.length,
    grants,
    engine: 'server-policy-v1',
  });
});
