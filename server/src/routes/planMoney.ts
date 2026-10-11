/**
 * Money on an activity's page (slice 4): the spending lines, the money set aside for them, the live gap, and the Treasurer's check.
 * Mounted ahead of the plan routes under /api/work-plans. Money is open to change while an activity is a draft or waiting for
 * approval; changing it while waiting pulls the activity back to the Treasurer. After approval it is locked (slices 5+ add amendments).
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { notifySafely } from '../lib/notify.js';
import { NOTE_MAX, TITLE_MAX, canSee } from '../work/rules.js';
import { asWorkRow, approversOf, canApprove, canManagePlan, currentLevel, levelsOf, treasurerExists, type PlanRow } from '../work/plan.js';
import { SOURCE_KINDS, codeFor, earmarkProblem, potId } from '../money/funds.js';
import { adjustLevels, afterEdit, allVerified, checkNote, figures, liveLines, submitProblem, type MoneyCheck } from '../money/planMoney.js';
import { canReadMoney } from '../money/rules.js';
import { potsOf } from './incomeFunds.js';

export const planMoneyRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string, extra: object = {}) => res.status(status).json({ error, code, ...extra });

interface Plan extends PlanRow { title: string; moneyCheckJson?: string | null; startsOn?: Date | string | null }
interface Line { id: string; planId: string | null; systemId: string; title: string; amount: number; category: string | null; status: string; note: string | null; checkState: string | null; checkedById: string | null; checkedAt: Date | string | null; year: number; createdAt: Date | string }
interface Source { id: string; planId: string; systemId: string; kind: string; code: string; amount: number }

/** Money stays open only while the activity is not yet approved. */
const OPEN = ['DRAFT', 'PENDING_APPROVAL'];
const AMOUNT_MAX = 2_000_000_000;

async function load(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const { data } = await loadAccessData(me);
  const p = (await prisma.workPlan.findUnique({ where: { id: String(req.params.id) } })) as Plan | null;
  if (!p || p.deletedAt || !canSee(asWorkRow(p), me, data)) return fail(res, 404, 'NOT_FOUND', 'Plan not found'), null;
  return { me, data, p };
}

const linesOf = async (planId: string) => ((await prisma.moneyPlanItem.findMany({ where: { planId } })) as Line[]).filter((l) => l.planId === planId).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
const sourcesOf = async (planId: string) => ((await prisma.planSource.findMany({ where: { planId } })) as Source[]).filter((s) => s.planId === planId);

async function audit(actorId: string, systemId: string, action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({ data: { at: new Date(), actorId, systemId, action, resource: 'MONEY', detail, metaJson: JSON.stringify(meta) } });
}

const parseCheck = (s?: string | null): MoneyCheck | null => {
  try { return s ? (JSON.parse(s) as MoneyCheck) : null; } catch { return null; }
};

async function view(p: Plan, me: string, data: Awaited<ReturnType<typeof loadAccessData>>['data']) {
  const lines = await linesOf(p.id);
  const sources = await sourcesOf(p.id);
  const live = liveLines(lines);
  const f = figures(lines, sources);
  const level = p.status === 'PENDING_APPROVAL' ? currentLevel(p) : null;
  const manage = canManagePlan(p, me, data);
  const pots = await potsOf(p.systemId, p.id);
  const check = parseCheck(p.moneyCheckJson);
  const who = new Map(((await prisma.person.findMany({ where: { id: { in: [check?.byId ?? '-'] } } })) as Array<{ id: string; fullName: string }>).map((x) => [x.id, x.fullName]));
  const atTreasurer = level?.levelKey === 'TREASURER';
  return {
    planId: p.id, status: p.status, open: OPEN.includes(p.status), ...f,
    canEdit: manage && OPEN.includes(p.status),
    canVerify: atTreasurer && canApprove(p, me, data),
    canCheck: atTreasurer && canApprove(p, me, data),
    allVerified: allVerified(lines),
    lines: live.map((l) => ({ id: l.id, title: l.title, amount: l.amount, category: l.category, note: l.note, checkState: l.checkState ?? null })),
    sources: sources.map((s) => ({ kind: s.kind, code: s.code, amount: s.amount, potId: potId(s.kind, s.code) })),
    pots, check: check ? { result: check.result, note: check.note, at: check.at, byName: who.get(check.byId) ?? '' } : null,
  };
}

const planYear = (p: Plan) => (p.startsOn ? new Date(p.startsOn).getUTCFullYear() : new Date().getUTCFullYear());

/** After money changed: keep the Treasurer's step in line with the spending, and pull a checked activity back. */
async function changed(p: Plan, me: string, data: Awaited<ReturnType<typeof loadAccessData>>['data']) {
  if (p.status !== 'PENDING_APPROVAL') return;
  const f = figures(await linesOf(p.id), await sourcesOf(p.id));
  const planned = treasurerExists(p.createdById, p.systemId, data) ? f.planned : 0;
  const adj = adjustLevels(levelsOf(p), planned, true, p.systemId);
  const same = JSON.stringify(adj.levels) === JSON.stringify(levelsOf(p));
  if (!same || adj.pulledBack) {
    const row = (await prisma.workPlan.update({ where: { id: p.id }, data: { approvalsJson: JSON.stringify(adj.levels), moneyCheckJson: adj.pulledBack || planned === 0 ? null : p.moneyCheckJson ?? null } })) as Plan;
    if (adj.pulledBack || adj.added) {
      for (const id of approversOf(row, data).filter((x) => x !== me))
        await notifySafely(prisma as never, { kind: 'WAITING_FOR_ME', toPersonId: id, systemId: p.systemId, title: `${adj.pulledBack ? 'Money changed, please check again' : 'Figures to check'}: ${p.title}`, body: 'Treasurer', href: `/s/${p.systemId}/work/plans/${p.id}`, important: true, sourceKey: `plan-money:${p.id}:${Date.now()}:${id}` });
    }
  }
}

planMoneyRouter.get('/money-queue', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const { data } = await loadAccessData(me);
  const rows = ((await prisma.workPlan.findMany({ where: { status: 'PENDING_APPROVAL' } })) as Plan[]).filter((p) => !p.deletedAt && currentLevel(p)?.levelKey === 'TREASURER' && canApprove(p, me, data));
  const items = [];
  for (const p of rows) items.push({ id: p.id, systemId: p.systemId, title: p.title, planned: figures(await linesOf(p.id), []).planned });
  res.json({ items });
});

planMoneyRouter.get('/:id/money', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  // The figures are for those who run the activity, hold the unit's money letters, or are asked to decide on it.
  const allowed = canManagePlan(got.p, got.me, got.data) || canReadMoney(got.me, got.p.systemId, got.data) || canApprove(got.p, got.me, got.data);
  if (!allowed) return fail(res, 404, 'NOT_FOUND', 'Not found');
  res.json(await view(got.p, got.me, got.data));
});

const lineSchema = z.object({ title: z.string().trim().min(1).max(TITLE_MAX), amount: z.number().int().min(1).max(AMOUNT_MAX), category: z.string().trim().max(60).nullish(), note: z.string().trim().max(NOTE_MAX).nullish() });

async function editable(req: AuthedRequest, res: Res) {
  const got = await load(req, res);
  if (!got) return null;
  if (!canManagePlan(got.p, got.me, got.data)) return fail(res, 403, 'FORBIDDEN', 'You may not change this activity'), null;
  if (!OPEN.includes(got.p.status)) return fail(res, 409, 'MONEY_LOCKED', 'The money is locked once the activity is approved'), null;
  return got;
}

planMoneyRouter.post('/:id/lines', requireAuth, async (req: AuthedRequest, res) => {
  const got = await editable(req, res);
  if (!got) return;
  const b = lineSchema.safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Please give what it is for and an amount');
  await prisma.moneyPlanItem.create({ data: { systemId: got.p.systemId, year: planYear(got.p), title: b.data.title, amount: b.data.amount, category: b.data.category ?? null, note: b.data.note ?? null, planId: got.p.id, createdById: got.me } });
  await audit(got.me, got.p.systemId, 'MONEY_LINE_ADDED', `Added “${b.data.title}” to “${got.p.title}”`, { planId: got.p.id });
  await changed(got.p, got.me, got.data);
  res.json(await view((await prisma.workPlan.findUnique({ where: { id: got.p.id } })) as Plan, got.me, got.data));
});

planMoneyRouter.patch('/:id/lines/:lineId', requireAuth, async (req: AuthedRequest, res) => {
  const got = await editable(req, res);
  if (!got) return;
  const line = (await prisma.moneyPlanItem.findUnique({ where: { id: String(req.params.lineId) } })) as Line | null;
  if (!line || line.planId !== got.p.id || line.status === 'DROPPED') return fail(res, 404, 'NOT_FOUND', 'Line not found');
  const b = lineSchema.partial().safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Invalid line');
  // Any edit takes the Treasurer's tick away: the line is "modified, pending re-verification".
  await prisma.moneyPlanItem.update({ where: { id: line.id }, data: { ...b.data, checkState: afterEdit(line.checkState), checkedById: null, checkedAt: null } });
  await audit(got.me, got.p.systemId, 'MONEY_LINE_CHANGED', `Changed “${line.title}” in “${got.p.title}”`, { planId: got.p.id, lineId: line.id });
  await changed(got.p, got.me, got.data);
  res.json(await view((await prisma.workPlan.findUnique({ where: { id: got.p.id } })) as Plan, got.me, got.data));
});

planMoneyRouter.delete('/:id/lines/:lineId', requireAuth, async (req: AuthedRequest, res) => {
  const got = await editable(req, res);
  if (!got) return;
  const line = (await prisma.moneyPlanItem.findUnique({ where: { id: String(req.params.lineId) } })) as Line | null;
  if (!line || line.planId !== got.p.id || line.status === 'DROPPED') return fail(res, 404, 'NOT_FOUND', 'Line not found');
  await prisma.moneyPlanItem.update({ where: { id: line.id }, data: { status: 'DROPPED' } });
  await audit(got.me, got.p.systemId, 'MONEY_LINE_REMOVED', `Removed “${line.title}” from “${got.p.title}”`, { planId: got.p.id, lineId: line.id });
  await changed(got.p, got.me, got.data);
  res.json(await view((await prisma.workPlan.findUnique({ where: { id: got.p.id } })) as Plan, got.me, got.data));
});

/** Set the money aside. The only refusal in the money rules: more than a pot has available is turned away. */
planMoneyRouter.put('/:id/sources', requireAuth, async (req: AuthedRequest, res) => {
  const got = await editable(req, res);
  if (!got) return;
  const b = z.object({ sources: z.array(z.object({ kind: z.enum(SOURCE_KINDS), code: z.string().max(40).nullish(), amount: z.number().int().min(0).max(AMOUNT_MAX) })).max(40) }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Invalid sources');
  const wanted: Array<{ kind: string; code: string; amount: number }> = [];
  for (const s of b.data.sources.filter((x) => x.amount > 0)) {
    const code = codeFor(s.kind, s.code);
    if (code === null) return fail(res, 400, 'BAD_SOURCE', 'Unknown source');
    wanted.push({ kind: s.kind, code, amount: s.amount });
  }
  const problem = earmarkProblem(await potsOf(got.p.systemId, got.p.id), wanted);
  if (problem) return fail(res, problem.code === 'INSUFFICIENT_FUNDS' ? 409 : 400, problem.code, 'That is more than is available', problem);
  for (const old of await sourcesOf(got.p.id)) await prisma.planSource.delete({ where: { id: old.id } });
  for (const w of wanted) await prisma.planSource.create({ data: { planId: got.p.id, systemId: got.p.systemId, kind: w.kind, code: w.code, amount: w.amount, createdById: got.me } });
  await audit(got.me, got.p.systemId, 'MONEY_EARMARKED', `Set money aside for “${got.p.title}”`, { planId: got.p.id, sources: wanted });
  await changed(got.p, got.me, got.data);
  res.json(await view((await prisma.workPlan.findUnique({ where: { id: got.p.id } })) as Plan, got.me, got.data));
});

/** The Treasurer ticks or un-ticks one line. */
planMoneyRouter.post('/:id/lines/:lineId/verify', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const level = got.p.status === 'PENDING_APPROVAL' ? currentLevel(got.p) : null;
  if (level?.levelKey !== 'TREASURER' || !canApprove(got.p, got.me, got.data)) return fail(res, 403, 'FORBIDDEN', 'Only the Treasurer checks the figures');
  const line = (await prisma.moneyPlanItem.findUnique({ where: { id: String(req.params.lineId) } })) as Line | null;
  if (!line || line.planId !== got.p.id || line.status === 'DROPPED') return fail(res, 404, 'NOT_FOUND', 'Line not found');
  const on = z.object({ verified: z.boolean() }).safeParse(req.body ?? {});
  const verified = on.success ? on.data.verified : true;
  await prisma.moneyPlanItem.update({ where: { id: line.id }, data: verified ? { checkState: 'VERIFIED', checkedById: got.me, checkedAt: new Date() } : { checkState: null, checkedById: null, checkedAt: null } });
  res.json(await view(got.p, got.me, got.data));
});

/** The Treasurer's answer: figures checked, or a problem flagged. A flag never stops the activity; it travels with it. */
planMoneyRouter.post('/:id/money-check', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, data, p } = got;
  const levels = levelsOf(p);
  const idx = levels.findIndex((l) => l.status === 'PENDING');
  if (p.status !== 'PENDING_APPROVAL' || idx < 0 || levels[idx]!.levelKey !== 'TREASURER') return fail(res, 409, 'WRONG_STATE', 'There is nothing to check now');
  if (!canApprove(p, me, data)) return p.createdById === me ? fail(res, 403, 'OWN_ENTRY', 'Nobody checks their own figures') : fail(res, 403, 'FORBIDDEN', 'Only the Treasurer checks the figures');
  const b = z.object({ result: z.enum(['CHECKED', 'FLAGGED']), note: z.string().trim().max(NOTE_MAX).nullish() }).safeParse(req.body);
  if (!b.success) return fail(res, 400, 'BAD_INPUT', 'Invalid answer');
  const note = b.data.note || null;
  if (b.data.result === 'FLAGGED' && !note) return fail(res, 400, 'NOTE_REQUIRED', 'Please say what the problem is');
  if (b.data.result === 'CHECKED' && !allVerified(await linesOf(p.id))) return fail(res, 409, 'LINES_NOT_VERIFIED', 'Tick every line first');
  const at = new Date().toISOString();
  levels[idx] = { ...levels[idx]!, status: 'APPROVED', byId: me, at, note: checkNote(b.data.result, note) };
  const check: MoneyCheck = { result: b.data.result, note, byId: me, at };
  const row = (await prisma.workPlan.update({ where: { id: p.id }, data: { approvalsJson: JSON.stringify(levels), moneyCheckJson: JSON.stringify(check) } })) as Plan;
  for (const id of approversOf(row, data).filter((x) => x !== me))
    await notifySafely(prisma as never, { kind: 'WAITING_FOR_ME', toPersonId: id, systemId: p.systemId, title: `${b.data.result === 'FLAGGED' ? 'Plan to approve, figures flagged' : 'Plan to approve'}: ${p.title}`, body: currentLevel(row)?.label ?? '', href: `/s/${p.systemId}/work/plans/${p.id}`, important: true, sourceKey: `plan-ask:${p.id}:${currentLevel(row)?.levelKey}:${id}` });
  await audit(me, p.systemId, b.data.result === 'FLAGGED' ? 'MONEY_FLAGGED' : 'MONEY_CHECKED', `${b.data.result === 'FLAGGED' ? 'Flagged' : 'Checked'} the figures of “${p.title}”`, { planId: p.id, note });
  res.json(await view(row, me, data));
});

export { submitProblem };
