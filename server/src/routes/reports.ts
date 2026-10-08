/**
 * Reports (slice 3.5): composed from live records, frozen when published, plus the monthly
 * schedules that say which reports each unit owes. Money and offering counts stay in separate reports.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { notifySafely } from '../lib/notify.js';
import type { AccessData } from '../capabilities/engine.js';
import { CHURCH_WIDE, KINDS, buildSnapshot, periodOk, scheduleStatus, type ReportKind, type Sources } from '../reports/builders.js';
import { canCompose, canPublish, canReadReports, canReadSource } from '../reports/access.js';

export const reportsRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const iso = (v: Date | string | null | undefined) => (v ? (v instanceof Date ? v : new Date(v)).toISOString() : null);

interface UnitRow { id: string; name: string; systemId?: string | null }
interface ReportRow {
  id: string; systemId: string; orgUnitId: string; kind: ReportKind; periodKey: string; title: string; status: string; snapshotJson: string;
  composedById: string; composedAt: Date | string; publishedById?: string | null; publishedAt?: Date | string | null; deletedAt?: Date | string | null;
}
interface ScheduleRow { id: string; systemId: string; orgUnitId: string; kind: ReportKind; dueDay: number; active: boolean; createdById: string }

async function ctx(me: string) {
  const { data, units } = await loadAccessData(me);
  return { data, units: units as UnitRow[] };
}
type Ctx = Awaited<ReturnType<typeof ctx>>;
const unitName = (c: Ctx, id: string) => c.units.find((u) => u.id === id)?.name ?? '';

async function names(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (!uniq.length) return out;
  const rows = (await prisma.person.findMany({ where: { id: { in: uniq } } })) as Array<{ id: string; fullName: string }>;
  for (const p of rows) out.set(p.id, p.fullName);
  return out;
}
async function audit(actorId: string, systemId: string, action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({ data: { at: new Date(), actorId, systemId, action, resource: 'REPORTS', detail, metaJson: JSON.stringify(meta) } });
}

/** Everything a builder may need for one unit, read once. */
async function sourcesFor(unit: UnitRow): Promise<Sources> {
  const all = async <T>(m: { findMany: () => Promise<unknown> }) => (await m.findMany()) as T[];
  const [meetings, decisions, accounts, entries, budgetLines, counts, memberships, positions, plans, people, personRecords, programs] = await Promise.all([
    all<Sources['meetings'][number]>(prisma.meeting as never),
    all<Sources['decisions'][number]>(prisma.decision as never),
    all<Sources['accounts'][number]>(prisma.moneyAccount as never),
    all<Sources['entries'][number]>(prisma.moneyEntry as never),
    all<Sources['budgetLines'][number]>(prisma.moneyBudgetLine as never),
    all<Sources['counts'][number]>(prisma.offeringCount as never),
    all<Sources['memberships'][number]>(prisma.membership as never),
    all<Sources['positions'][number]>(prisma.position as never),
    all<Sources['plans'][number]>(prisma.workPlan as never),
    all<{ id: string; fullName: string; status?: string; archivedAt?: Date | null }>(prisma.person as never),
    all<Sources['personRecords'][number]>(prisma.personRecord as never),
    all<Sources['programs'][number]>(prisma.program as never),
  ]);
  return {
    unitId: unit.id, systemId: unit.systemId ?? '', names: new Map(people.map((p) => [p.id, p.fullName])),
    meetings, decisions, accounts, entries, budgetLines, counts, memberships, positions, plans, personRecords, programs,
    activePeople: new Set(people.filter((p) => !p.archivedAt && (!p.status || p.status === 'ACTIVE')).map((p) => p.id)),
  };
}

const titleOf = (kind: ReportKind, unit: string, period: string) => `${kind}|${unit}|${period}`;

function shape(r: ReportRow, c: Ctx, me: string, who: Map<string, string>) {
  const sys = r.systemId;
  return {
    id: r.id, systemId: sys, unitName: unitName(c, r.orgUnitId), kind: r.kind, periodKey: r.periodKey, title: r.title, status: r.status,
    composedByName: who.get(r.composedById) ?? '', composedAt: iso(r.composedAt), publishedByName: r.publishedById ? who.get(r.publishedById) ?? '' : null, publishedAt: iso(r.publishedAt),
    canPublish: r.status === 'DRAFT' && canPublish(me, sys, c.data),
    canEdit: r.status === 'DRAFT' && canCompose(me, sys, c.data) && canReadSource(me, sys, r.kind, c.data),
  };
}

reportsRouter.get('/options', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const c = await ctx(me);
  const units = c.units.filter((u) => u.systemId && canCompose(me, u.systemId, c.data));
  res.json({
    units: units.map((u) => ({ id: u.id, name: u.name, systemId: u.systemId!, kinds: KINDS.filter((k) => canReadSource(me, u.systemId!, k, c.data)) })),
    kinds: KINDS,
    schedulerUnits: c.units.filter((u) => u.systemId && canPublish(me, u.systemId, c.data)).map((u) => ({ id: u.id, name: u.name, systemId: u.systemId! })),
  });
});

reportsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const q = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : '');
  const systemId = q('systemId');
  const c = await ctx(me);
  if (!systemId || !canReadReports(me, systemId, c.data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const writer = canCompose(me, systemId, c.data);
  const rows = ((await prisma.report.findMany()) as ReportRow[])
    .filter((r) => r.systemId === systemId && !r.deletedAt && (r.status === 'PUBLISHED' || writer))
    .filter((r) => (!q('kind') || r.kind === q('kind')) && (!q('period') || r.periodKey === q('period')) && (!q('status') || r.status === q('status')))
    .sort((a, b) => b.periodKey.localeCompare(a.periodKey) || +new Date(b.composedAt) - +new Date(a.composedAt))
    .slice(0, 200);
  const who = await names(rows.flatMap((r) => [r.composedById, r.publishedById]));
  res.json({ reports: rows.map((r) => shape(r, c, me, who)), canCompose: writer });
});

async function load(req: AuthedRequest, res: Res) {
  const me = req.auth!.personId;
  const c = await ctx(me);
  const r = (await prisma.report.findUnique({ where: { id: String(req.params.id) } })) as ReportRow | null;
  if (!r || r.deletedAt || !canReadReports(me, r.systemId, c.data) || (r.status === 'DRAFT' && !canCompose(me, r.systemId, c.data))) {
    fail(res, 404, 'NOT_FOUND', 'Report not found');
    return null;
  }
  return { me, c, r };
}

reportsRouter.get('/schedules', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = typeof req.query.systemId === 'string' ? req.query.systemId : '';
  const c = await ctx(me);
  if (!systemId || !canReadReports(me, systemId, c.data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const items = await scheduleItems(c, (s) => s.systemId === systemId);
  await remindLate(items, c);
  res.json({ schedules: items.map(({ composers: _c, ...rest }) => rest), canSchedule: canPublish(me, systemId, c.data) });
});

reportsRouter.post('/schedules', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z.object({ unitId: z.string().min(1), kind: z.enum(KINDS), dueDay: z.number().int().min(1).max(28) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Choose a unit, a report and a day between 1 and 28');
  const c = await ctx(me);
  const unit = c.units.find((u) => u.id === parsed.data.unitId);
  if (!unit?.systemId) return fail(res, 404, 'NOT_FOUND', 'Unit not found');
  if (!canPublish(me, unit.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not set schedules here');
  if (CHURCH_WIDE.includes(parsed.data.kind) && unit.systemId !== 'sys-main') return fail(res, 400, 'BAD_INPUT', 'This report belongs to the main church');
  const dup = ((await prisma.reportSchedule.findMany()) as ScheduleRow[]).some((s) => s.active && s.orgUnitId === unit.id && s.kind === parsed.data.kind);
  if (dup) return fail(res, 409, 'ALREADY_EXISTS', 'This report is already scheduled for this unit');
  const row = (await prisma.reportSchedule.create({ data: { systemId: unit.systemId, orgUnitId: unit.id, kind: parsed.data.kind, dueDay: parsed.data.dueDay, active: true, createdById: me } })) as ScheduleRow;
  await audit(me, unit.systemId, 'REPORT_SCHEDULED', `${parsed.data.kind} monthly for ${unit.name}`, { scheduleId: row.id });
  res.status(201).json({ id: row.id });
});

reportsRouter.delete('/schedules/:id', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const c = await ctx(me);
  const s = (await prisma.reportSchedule.findUnique({ where: { id: String(req.params.id) } })) as ScheduleRow | null;
  if (!s || !s.active || !canReadReports(me, s.systemId, c.data)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!canPublish(me, s.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not change schedules here');
  await prisma.reportSchedule.update({ where: { id: s.id }, data: { active: false } });
  await audit(me, s.systemId, 'REPORT_UNSCHEDULED', `${s.kind} schedule stopped`, { scheduleId: s.id });
  res.json({ ok: true });
});

reportsRouter.get('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const who = await names([got.r.composedById, got.r.publishedById]);
  let snapshot: unknown = null;
  try {
    snapshot = JSON.parse(got.r.snapshotJson);
  } catch {
    snapshot = null;
  }
  res.json({ report: { ...shape(got.r, got.c, got.me, who), snapshot } });
});

reportsRouter.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z.object({ unitId: z.string().min(1), kind: z.enum(KINDS), periodKey: z.string() }).safeParse(req.body);
  if (!parsed.success || !periodOk(parsed.data.periodKey)) return fail(res, 400, 'BAD_INPUT', 'Choose a unit, a report and a month or year');
  const { unitId, kind, periodKey } = parsed.data;
  const c = await ctx(me);
  const unit = c.units.find((u) => u.id === unitId);
  if (!unit) return fail(res, 404, 'NOT_FOUND', 'Unit not found');
  if (!unit.systemId) return fail(res, 400, 'UNIT_HAS_NO_SYSTEM', 'This unit has no system yet');
  if (!canCompose(me, unit.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not compose reports here');
  if (!canReadSource(me, unit.systemId, kind, c.data)) return fail(res, 403, 'SOURCE_FORBIDDEN', 'You may not read the records this report is made from');
  const exists = ((await prisma.report.findMany()) as ReportRow[]).some((r) => !r.deletedAt && r.orgUnitId === unitId && r.kind === kind && r.periodKey === periodKey);
  if (exists) return fail(res, 409, 'ALREADY_EXISTS', 'This report already exists for that period');
  const snap = buildSnapshot(kind, periodKey, unit.name, await sourcesFor(unit));
  const row = (await prisma.report.create({
    data: { systemId: unit.systemId, orgUnitId: unitId, kind, periodKey, title: titleOf(kind, unit.name, periodKey), status: 'DRAFT', snapshotJson: JSON.stringify(snap), composedById: me },
  })) as ReportRow;
  await audit(me, unit.systemId, 'REPORT_COMPOSED', `${kind} ${periodKey} for ${unit.name}`, { reportId: row.id });
  res.status(201).json({ id: row.id });
});

reportsRouter.post('/:id/refresh', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, c, r } = got;
  if (r.status !== 'DRAFT') return fail(res, 409, 'WRONG_STATE', 'A published report is frozen');
  if (!canCompose(me, r.systemId, c.data) || !canReadSource(me, r.systemId, r.kind, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not change this report');
  const unit = c.units.find((u) => u.id === r.orgUnitId);
  if (!unit) return fail(res, 404, 'NOT_FOUND', 'Unit not found');
  await prisma.report.update({ where: { id: r.id }, data: { snapshotJson: JSON.stringify(buildSnapshot(r.kind, r.periodKey, unit.name, await sourcesFor(unit))), composedById: me, composedAt: new Date() } });
  res.json({ ok: true });
});

reportsRouter.post('/:id/publish', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, c, r } = got;
  if (r.status !== 'DRAFT') return fail(res, 409, 'WRONG_STATE', 'This report is already published');
  if (!canPublish(me, r.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not publish reports here');
  await prisma.report.update({ where: { id: r.id }, data: { status: 'PUBLISHED', publishedById: me, publishedAt: new Date() } });
  await audit(me, r.systemId, 'REPORT_PUBLISHED', `${r.kind} ${r.periodKey} for ${unitName(c, r.orgUnitId)}`, { reportId: r.id });
  if (r.composedById !== me) {
    await notifySafely(prisma as never, {
      kind: 'FOR_INFORMATION', toPersonId: r.composedById, systemId: r.systemId, title: `Report published: ${r.kind} ${r.periodKey}`, body: unitName(c, r.orgUnitId),
      href: `/s/${r.systemId}/reports/${r.id}`, sourceKey: `report-published:${r.id}`,
    });
  }
  res.json({ ok: true });
});

reportsRouter.delete('/:id', requireAuth, async (req: AuthedRequest, res) => {
  const got = await load(req, res);
  if (!got) return;
  const { me, c, r } = got;
  if (r.status !== 'DRAFT') return fail(res, 409, 'WRONG_STATE', 'A published report cannot be removed');
  if (!canCompose(me, r.systemId, c.data)) return fail(res, 403, 'FORBIDDEN', 'You may not change this report');
  await prisma.report.update({ where: { id: r.id }, data: { deletedAt: new Date(), deletedById: me } });
  await audit(me, r.systemId, 'REPORT_DISCARDED', `${r.kind} ${r.periodKey} draft discarded`, { reportId: r.id });
  res.json({ ok: true });
});

// ── Schedules ────────────────────────────────────────────────────────────────

async function scheduleItems(c: Ctx, keep: (s: ScheduleRow) => boolean, now = new Date()) {
  const schedules = ((await prisma.reportSchedule.findMany()) as ScheduleRow[]).filter((s) => s.active && keep(s));
  const reports = ((await prisma.report.findMany()) as ReportRow[]).filter((r) => !r.deletedAt && r.status === 'PUBLISHED');
  const people = (c.data.positions as Array<{ personId: string }>).map((p) => p.personId);
  return schedules.map((s) => {
    const st0 = scheduleStatus(s.dueDay, false, now);
    const got = reports.some((r) => r.orgUnitId === s.orgUnitId && r.kind === s.kind && r.periodKey === st0.periodKey);
    const st = scheduleStatus(s.dueDay, got, now);
    return {
      id: s.id, systemId: s.systemId, orgUnitId: s.orgUnitId, unitName: unitName(c, s.orgUnitId), kind: s.kind, dueDay: s.dueDay, ...st,
      composers: [...new Set(people)].filter((p) => canCompose(p, s.systemId, c.data) && canReadSource(p, s.systemId, s.kind, c.data)),
    };
  });
}

/** A late report reminds the people who may write it, once per schedule and month. */
async function remindLate(items: Awaited<ReturnType<typeof scheduleItems>>, _c: Ctx) {
  for (const s of items.filter((x) => x.state === 'LATE')) {
    for (const id of s.composers) {
      await notifySafely(prisma as never, {
        kind: 'WAITING_FOR_ME', toPersonId: id, systemId: s.systemId, title: `Report late: ${s.kind} ${s.periodKey}`, body: s.unitName,
        href: `/s/${s.systemId}/reports`, important: true, sourceKey: `report-late:${s.id}:${s.periodKey}`,
      });
    }
  }
}

export interface ReceivedReport { id: string; systemId: string; unitName: string; kind: ReportKind; periodKey: string; publishedAt: string | null }
export interface LateReport { scheduleId: string; systemId: string; unitName: string; kind: ReportKind; periodKey: string; dueOn: string }

/** For Central Administration: the latest published reports, and the schedules that are late, across the systems this person may read. */
export async function reportsReceived(me: string, data: AccessData, units: UnitRow[], now = new Date()): Promise<{ reports: ReceivedReport[]; late: LateReport[] }> {
  const c = { data, units } as Ctx;
  const rows = ((await prisma.report.findMany()) as ReportRow[])
    .filter((r) => !r.deletedAt && r.status === 'PUBLISHED' && canReadReports(me, r.systemId, data, now))
    .sort((a, b) => +new Date(b.publishedAt ?? 0) - +new Date(a.publishedAt ?? 0))
    .slice(0, 20);
  const items = await scheduleItems(c, (s) => canReadReports(me, s.systemId, data, now), now);
  return {
    reports: rows.map((r) => ({ id: r.id, systemId: r.systemId, unitName: unitName(c, r.orgUnitId), kind: r.kind, periodKey: r.periodKey, publishedAt: iso(r.publishedAt) })),
    late: items.filter((s) => s.state === 'LATE').map((s) => ({ scheduleId: s.id, systemId: s.systemId, unitName: s.unitName, kind: s.kind, periodKey: s.periodKey, dueOn: s.dueOn })),
  };
}
