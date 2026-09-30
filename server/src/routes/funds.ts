import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import {
  pathParam,
  requireAuth,
  type AuthedRequest,
} from '../middleware/http.js';

export const fundsRouter = Router();

async function activeGrantActions(personId: string, fundId: string) {
  const now = new Date();
  return prisma.fundAccessGrant.findMany({
    where: {
      personId,
      fundId,
      status: 'ACTIVE',
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
  });
}

fundsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const personId = req.auth!.personId;
  const funds = await prisma.fund.findMany({
    where: { status: 'ACTIVE' },
    include: { orgUnit: true },
    orderBy: { code: 'asc' },
  });

  const overview = await Promise.all(
    funds.map(async (fund) => {
      const grants = await activeGrantActions(personId, fund.id);
      const canView = grants.some((g) =>
        ['VIEW', 'MANAGE', 'APPROVE'].includes(g.action),
      );
      const canManage = grants.some((g) => g.action === 'MANAGE');
      const txns = canView
        ? await prisma.financeTxn.findMany({ where: { fundId: fund.id } })
        : [];
      const balance = txns.reduce(
        (s, t) => s + (t.kind === 'INCOME' ? t.amount : -t.amount),
        0,
      );
      return {
        fund,
        orgName: fund.orgUnit.name,
        canView,
        canManage,
        balance: canView ? balance : null,
      };
    }),
  );

  res.json({
    funds: overview,
    note: 'Vault privacy is ORG_PRIVATE — ENTER Finance ≠ open every fund.',
  });
});

fundsRouter.get('/:fundId', requireAuth, async (req: AuthedRequest, res) => {
  const personId = req.auth!.personId;
  const fundId = pathParam(req, 'fundId');
  if (!fundId) {
    res.status(400).json({ error: 'Missing fundId' });
    return;
  }
  const fund = await prisma.fund.findUnique({
    where: { id: fundId },
    include: { orgUnit: true },
  });
  if (!fund) {
    res.status(404).json({ error: 'Fund not found' });
    return;
  }
  const grants = await activeGrantActions(personId, fund.id);
  const canView = grants.some((g) =>
    ['VIEW', 'MANAGE', 'APPROVE'].includes(g.action),
  );
  if (!canView) {
    res.status(403).json({
      error:
        'ORG_PRIVATE fund — no access without an explicit grant from the owning organization',
    });
    return;
  }
  const txns = await prisma.financeTxn.findMany({
    where: { fundId: fund.id },
    orderBy: { occurredOn: 'desc' },
  });
  const balance = txns.reduce(
    (s, t) => s + (t.kind === 'INCOME' ? t.amount : -t.amount),
    0,
  );
  const canManageFund = grants.some((g) => g.action === 'MANAGE');
  // Who else holds access is only loaded (and sent) for managers of the vault.
  const allGrants = canManageFund
    ? await prisma.fundAccessGrant.findMany({ where: { fundId: fund.id } })
    : undefined;
  res.json({
    fund: canManageFund ? { ...fund, grants: allGrants } : fund,
    balance,
    canManage: canManageFund,
    txns,
    yourGrants: grants,
  });
});
