/**
 * System settings (slice 3.18): the preferences of one system. Anyone who may enter the system
 * reads them; the president and secretary change the unit details; the treasurer and president
 * change the contribution goals and money options. Every change is audited.
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { buildEffectiveAccess } from '../policy/evaluate.js';
import { loadPolicyContext } from '../policy/loadContext.js';
import { liveHoldings } from '../capabilities/engine.js';
import { loadAccessData } from '../notifications/feed.js';
import { DETAILS_EDITORS, EMPTY_DETAILS, EMPTY_MONEY, MONEY_EDITORS, detailsSchema, moneySchema, parseStored } from '../systemSettings/rules.js';

export const systemSettingsRouter = Router();

const fail = (res: import('express').Response, status: number, code: string, error: string) => res.status(status).json({ error, code });

async function powers(personId: string, systemId: string) {
  const system = await prisma.churchSystem.findUnique({ where: { id: systemId } });
  if (!system) return { system: null, canEnter: false, canEditDetails: false, canEditMoney: false };
  const ctx = await loadPolicyContext();
  const now = new Date();
  const canEnter = buildEffectiveAccess(personId, ctx, now).some((g) => g.systemId === systemId && g.resource === 'SYSTEM' && g.action === 'ENTER');
  const { data } = await loadAccessData(personId);
  const offices = liveHoldings(personId, data, now).filter((h) => h.via === 'OFFICE' && h.systemId === systemId).map((h) => h.office);
  return {
    system,
    canEnter,
    canEditDetails: offices.some((o) => (DETAILS_EDITORS as readonly string[]).includes(o)),
    canEditMoney: offices.some((o) => (MONEY_EDITORS as readonly string[]).includes(o)),
  };
}

async function shape(systemId: string, pw: { canEditDetails: boolean; canEditMoney: boolean }) {
  const row = await prisma.systemSetting.findUnique({ where: { systemId } });
  return {
    systemId,
    details: parseStored(row?.detailsJson, detailsSchema, EMPTY_DETAILS),
    money: parseStored(row?.moneyJson, moneySchema, EMPTY_MONEY),
    canEditDetails: pw.canEditDetails,
    canEditMoney: pw.canEditMoney,
    updatedAt: row?.updatedAt ?? null,
  };
}

systemSettingsRouter.get('/:systemId', requireAuth, async (req: AuthedRequest, res) => {
  const systemId = String(req.params.systemId);
  const pw = await powers(req.auth!.personId, systemId);
  if (!pw.system) return fail(res, 404, 'NOT_FOUND', 'No such system');
  if (!pw.canEnter) return fail(res, 403, 'NOT_ALLOWED', 'You do not have access to this system');
  res.json(await shape(systemId, pw));
});

async function save(req: AuthedRequest, res: import('express').Response, part: 'details' | 'money') {
  const systemId = String(req.params.systemId);
  const pw = await powers(req.auth!.personId, systemId);
  if (!pw.system) return fail(res, 404, 'NOT_FOUND', 'No such system');
  if (!pw.canEnter || !(part === 'details' ? pw.canEditDetails : pw.canEditMoney)) {
    return fail(res, 403, 'NOT_ALLOWED', part === 'details' ? 'Only the president and secretary change the unit details' : 'Only the treasurer and president change the money options');
  }
  const parsed = (part === 'details' ? detailsSchema : moneySchema).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'INVALID', parsed.error.issues[0]?.message ?? 'Check the values');
  const before = await shape(systemId, pw);
  const now = new Date();
  const json = JSON.stringify(parsed.data);
  const existing = await prisma.systemSetting.findUnique({ where: { systemId } });
  if (existing) await prisma.systemSetting.update({ where: { systemId }, data: part === 'details' ? { detailsJson: json, updatedById: req.auth!.personId, updatedAt: now } : { moneyJson: json, updatedById: req.auth!.personId, updatedAt: now } });
  else {
    await prisma.systemSetting.create({
      data: {
        systemId,
        detailsJson: part === 'details' ? json : '{}',
        moneyJson: part === 'money' ? json : '{}',
        updatedById: req.auth!.personId,
        updatedAt: now,
      },
    });
  }
  await prisma.auditEvent.create({
    data: {
      at: now,
      actorId: req.auth!.personId,
      systemId,
      action: part === 'details' ? 'system.details.changed' : 'system.money.changed',
      resource: `system-settings:${systemId}`,
      detail: part === 'details' ? 'Unit details changed' : 'Contribution goals and money options changed',
      metaJson: JSON.stringify({ before: before[part], after: parsed.data }),
    },
  });
  res.json(await shape(systemId, pw));
}

systemSettingsRouter.put('/:systemId/details', requireAuth, (req, res) => save(req as AuthedRequest, res, 'details'));
systemSettingsRouter.put('/:systemId/money', requireAuth, (req, res) => save(req as AuthedRequest, res, 'money'));
