import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authorizePerson } from '../policy/index.js';
import {
  pathParam,
  requireAuth,
  type AuthedRequest,
} from '../middleware/http.js';

export const contributionsRouter = Router();

async function activeFundManage(personId: string, fundId: string) {
  const now = new Date();
  const grants = await prisma.fundAccessGrant.findMany({
    where: {
      personId,
      fundId,
      status: 'ACTIVE',
      action: 'MANAGE',
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
  });
  return grants.length > 0;
}

/**
 * Resolve vault for a claim:
 * - explicit fundId (must belong to systemId)
 * - else if exactly one MINISTRY fund for system → that fund
 * - else (e.g. Choir with 7 vaults) require fundId
 */
async function resolveClaimFund(systemId: string, fundId?: string) {
  if (fundId) {
    const fund = await prisma.fund.findUnique({ where: { id: fundId } });
    if (!fund || fund.status !== 'ACTIVE') return { error: 'Fund not found' as const };
    if (fund.ownerSystemId !== systemId) {
      return { error: 'Fund does not belong to this system' as const };
    }
    if (fund.kind !== 'MINISTRY' && fund.kind !== 'GENERAL') {
      return { error: 'Fund kind not claimable' as const };
    }
    return { fund };
  }
  const funds = await prisma.fund.findMany({
    where: {
      ownerSystemId: systemId,
      status: 'ACTIVE',
      kind: 'MINISTRY',
    },
  });
  if (funds.length === 1) return { fund: funds[0] };
  if (funds.length === 0) {
    return { error: `No ministry fund vault for ${systemId}` as const };
  }
  return {
    error:
      `Multiple vaults for ${systemId} — pass fundId (e.g. fund-choir-ijwi)` as const,
  };
}

const claimSchema = z.object({
  systemId: z.string().min(1),
  fundId: z.string().optional(),
  typeLabel: z.string().min(1),
  amount: z.number().positive(),
  paymentMethod: z.string().min(1),
  occurredOn: z.string().min(1),
  note: z.string().optional(),
});

contributionsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const systemId =
    typeof req.query.systemId === 'string' ? req.query.systemId : undefined;
  const status =
    typeof req.query.status === 'string' ? req.query.status : undefined;
  const fundId =
    typeof req.query.fundId === 'string' ? req.query.fundId : undefined;
  const orgUnitId =
    typeof req.query.orgUnitId === 'string' ? req.query.orgUnitId : undefined;
  const mineOnly = req.query.mine === '1' || req.query.mine === 'true';

  if (!systemId) {
    res.status(400).json({ error: 'systemId required' });
    return;
  }

  const enter = await authorizePerson({
    personId: req.auth!.personId,
    systemId,
    resource: 'SYSTEM',
    action: 'ENTER',
  });
  if (!enter.allowed) {
    res.status(403).json({ error: enter.reason });
    return;
  }

  const funds = await prisma.fund.findMany({
    where: {
      ownerSystemId: systemId,
      status: 'ACTIVE',
      kind: 'MINISTRY',
      ...(fundId ? { id: fundId } : {}),
      ...(orgUnitId ? { orgUnitId } : {}),
    },
  });

  const managedFundIds: string[] = [];
  for (const f of funds) {
    if (await activeFundManage(req.auth!.personId, f.id)) managedFundIds.push(f.id);
  }
  const canVerify = managedFundIds.length > 0;

  const claims = await prisma.contributionClaim.findMany({
    where: {
      systemId,
      ...(status ? { status } : {}),
      ...(fundId ? { fundId } : {}),
      ...(orgUnitId ? { orgUnitId } : {}),
      // Own claims always; other people's claims only in vaults the caller manages.
      ...(mineOnly || !canVerify
        ? { personId: req.auth!.personId }
        : {
            OR: [
              { personId: req.auth!.personId },
              { fundId: { in: managedFundIds } },
            ],
          }),
    },
    orderBy: { submittedAt: 'desc' },
  });

  res.json({
    claims,
    funds: funds.map((f) => ({
      id: f.id,
      name: f.name,
      orgUnitId: f.orgUnitId,
    })),
    fundId: funds.length === 1 ? funds[0].id : fundId ?? null,
    canVerify,
  });
});

contributionsRouter.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = claimSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const {
    systemId,
    fundId: requestedFundId,
    typeLabel,
    amount,
    paymentMethod,
    occurredOn,
    note,
  } = parsed.data;

  const enter = await authorizePerson({
    personId: req.auth!.personId,
    systemId,
    resource: 'SYSTEM',
    action: 'ENTER',
  });
  if (!enter.allowed) {
    res.status(403).json({ error: enter.reason });
    return;
  }

  const resolved = await resolveClaimFund(systemId, requestedFundId);
  if ('error' in resolved) {
    res.status(400).json({ error: resolved.error });
    return;
  }
  const { fund } = resolved;

  const claim = await prisma.contributionClaim.create({
    data: {
      systemId,
      fundId: fund.id,
      orgUnitId: fund.orgUnitId,
      personId: req.auth!.personId,
      typeLabel,
      amount: Math.round(amount),
      paymentMethod,
      occurredOn: new Date(occurredOn),
      note,
      status: 'PENDING',
    },
  });

  await prisma.auditEvent.create({
    data: {
      actorId: req.auth!.personId,
      systemId,
      action: 'CONTRIBUTION_CLAIM',
      resource: claim.id,
      detail: `${typeLabel} ${claim.amount} → ${fund.id}`,
    },
  });

  res.status(201).json({ claim });
});

const verifySchema = z.object({
  decision: z.enum(['CONFIRMED', 'PARTIAL', 'DECLINED']),
  confirmedAmount: z.number().positive().optional(),
  note: z.string().optional(),
});

contributionsRouter.post(
  '/:id/verify',
  requireAuth,
  async (req: AuthedRequest, res) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const id = pathParam(req, 'id');
    if (!id) {
      res.status(400).json({ error: 'Missing id' });
      return;
    }

    const claim = await prisma.contributionClaim.findUnique({
      where: { id },
    });
    if (!claim) {
      res.status(404).json({ error: 'Claim not found' });
      return;
    }
    if (claim.status !== 'PENDING') {
      res.status(409).json({ error: 'Already processed' });
      return;
    }

    const canManage = await activeFundManage(
      req.auth!.personId,
      claim.fundId,
    );
    if (!canManage) {
      res.status(403).json({
        error: 'ORG_PRIVATE fund — MANAGE grant required to verify',
      });
      return;
    }

    if (claim.personId === req.auth!.personId) {
      res.status(403).json({
        error: 'Separation of duties — you cannot verify your own contribution',
      });
      return;
    }

    const { decision, confirmedAmount, note } = parsed.data;

    if (decision === 'DECLINED') {
      const updated = await prisma.contributionClaim.update({
        where: { id: claim.id },
        data: {
          status: 'DECLINED',
          verifiedAt: new Date(),
          verifiedByPersonId: req.auth!.personId,
          verifyNote: note,
        },
      });
      await prisma.auditEvent.create({
        data: {
          actorId: req.auth!.personId,
          systemId: claim.systemId,
          action: 'CONTRIBUTION_DECLINED',
          resource: claim.id,
          detail: note,
        },
      });
      res.json({ claim: updated });
      return;
    }

    const amount =
      decision === 'PARTIAL'
        ? Math.round(confirmedAmount ?? claim.amount)
        : claim.amount;
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'confirmedAmount must be positive' });
      return;
    }

    const person = await prisma.person.findUnique({
      where: { id: claim.personId },
    });
    const label = `Contribution · ${person?.preferredName || person?.fullName || claim.personId} · ${claim.typeLabel}`;

    let result;
    try {
    result = await prisma.$transaction(async (tx) => {
      // Claim the PENDING row first; a concurrent verify gets count 0 and rolls back.
      const won = await tx.contributionClaim.updateMany({
        where: { id: claim.id, status: 'PENDING' },
        data: { status: decision },
      });
      if (won.count !== 1) throw new Error('ALREADY_PROCESSED');
      const txn = await tx.financeTxn.create({
        data: {
          fundId: claim.fundId,
          kind: 'INCOME',
          amount,
          occurredOn: claim.occurredOn,
          label,
          note: note ?? claim.note,
          postedById: req.auth!.personId,
        },
      });
      const updated = await tx.contributionClaim.update({
        where: { id: claim.id },
        data: {
          status: decision,
          confirmedAmount: amount,
          verifiedAt: new Date(),
          verifiedByPersonId: req.auth!.personId,
          verifyNote: note,
          financeTxnId: txn.id,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: req.auth!.personId,
          systemId: claim.systemId,
          action: 'CONTRIBUTION_VERIFIED',
          resource: claim.id,
          detail: `${decision} → txn ${txn.id}`,
          metaJson: JSON.stringify({ financeTxnId: txn.id, amount }),
        },
      });
      return { claim: updated, financeTxn: txn };
    });
    } catch (e) {
      if (e instanceof Error && e.message === 'ALREADY_PROCESSED') {
        res.status(409).json({ error: 'Already processed' });
        return;
      }
      throw e;
    }

    res.json(result);
  },
);
