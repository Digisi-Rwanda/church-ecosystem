/**
 * The Money block (Module 5): budget, action plan, accounting (planned against actual), contribution
 * lists (team leader → treasurer → president), donations, a member's own contribution, and reports.
 * Mounted beside the older /api/money routes. Totals are computed here, never typed.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { notifySafely } from '../lib/notify.js';
import { buildEffectiveAccess } from '../policy/evaluate.js';
import { loadPolicyContext } from '../policy/loadContext.js';
import { liveHoldings } from '../capabilities/engine.js';
import { CATEGORIES, KINDS, NOTE_MAX, amountProblem, canApproveSpending, canReadMoney, canRecord, isDay } from '../money/rules.js';
import {
  PLAN_STATUS, accounting, combine, counts, editable, goalGroups, isMonth, isYear, linesProblem, monthOf, total, yearOf, type Goal, type LineLike,
} from '../money/block.js';
import { moneySchema, parseStored, EMPTY_MONEY } from '../systemSettings/rules.js';

export const moneyBlockRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);
const day = (v: Date | string) => new Date(v).toISOString().slice(0, 10);

interface UnitRow { id: string; name: string; systemId?: string | null; kind?: string | null; type?: string | null; leaderPersonId?: string | null }
interface Budget { id: string; systemId: string; year: number; status: string; approvedById?: string | null; approvedAt?: Date | string | null }
interface BLine { id: string; systemId: string; year: number; kind: string; category: string; planned: number; note?: string | null }
interface PlanItem { id: string; systemId: string; year: number; title: string; amount: number; dueMonth?: string | null; category?: string | null; status: string; note?: string | null; createdById: string }
interface CList {
  id: string; systemId: string; level: string; typeCode: string; typeName: string; month: string; teamUnitId?: string | null; teamName?: string | null; status: string;
  sourceListIds: string; createdById: string; submittedAt?: Date | string | null; decidedById?: string | null; decisionNote?: string | null;
}
interface CLine { id: string; listId: string; name: string; personId?: string | null; team?: string | null; amount: number }
interface Don { id: string; systemId: string; accountId: string; donorName: string; amount: number; receivedOn: Date | string; note?: string | null; status: string; recordedById: string; decidedById?: string | null; decisionNote?: string | null }
interface Entry { kind: string; amount: number; status: string; category: string; occurredOn: Date | string }

async function ctx(me: string) {
  const { data, units } = await loadAccessData(me);
  return { data, units: units as UnitRow[], now: new Date() };
}
type Ctx = Awaited<ReturnType<typeof ctx>>;

async function audit(actorId: string, systemId: string, action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({ data: { at: new Date(), actorId, systemId, action, resource: 'MONEY', detail, metaJson: JSON.stringify(meta) } });
}

/** What this person may do in this system's money, and which teams they keep lists for. */
async function standingIn(me: string, systemId: string, c: Ctx) {
  const policy = await loadPolicyContext();
  const canEnter = buildEffectiveAccess(me, policy, c.now).some((g) => g.systemId === systemId && g.resource === 'SYSTEM' && g.action === 'ENTER');
  const holdings = liveHoldings(me, c.data, c.now);
  const teams = c.units.filter(
    (u) => (u.kind === 'TEAM' || u.type === 'TEAM') && u.systemId === systemId && (u.leaderPersonId === me || holdings.some((h) => h.office === 'COORDINATOR' && h.orgUnitId === u.id)),
  );
  return {
    canEnter,
    read: canReadMoney(me, systemId, c.data, c.now),
    write: canRecord(me, systemId, c.data, c.now),
    approve: canApproveSpending(me, systemId, c.data, c.now),
    teams,
  };
}
type Standing = Awaited<ReturnType<typeof standingIn>>;

async function moneyTypes(systemId: string) {
  const row = (await prisma.systemSetting.findUnique({ where: { systemId } })) as { moneyJson?: string } | null;
  return parseStored(row?.moneyJson, moneySchema, EMPTY_MONEY).types;
}

async function holdersOf(systemId: string, c: Ctx, letter: 'write' | 'approve', notId: string): Promise<string[]> {
  const ids = [...new Set((c.data.positions as Array<{ personId: string }>).map((p) => p.personId))];
  const test = letter === 'write' ? canRecord : canApproveSpending;
  return ids.filter((id) => id !== notId && test(id, systemId, c.data, c.now));
}
async function tell(ids: string[], systemId: string, title: string, body: string | null, key: string, important = true) {
  for (const id of ids) {
    await notifySafely(prisma as never, { kind: 'WAITING_FOR_ME', toPersonId: id, systemId, title, body, href: `/s/${systemId}/money/contributions`, important, sourceKey: `${key}:${id}` });
  }
}

const sys = (req: AuthedRequest) => String(req.query.systemId ?? req.body?.systemId ?? '');
const yearOfReq = (req: AuthedRequest) => {
  const y = Number(req.query.year ?? req.body?.year ?? new Date().getUTCFullYear());
  return isYear(y) ? y : null;
};
/** Read access to a system's money, or a 404 that does not say the system exists. */
async function gate(req: AuthedRequest, res: Res, need: 'read' | 'write' | 'approve' | 'enter' = 'read', forSystem?: string) {
  const me = req.auth!.personId;
  const systemId = forSystem ?? sys(req);
  const c = await ctx(me);
  const s = systemId ? await standingIn(me, systemId, c) : null;
  const ok = !!s && (need === 'enter' ? s.canEnter : need === 'read' ? s.read : need === 'write' ? s.read && s.write : s.read && s.approve);
  if (!ok || !s) {
    fail(res, s && s.read ? 403 : 404, s && s.read ? 'FORBIDDEN' : 'NOT_FOUND', s && s.read ? 'You may not do this here' : 'Not found');
    return null;
  }
  return { me, systemId, c, s };
}

/* ───────────── budget ───────────── */

async function budgetOf(systemId: string, year: number) {
  const b = (await prisma.moneyBudget.findFirst({ where: { systemId, year } })) as Budget | null;
  const lines = ((await prisma.moneyBudgetLine.findMany({ where: { systemId, year } })) as BLine[]).sort((a, b) => a.kind.localeCompare(b.kind) || a.category.localeCompare(b.category));
  return { status: b?.status ?? 'DRAFT', approvedAt: iso(b?.approvedAt), lines };
}

moneyBlockRouter.get('/budget', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gate(req, res);
  const year = yearOfReq(req);
  if (!g) return;
  if (!year) return fail(res, 400, 'BAD_YEAR', 'Pick a year');
  const b = await budgetOf(g.systemId, year);
  const sum = (kind: string) => b.lines.filter((l) => l.kind === kind).reduce((s, l) => s + l.planned, 0);
  res.json({
    year, status: b.status, approvedAt: b.approvedAt, canWrite: g.s.write && b.status === 'DRAFT', canApprove: g.s.approve, categories: CATEGORIES,
    lines: b.lines.map((l) => ({ id: l.id, kind: l.kind, category: l.category, planned: l.planned, note: l.note ?? '' })),
    totals: { income: sum('INCOME'), spending: sum('SPENDING'), net: sum('INCOME') - sum('SPENDING') },
  });
});

const lineSchema = z.object({
  systemId: z.string().min(1), year: z.number(), kind: z.enum(KINDS), category: z.enum(CATEGORIES),
  planned: z.number().int().min(0).max(2_000_000_000), note: z.string().trim().max(NOTE_MAX).nullish(),
});

/** One planned amount per kind and category; zero removes the line. Only while the budget is a draft. */
moneyBlockRouter.put('/budget/lines', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gate(req, res, 'write');
  if (!g) return;
  const p = lineSchema.safeParse(req.body);
  if (!p.success || !isYear(p.data.year)) return fail(res, 400, 'BAD_INPUT', 'Check the line');
  const { year, kind, category, planned } = p.data;
  const b = await budgetOf(g.systemId, year);
  if (b.status !== 'DRAFT') return fail(res, 409, 'BUDGET_APPROVED', 'The president approved this budget; ask to reopen it');
  const existing = b.lines.find((l) => l.kind === kind && l.category === category);
  if (planned === 0) {
    if (existing) await prisma.moneyBudgetLine.delete({ where: { id: existing.id } });
  } else if (existing) {
    await prisma.moneyBudgetLine.update({ where: { id: existing.id }, data: { planned, note: p.data.note || null, updatedById: g.me, updatedAt: new Date() } });
  } else {
    await prisma.moneyBudgetLine.create({ data: { systemId: g.systemId, year, kind, category, planned, note: p.data.note || null, updatedById: g.me, updatedAt: new Date() } });
  }
  await audit(g.me, g.systemId, 'MONEY_BUDGET_LINE', `${year} ${kind} ${category}: ${planned} RWF`, { year, kind, category, planned });
  res.json({ ok: true });
});

async function setBudgetStatus(req: AuthedRequest, res: Res, status: 'APPROVED' | 'DRAFT') {
  const g = await gate(req, res, 'approve');
  const year = yearOfReq(req);
  if (!g) return;
  if (!year) return fail(res, 400, 'BAD_YEAR', 'Pick a year');
  const b = (await prisma.moneyBudget.findFirst({ where: { systemId: g.systemId, year } })) as Budget | null;
  if (status === 'APPROVED' && (await budgetOf(g.systemId, year)).lines.length === 0) return fail(res, 409, 'EMPTY_BUDGET', 'Add budget lines first');
  const data = { status, approvedById: status === 'APPROVED' ? g.me : null, approvedAt: status === 'APPROVED' ? new Date() : null };
  if (b) await prisma.moneyBudget.update({ where: { id: b.id }, data });
  else await prisma.moneyBudget.create({ data: { systemId: g.systemId, year, createdAt: new Date(), ...data } });
  await audit(g.me, g.systemId, status === 'APPROVED' ? 'MONEY_BUDGET_APPROVED' : 'MONEY_BUDGET_REOPENED', `${year} budget`, { year });
  if (status === 'APPROVED') await tell(await holdersOf(g.systemId, g.c, 'write', g.me), g.systemId, `Budget ${year} approved`, null, `money-budget:${g.systemId}:${year}`, false);
  res.json({ ok: true });
}
moneyBlockRouter.post('/budget/approve', requireAuth, (req, res) => setBudgetStatus(req as AuthedRequest, res, 'APPROVED'));
moneyBlockRouter.post('/budget/reopen', requireAuth, (req, res) => setBudgetStatus(req as AuthedRequest, res, 'DRAFT'));

/* ───────────── action plan ───────────── */

const shapePlan = (i: PlanItem) => ({ id: i.id, title: i.title, amount: i.amount, dueMonth: i.dueMonth ?? '', category: i.category ?? '', status: i.status, note: i.note ?? '' });

moneyBlockRouter.get('/plan', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gate(req, res);
  const year = yearOfReq(req);
  if (!g) return;
  if (!year) return fail(res, 400, 'BAD_YEAR', 'Pick a year');
  const items = ((await prisma.moneyPlanItem.findMany({ where: { systemId: g.systemId, year } })) as PlanItem[]).sort((a, b) => (a.dueMonth ?? '9').localeCompare(b.dueMonth ?? '9') || a.title.localeCompare(b.title));
  const budget = await budgetOf(g.systemId, year);
  const live = items.filter((i) => i.status !== 'DROPPED');
  res.json({
    year, canWrite: g.s.write, categories: CATEGORIES, items: items.map(shapePlan),
    totals: { planned: live.reduce((s, i) => s + i.amount, 0), done: items.filter((i) => i.status === 'DONE').reduce((s, i) => s + i.amount, 0), budgetSpending: budget.lines.filter((l) => l.kind === 'SPENDING').reduce((s, l) => s + l.planned, 0) },
  });
});

const planSchema = z.object({
  systemId: z.string().min(1), year: z.number(), title: z.string().trim().min(1).max(120), amount: z.number().int().min(0).max(2_000_000_000),
  dueMonth: z.string().nullish(), category: z.enum(CATEGORIES).nullish(), note: z.string().trim().max(NOTE_MAX).nullish(),
});

moneyBlockRouter.post('/plan', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gate(req, res, 'write');
  if (!g) return;
  const p = planSchema.safeParse(req.body);
  if (!p.success || !isYear(p.data.year) || (p.data.dueMonth && !isMonth(p.data.dueMonth))) return fail(res, 400, 'BAD_INPUT', 'Check the activity');
  const row = (await prisma.moneyPlanItem.create({
    data: { systemId: g.systemId, year: p.data.year, title: p.data.title, amount: p.data.amount, dueMonth: p.data.dueMonth || null, category: p.data.category || null, status: 'PLANNED', note: p.data.note || null, createdById: g.me, createdAt: new Date() },
  })) as PlanItem;
  await audit(g.me, g.systemId, 'MONEY_PLAN_ITEM', `Planned “${row.title}” ${row.amount} RWF`, { id: row.id });
  res.status(201).json({ id: row.id });
});

moneyBlockRouter.patch('/plan/:id', requireAuth, async (req: AuthedRequest, res) => {
  const item = (await prisma.moneyPlanItem.findUnique({ where: { id: String(req.params.id) } })) as PlanItem | null;
  if (!item) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const g = await gate(req, res, 'write', item.systemId);
  if (!g) return;
  const p = planSchema.partial().omit({ systemId: true, year: true }).extend({ status: z.enum(PLAN_STATUS).optional() }).safeParse(req.body);
  if (!p.success || (p.data.dueMonth && !isMonth(p.data.dueMonth))) return fail(res, 400, 'BAD_INPUT', 'Check the activity');
  const d = p.data;
  await prisma.moneyPlanItem.update({
    where: { id: item.id },
    data: {
      ...(d.title !== undefined && { title: d.title }), ...(d.amount !== undefined && { amount: d.amount }),
      ...(d.dueMonth !== undefined && { dueMonth: d.dueMonth || null }), ...(d.category !== undefined && { category: d.category || null }),
      ...(d.note !== undefined && { note: d.note || null }), ...(d.status !== undefined && { status: d.status }),
    },
  });
  await audit(g.me, g.systemId, 'MONEY_PLAN_ITEM', `Changed “${item.title}”`, { id: item.id, ...d });
  res.json({ ok: true });
});

/* ───────────── accounting: planned against actual ───────────── */

async function entriesOf(systemId: string) {
  return (await prisma.moneyEntry.findMany({ where: { systemId } })) as Entry[];
}

moneyBlockRouter.get('/accounting', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gate(req, res);
  const year = yearOfReq(req);
  if (!g) return;
  if (!year) return fail(res, 400, 'BAD_YEAR', 'Pick a year');
  const b = await budgetOf(g.systemId, year);
  res.json({ year, budgetStatus: b.status, ...accounting(b.lines, await entriesOf(g.systemId), year) });
});

/* ───────────── contribution lists ───────────── */

const shapeList = (l: CList, lines: CLine[], types: Array<{ code: string } & Goal>, me: string, s: Standing, names: Map<string, string>) => {
  const mine = l.level === 'TEAM' && s.teams.some((t) => t.id === l.teamUnitId);
  const goal: Goal = types.find((t) => t.code === l.typeCode) ?? {};
  return {
    id: l.id, level: l.level, typeCode: l.typeCode, typeName: l.typeName, month: l.month, teamName: l.teamName ?? null, status: l.status,
    fromTeams: (JSON.parse(l.sourceListIds || '[]') as string[]).length, createdByName: names.get(l.createdById) ?? '',
    decisionNote: l.decisionNote ?? null, total: total(lines),
    lines: lines.map((x) => ({ id: x.id, name: x.name, personId: x.personId ?? null, team: x.team ?? null, amount: x.amount })),
    goals: goalGroups(goal, lines), goal: goal.goalAmount ? { amount: goal.goalAmount, per: goal.goalPer } : null,
    canEdit: editable(l.status) && (l.level === 'UNIT' ? s.write : mine || s.write),
    canSubmit: editable(l.status) && (l.level === 'UNIT' ? s.write : mine || s.write) && lines.length > 0,
    canReturn: (l.level === 'TEAM' && l.status === 'SUBMITTED' && s.write) || (l.level === 'UNIT' && l.status === 'SUBMITTED' && s.approve && l.createdById !== me),
    canApprove: l.level === 'UNIT' && l.status === 'SUBMITTED' && s.approve && l.createdById !== me,
  };
};

async function peopleNames(ids: string[]) {
  const out = new Map<string, string>();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return out;
  for (const p of (await prisma.person.findMany({ where: { id: { in: uniq } } })) as Array<{ id: string; fullName: string }>) out.set(p.id, p.fullName);
  return out;
}

/** Who may see a list: the oversight offices see all that left the team; a team leader also sees their own team's drafts. */
function visible(l: CList, s: Standing) {
  if (s.read && (l.level === 'UNIT' || l.status !== 'DRAFT' || s.write)) return true;
  return l.level === 'TEAM' && s.teams.some((t) => t.id === l.teamUnitId);
}

moneyBlockRouter.get('/lists', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = String(req.query.systemId ?? '');
  const c = await ctx(me);
  const s = systemId ? await standingIn(me, systemId, c) : null;
  if (!s || !s.canEnter || (!s.read && s.teams.length === 0)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const month = typeof req.query.month === 'string' ? req.query.month : '';
  const lists = ((await prisma.contributionList.findMany({ where: { systemId } })) as CList[]).filter((l) => (!month || l.month === month) && visible(l, s));
  lists.sort((a, b) => b.month.localeCompare(a.month) || a.typeName.localeCompare(b.typeName) || (a.level === 'UNIT' ? -1 : 1) || (a.teamName ?? '').localeCompare(b.teamName ?? ''));
  const all = ((await prisma.contributionLine.findMany({ where: { listId: { in: lists.map((l) => l.id) } } })) as CLine[]);
  const types = await moneyTypes(systemId);
  const names = await peopleNames(lists.map((l) => l.createdById));
  res.json({
    canWrite: s.write, canApprove: s.approve, types: types.map((t) => ({ code: t.code, name: t.name })),
    teams: (s.write ? c.units.filter((u) => (u.kind === 'TEAM' || u.type === 'TEAM') && u.systemId === systemId) : s.teams).map((u) => ({ id: u.id, name: u.name })),
    lists: lists.map((l) => shapeList(l, all.filter((x) => x.listId === l.id), types, me, s, names)),
  });
});

const createSchema = z.object({ systemId: z.string().min(1), level: z.enum(['TEAM', 'UNIT']), typeCode: z.string().min(1), month: z.string(), teamUnitId: z.string().nullish() });

moneyBlockRouter.post('/lists', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const p = createSchema.safeParse(req.body);
  if (!p.success || !isMonth(p.data.month)) return fail(res, 400, 'BAD_INPUT', 'Check the list');
  const c = await ctx(me);
  const s = await standingIn(me, p.data.systemId, c);
  if (!s.canEnter) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const type = (await moneyTypes(p.data.systemId)).find((t) => t.code === p.data.typeCode);
  if (!type) return fail(res, 400, 'UNKNOWN_TYPE', 'Choose one of this unit’s contribution types');
  let team: UnitRow | undefined;
  if (p.data.level === 'UNIT') {
    if (!s.write) return fail(res, 403, 'FORBIDDEN', 'Only the treasurer records the unit list');
  } else {
    team = c.units.find((u) => u.id === p.data.teamUnitId && (u.kind === 'TEAM' || u.type === 'TEAM') && u.systemId === p.data.systemId);
    if (!team) return fail(res, 400, 'UNKNOWN_TEAM', 'Choose a team of this unit');
    if (!s.teams.some((t) => t.id === team!.id) && !s.write) return fail(res, 403, 'FORBIDDEN', 'Only the team leader records the team list');
  }
  const dup = ((await prisma.contributionList.findMany({ where: { systemId: p.data.systemId, month: p.data.month, typeCode: type.code } })) as CList[]).find(
    (l) => l.level === p.data.level && (l.teamUnitId ?? null) === (team?.id ?? null),
  );
  if (dup) return fail(res, 409, 'LIST_EXISTS', 'There is already a list for this type and month');
  const row = (await prisma.contributionList.create({
    data: {
      systemId: p.data.systemId, level: p.data.level, typeCode: type.code, typeName: type.name, month: p.data.month, teamUnitId: team?.id ?? null, teamName: team?.name ?? null,
      status: 'DRAFT', sourceListIds: '[]', createdById: me, createdAt: new Date(),
    },
  })) as CList;
  await audit(me, row.systemId, 'MONEY_LIST_STARTED', `${row.level} list ${row.typeName} ${row.month}`, { id: row.id });
  res.status(201).json({ id: row.id });
});

async function listFor(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const l = (await prisma.contributionList.findUnique({ where: { id: String(req.params.id) } })) as CList | null;
  const c = l ? await ctx(me) : null;
  const s = l && c ? await standingIn(me, l.systemId, c) : null;
  if (!l || !c || !s || !s.canEnter || !visible(l, s)) {
    fail(res, 404, 'NOT_FOUND', 'Not found');
    return null;
  }
  return { me, l, c, s };
}
const linesOf = async (listId: string) => (await prisma.contributionLine.findMany({ where: { listId } })) as CLine[];

const putSchema = z.object({
  lines: z.array(z.object({ name: z.string(), personId: z.string().nullish(), team: z.string().nullish(), amount: z.number() })).max(500),
});

/** Replace the lines of a list that is still being written. */
moneyBlockRouter.put('/lists/:id', requireAuth, async (req: AuthedRequest, res) => {
  const got = await listFor(req, res);
  if (!got) return;
  const { me, l, s } = got;
  const mine = l.level === 'TEAM' && s.teams.some((t) => t.id === l.teamUnitId);
  if (!editable(l.status) || !(l.level === 'UNIT' ? s.write : mine || s.write)) return fail(res, 403, 'FORBIDDEN', 'This list cannot be changed now');
  const p = putSchema.safeParse(req.body);
  if (!p.success) return fail(res, 400, 'BAD_INPUT', 'Check the lines');
  const bad = linesProblem(p.data.lines);
  if (bad) return fail(res, 400, bad, bad === 'AMOUNT' ? 'Each amount is a whole number of francs above zero' : 'Check the lines');
  await prisma.contributionLine.deleteMany({ where: { listId: l.id } });
  for (const x of p.data.lines) {
    await prisma.contributionLine.create({ data: { listId: l.id, name: x.name.trim(), personId: x.personId || null, team: l.level === 'TEAM' ? l.teamName ?? null : x.team || null, amount: x.amount } });
  }
  await audit(me, l.systemId, 'MONEY_LIST_SAVED', `${l.typeName} ${l.month}: ${p.data.lines.length} lines`, { id: l.id });
  res.json({ ok: true });
});

moneyBlockRouter.post('/lists/:id/submit', requireAuth, async (req: AuthedRequest, res) => {
  const got = await listFor(req, res);
  if (!got) return;
  const { me, l, c, s } = got;
  const mine = l.level === 'TEAM' && s.teams.some((t) => t.id === l.teamUnitId);
  if (!editable(l.status) || !(l.level === 'UNIT' ? s.write : mine || s.write)) return fail(res, 403, 'FORBIDDEN', 'This list cannot be submitted now');
  if ((await linesOf(l.id)).length === 0) return fail(res, 409, 'EMPTY_LIST', 'Add at least one line first');
  await prisma.contributionList.update({ where: { id: l.id }, data: { status: 'SUBMITTED', submittedAt: new Date(), decisionNote: null } });
  const to = await holdersOf(l.systemId, c, l.level === 'TEAM' ? 'write' : 'approve', me);
  await tell(to, l.systemId, l.level === 'TEAM' ? `Team list from ${l.teamName}: ${l.typeName} ${l.month}` : `Contribution list to approve: ${l.typeName} ${l.month}`, null, `money-list:${l.id}:${Date.now()}`);
  await audit(me, l.systemId, 'MONEY_LIST_SUBMITTED', `${l.level} ${l.typeName} ${l.month}`, { id: l.id });
  res.json({ ok: true });
});

moneyBlockRouter.post('/lists/:id/return', requireAuth, async (req: AuthedRequest, res) => {
  const got = await listFor(req, res);
  if (!got) return;
  const { me, l, s } = got;
  const allowed = (l.level === 'TEAM' && l.status === 'SUBMITTED' && s.write) || (l.level === 'UNIT' && l.status === 'SUBMITTED' && s.approve && l.createdById !== me);
  if (!allowed) return fail(res, 403, 'FORBIDDEN', 'You may not return this list');
  const p = z.object({ reason: z.string().trim().min(1).max(NOTE_MAX) }).safeParse(req.body);
  if (!p.success) return fail(res, 400, 'REASON_REQUIRED', 'Please give a reason');
  await prisma.contributionList.update({ where: { id: l.id }, data: { status: 'RETURNED', decidedById: me, decidedAt: new Date(), decisionNote: p.data.reason } });
  await notifySafely(prisma as never, { kind: 'FOR_INFORMATION', toPersonId: l.createdById, systemId: l.systemId, title: `List returned: ${l.typeName} ${l.month}`, body: p.data.reason, href: `/s/${l.systemId}/money/contributions`, sourceKey: `money-list-returned:${l.id}:${Date.now()}` });
  await audit(me, l.systemId, 'MONEY_LIST_RETURNED', `${l.typeName} ${l.month}`, { id: l.id, reason: p.data.reason });
  res.json({ ok: true });
});

moneyBlockRouter.post('/lists/:id/approve', requireAuth, async (req: AuthedRequest, res) => {
  const got = await listFor(req, res);
  if (!got) return;
  const { me, l, s } = got;
  if (l.level !== 'UNIT' || l.status !== 'SUBMITTED') return fail(res, 409, 'WRONG_STATE', 'This list is not waiting for approval');
  if (l.createdById === me) return fail(res, 403, 'OWN_ENTRY', 'Nobody approves their own list');
  if (!s.approve) return fail(res, 403, 'FORBIDDEN', 'Only the unit president approves');
  await prisma.contributionList.update({ where: { id: l.id }, data: { status: 'APPROVED', decidedById: me, decidedAt: new Date(), decisionNote: null } });
  await notifySafely(prisma as never, { kind: 'FOR_INFORMATION', toPersonId: l.createdById, systemId: l.systemId, title: `List approved: ${l.typeName} ${l.month}`, body: null, href: `/s/${l.systemId}/money/contributions`, sourceKey: `money-list-approved:${l.id}` });
  await audit(me, l.systemId, 'MONEY_LIST_APPROVED', `${l.typeName} ${l.month}`, { id: l.id });
  res.json({ ok: true });
});

/** The treasurer combines the team lists that are with them into one unit list with a Team column. */
moneyBlockRouter.post('/lists/combine', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gate(req, res, 'write');
  if (!g) return;
  const p = z.object({ systemId: z.string(), typeCode: z.string().min(1), month: z.string() }).safeParse(req.body);
  if (!p.success || !isMonth(p.data.month)) return fail(res, 400, 'BAD_INPUT', 'Check the type and month');
  const type = (await moneyTypes(g.systemId)).find((t) => t.code === p.data.typeCode);
  if (!type) return fail(res, 400, 'UNKNOWN_TYPE', 'Choose one of this unit’s contribution types');
  const all = (await prisma.contributionList.findMany({ where: { systemId: g.systemId, month: p.data.month, typeCode: type.code } })) as CList[];
  const teams = all.filter((l) => l.level === 'TEAM' && l.status === 'SUBMITTED');
  if (teams.length === 0) return fail(res, 409, 'NOTHING_TO_COMBINE', 'No team list is waiting with the treasurer');
  let unit = all.find((l) => l.level === 'UNIT');
  if (unit && !editable(unit.status)) return fail(res, 409, 'WRONG_STATE', 'The unit list for this month is already submitted');
  const merged = combine(await Promise.all(teams.map(async (t) => ({ id: t.id, teamName: t.teamName ?? null, lines: await linesOf(t.id) }))));
  if (!unit) {
    unit = (await prisma.contributionList.create({
      data: { systemId: g.systemId, level: 'UNIT', typeCode: type.code, typeName: type.name, month: p.data.month, status: 'DRAFT', sourceListIds: '[]', createdById: g.me, createdAt: new Date() },
    })) as CList;
  }
  // Lines already on the unit list from earlier teams stay; the new teams' lines are added after them.
  for (const x of merged.lines) await prisma.contributionLine.create({ data: { listId: unit.id, name: x.name, personId: x.personId ?? null, team: x.team ?? null, amount: x.amount } });
  const before = JSON.parse(unit.sourceListIds || '[]') as string[];
  await prisma.contributionList.update({ where: { id: unit.id }, data: { sourceListIds: JSON.stringify([...before, ...merged.sourceListIds]) } });
  for (const t of teams) await prisma.contributionList.update({ where: { id: t.id }, data: { status: 'COMBINED' } });
  await audit(g.me, g.systemId, 'MONEY_LISTS_COMBINED', `${teams.length} team lists into ${type.name} ${p.data.month}`, { unitListId: unit.id, from: merged.sourceListIds });
  res.status(201).json({ id: unit.id, combined: teams.length });
});

/* ───────────── donations ───────────── */

const shapeDon = (d: Don, names: Map<string, string>, me: string, s: Standing) => ({
  id: d.id, donorName: d.donorName, amount: d.amount, receivedOn: day(d.receivedOn), note: d.note ?? '', status: d.status,
  recordedByName: names.get(d.recordedById) ?? '', decisionNote: d.decisionNote ?? null,
  canDecide: d.status === 'PENDING' && s.approve && d.recordedById !== me,
});

moneyBlockRouter.get('/donations', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gate(req, res);
  if (!g) return;
  const rows = ((await prisma.donation.findMany({ where: { systemId: g.systemId } })) as Don[]).sort((a, b) => day(b.receivedOn).localeCompare(day(a.receivedOn))).slice(0, 200);
  const names = await peopleNames(rows.map((d) => d.recordedById));
  res.json({ canRecord: g.s.write, canApprove: g.s.approve, donations: rows.map((d) => shapeDon(d, names, g.me, g.s)) });
});

moneyBlockRouter.post('/donations', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gate(req, res, 'write');
  if (!g) return;
  const p = z.object({ systemId: z.string(), accountId: z.string().min(1), donorName: z.string().trim().min(1).max(80), amount: z.number(), receivedOn: z.string(), note: z.string().trim().max(NOTE_MAX).nullish() }).safeParse(req.body);
  if (!p.success) return fail(res, 400, 'BAD_INPUT', 'Check the donation');
  if (amountProblem(p.data.amount)) return fail(res, 400, 'AMOUNT', 'Enter a whole amount in francs, above zero');
  if (!isDay(p.data.receivedOn)) return fail(res, 400, 'BAD_DATE', 'Enter the day it was received');
  const acc = (await prisma.moneyAccount.findUnique({ where: { id: p.data.accountId } })) as { systemId: string; status: string } | null;
  if (!acc || acc.systemId !== g.systemId || acc.status !== 'ACTIVE') return fail(res, 400, 'ACCOUNT', 'Choose an open account of this unit');
  const row = (await prisma.donation.create({
    data: { systemId: g.systemId, accountId: p.data.accountId, donorName: p.data.donorName, amount: p.data.amount, receivedOn: new Date(`${p.data.receivedOn}T00:00:00Z`), note: p.data.note || null, status: 'PENDING', recordedById: g.me, recordedAt: new Date() },
  })) as Don;
  await tell(await holdersOf(g.systemId, g.c, 'approve', g.me), g.systemId, `Donation to approve: ${row.amount.toLocaleString('en')} RWF`, row.donorName, `money-donation:${row.id}`);
  await audit(g.me, g.systemId, 'MONEY_DONATION_RECORDED', `${row.amount} RWF from ${row.donorName}`, { id: row.id });
  res.status(201).json({ id: row.id });
});

async function decideDonation(req: AuthedRequest, res: Res, approve: boolean) {
  const me = req.auth!.personId;
  const d = (await prisma.donation.findUnique({ where: { id: String(req.params.id) } })) as Don | null;
  const c = d ? await ctx(me) : null;
  const s = d && c ? await standingIn(me, d.systemId, c) : null;
  if (!d || !c || !s || !s.read) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (d.status !== 'PENDING') return fail(res, 409, 'WRONG_STATE', 'This donation is already decided');
  if (d.recordedById === me) return fail(res, 403, 'OWN_ENTRY', 'Nobody approves their own entry');
  if (!s.approve) return fail(res, 403, 'FORBIDDEN', 'Only the unit president approves donations');
  const reason = z.object({ reason: z.string().trim().max(NOTE_MAX).nullish() }).safeParse(req.body ?? {});
  const note = (reason.success && reason.data.reason) || null;
  if (!approve && !note) return fail(res, 400, 'REASON_REQUIRED', 'Please give a reason');
  let entryId: string | null = null;
  if (approve) {
    const acc = (await prisma.moneyAccount.findUnique({ where: { id: d.accountId } })) as { orgUnitId: string; status: string } | null;
    if (!acc || acc.status !== 'ACTIVE') return fail(res, 409, 'ACCOUNT_CLOSED', 'The account is closed; ask the treasurer to record it again');
    const e = (await prisma.moneyEntry.create({
      data: { accountId: d.accountId, orgUnitId: acc.orgUnitId, systemId: d.systemId, kind: 'INCOME', amount: d.amount, occurredOn: new Date(d.receivedOn), category: 'DONATION', note: `Donation from ${d.donorName}`, status: 'RECORDED', recordedById: d.recordedById, recordedAt: new Date() },
    })) as { id: string };
    entryId = e.id;
  }
  await prisma.donation.update({ where: { id: d.id }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: me, decidedAt: new Date(), decisionNote: note, entryId } });
  await notifySafely(prisma as never, { kind: 'FOR_INFORMATION', toPersonId: d.recordedById, systemId: d.systemId, title: `Donation ${approve ? 'approved' : 'declined'}: ${d.amount.toLocaleString('en')} RWF`, body: note, href: `/s/${d.systemId}/money/contributions`, sourceKey: `money-donation-decided:${d.id}` });
  await audit(me, d.systemId, approve ? 'MONEY_DONATION_APPROVED' : 'MONEY_DONATION_DECLINED', `${d.amount} RWF`, { id: d.id });
  res.json({ ok: true });
}
moneyBlockRouter.post('/donations/:id/approve', requireAuth, (req, res) => decideDonation(req as AuthedRequest, res, true));
moneyBlockRouter.post('/donations/:id/reject', requireAuth, (req, res) => decideDonation(req as AuthedRequest, res, false));

/* ───────────── my contribution ───────────── */

/** A member's own view: what they gave, by type, with the goal if the unit set one. Members have no claims here. */
moneyBlockRouter.get('/mine', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gate(req, res, 'enter');
  const year = yearOfReq(req);
  if (!g) return;
  if (!year) return fail(res, 400, 'BAD_YEAR', 'Pick a year');
  const types = await moneyTypes(g.systemId);
  const lists = ((await prisma.contributionList.findMany({ where: { systemId: g.systemId } })) as CList[]).filter((l) => l.month.startsWith(`${year}-`));
  const lines = (await prisma.contributionLine.findMany({ where: { personId: g.me } })) as CLine[];
  const mine = lines.flatMap((x) => {
    const l = lists.find((y) => y.id === x.listId);
    return l ? [{ l, x }] : [];
  });
  const counted = mine.filter(({ l }) => counts(l));
  const rows = types.map((t) => {
    const own = counted.filter(({ l }) => l.typeCode === t.code);
    const sum = total(own.map(({ x }) => x));
    return {
      code: t.code, name: t.name, total: sum, goal: t.goalAmount ?? null, goalPer: t.goalPer ?? null,
      // A member goal is read against the member's own total; a team goal belongs to the team, not to one person.
      reached: t.goalAmount && t.goalPer === 'MEMBER' ? sum >= t.goalAmount : null,
    };
  });
  const teams = g.s.teams.map((t) => ({ id: t.id, name: t.name }));
  res.json({
    year, types: rows, grandTotal: rows.reduce((s, r) => s + r.total, 0), teams,
    history: mine
      .sort((a, b) => b.l.month.localeCompare(a.l.month))
      .map(({ l, x }) => ({ id: x.id, month: l.month, typeName: l.typeName, amount: x.amount, status: l.status, team: x.team ?? null })),
  });
});

/* ───────────── reports ───────────── */

moneyBlockRouter.get('/report', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gate(req, res);
  const year = yearOfReq(req);
  if (!g) return;
  if (!year) return fail(res, 400, 'BAD_YEAR', 'Pick a year');
  const b = await budgetOf(g.systemId, year);
  const entries = (await entriesOf(g.systemId)).filter((e) => yearOf(e.occurredOn) === year);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`).map((m) => {
    const of = entries.filter((e) => monthOf(e.occurredOn) === m);
    return {
      month: m,
      income: of.filter((e) => e.kind === 'INCOME' && e.status === 'RECORDED').reduce((s, e) => s + e.amount, 0),
      spending: of.filter((e) => e.kind === 'SPENDING' && e.status === 'APPROVED').reduce((s, e) => s + e.amount, 0),
    };
  });
  const lists = ((await prisma.contributionList.findMany({ where: { systemId: g.systemId } })) as CList[]).filter((l) => l.month.startsWith(`${year}-`));
  const lines = (await prisma.contributionLine.findMany({ where: { listId: { in: lists.map((l) => l.id) } } })) as CLine[];
  const byType = new Map<string, { code: string; name: string; approved: number; inProgress: number }>();
  for (const l of lists.filter(counts)) {
    const cur = byType.get(l.typeCode) ?? { code: l.typeCode, name: l.typeName, approved: 0, inProgress: 0 };
    const sum = total(lines.filter((x) => x.listId === l.id));
    if (l.status === 'APPROVED') cur.approved += sum;
    else cur.inProgress += sum;
    byType.set(l.typeCode, cur);
  }
  const donations = ((await prisma.donation.findMany({ where: { systemId: g.systemId } })) as Don[]).filter((d) => yearOf(d.receivedOn) === year);
  const plan = ((await prisma.moneyPlanItem.findMany({ where: { systemId: g.systemId, year } })) as PlanItem[]).filter((i) => i.status !== 'DROPPED');
  res.json({
    year, budgetStatus: b.status, ...accounting(b.lines, entries, year), months, contributions: [...byType.values()],
    donations: { approved: donations.filter((d) => d.status === 'APPROVED').reduce((s, d) => s + d.amount, 0), waiting: donations.filter((d) => d.status === 'PENDING').reduce((s, d) => s + d.amount, 0) },
    plan: { items: plan.length, planned: plan.reduce((s, i) => s + i.amount, 0), done: plan.filter((i) => i.status === 'DONE').length },
  });
});
