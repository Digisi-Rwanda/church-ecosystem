/**
 * Music schedule (slice 3.16): the old engine's flow. Generate a draft for a month up to a year,
 * adjust it by hand (hard rules refuse, soft ones warn), confirm months (Protocol may plan against
 * them), publish them (the choirs see them), edit afterwards (version up, logged), and read the log.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { notifySafely } from '../lib/notify.js';
import { buildMusicCalendar, periodOptionsForHorizon } from '../music/engine.js';
import { generateConfiguredMusicSchedule, validateConfiguredMusicSchedule } from '../music/configuredEngine.js';
import { loadMusicConfig } from '../scheduling/configLoader.js';
import type { LoadedMusicConfig } from '../scheduling/configLoader.js';
import {
  diffLineup, fingerprint, monthsOf, parse, sliceMonth, summarise, unitsOn, withService, type DraftDoc, type LogAction, type LogChange, type MonthDoc,
} from '../music/schedule.js';
import { loadChoirs, loadMonthRows, loadMonths, toDoc } from '../music/store.js';
import { unitsFrom } from '../music/schedule.js';
import { MUSIC, canReadPlan, canWritePlan, isMonth } from '../music/rules.js';
import type { MusicAssignment, MusicHorizon, MusicScheduleUnit, MusicServiceSlot } from '../music/types.js';

export const musicScheduleRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const iso = (v: Date | string | null | undefined) => (v ? (v instanceof Date ? v : new Date(v)).toISOString() : null);
const HORIZONS = ['MONTH', 'QUARTER', 'HALF', 'YEAR'] as const;
const nowMonth = () => new Date().toISOString().slice(0, 7);

interface DraftRow { id: string; label: string; horizon: string; startMonth: string; servicesJson: string; assignmentsJson: string; warningsJson?: string | null; configVersionId?: string | null; createdAt?: Date | string | null }
const draftDoc = (r: DraftRow): DraftDoc => ({
  id: r.id, label: r.label, horizon: r.horizon as MusicHorizon, startMonth: r.startMonth,
  services: parse<MusicServiceSlot[]>(r.servicesJson, []), assignments: parse<MusicAssignment[]>(r.assignmentsJson, []), warnings: parse<string[]>(r.warningsJson, []),
  configVersionId: r.configVersionId ?? null,
});
const drafts = async (): Promise<DraftRow[]> => (await prisma.musicDraft.findMany()) as DraftRow[];
type HistoricalSchedule = { services: MusicServiceSlot[]; assignments: MusicAssignment[] };
const configuredRules = (config: LoadedMusicConfig) => ({
  services: config.services,
  categories: config.categories,
  policies: config.policies,
  links: config.links,
  fixedAssignments: config.fixedAssignments,
  unavailability: config.unavailability,
});
function historyOutside(services: MusicServiceSlot[], months: MonthDoc[]): HistoricalSchedule[] {
  const excluded = new Set(services.map((service) => service.periodKey));
  return months
    .filter((month) => !excluded.has(month.periodKey))
    .map(({ services: monthServices, assignments }) => ({ services: monthServices, assignments }));
}
/** Validate a schedule against the LIVE configuration (there is no pinned version any more). */
function validateLiveMusic(
  services: MusicServiceSlot[],
  assignments: MusicAssignment[],
  units: readonly MusicScheduleUnit[],
  config: LoadedMusicConfig,
  history: HistoricalSchedule[],
  allowManualIncomplete = false,
) {
  return validateConfiguredMusicSchedule({
    services, assignments, units, rules: configuredRules(config), history, allowManualIncomplete,
  });
}

async function audit(actorId: string, action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({ data: { at: new Date(), actorId, systemId: MUSIC, action, resource: 'SCHEDULING', detail, metaJson: JSON.stringify(meta) } });
}
async function writeLog(periodKey: string, stage: 'CONFIRMED' | 'PUBLISHED', action: LogAction, version: number, byId: string, changes: LogChange[], doc?: MonthDoc) {
  await prisma.musicLog.create({ data: {
    periodKey, stage, action, version, byId, summary: summarise(action, stage, changes), changesJson: JSON.stringify(changes),
    configVersionId: doc?.configVersionId ?? null,
    servicesSnapshotJson: doc ? JSON.stringify(doc.services) : null,
    assignmentsSnapshotJson: doc ? JSON.stringify(doc.assignments) : null,
  } });
}
async function saveMonth(doc: MonthDoc, extra: Record<string, unknown>) {
  const rows = await loadMonthRows();
  const data = { state: doc.state, version: doc.version, batchId: doc.batchId ?? null, batchHorizon: doc.batchHorizon ?? null, servicesJson: JSON.stringify(doc.services), assignmentsJson: JSON.stringify(doc.assignments), warningsJson: JSON.stringify(doc.warnings), configVersionId: doc.configVersionId ?? null, ...extra };
  const row = rows.find((r) => r.periodKey === doc.periodKey) as (typeof rows)[number] & { id?: string } | undefined;
  if (row?.id) await prisma.musicMonth.update({ where: { id: row.id }, data });
  else await prisma.musicMonth.create({ data: { periodKey: doc.periodKey, confirmedAt: new Date(), confirmedById: '', updatedAt: new Date(), ...data } as never });
}

/** The choirs hear about published schedules; Protocol's coordinators hear about every confirm and edit. */
async function tellChoirs(title: string, body: string, key: string) {
  const members = ((await prisma.musicChoirMember.findMany()) as Array<{ personId: string; status: string }>).filter((m) => m.status === 'ACTIVE');
  for (const id of new Set(members.map((m) => m.personId))) {
    await notifySafely(prisma as never, { kind: 'FOR_INFORMATION', toPersonId: id, systemId: MUSIC, title, body, href: null, sourceKey: `${key}:${id}` });
  }
}
async function tellProtocol(title: string, body: string, key: string) {
  await notifySafely(prisma as never, { kind: 'FOR_INFORMATION', toOffice: 'COORDINATOR', toSystemId: 'sys-protocol', systemId: 'sys-protocol', title, body, href: '/s/sys-protocol/teams', sourceKey: key });
}

async function gate(req: AuthedRequest, res: Res, write: boolean) {
  const me = req.auth!.personId;
  const { data } = await loadAccessData(me);
  if (!canReadPlan(me, data)) {
    fail(res, 404, 'NOT_FOUND', 'Not found');
    return null;
  }
  const canWrite = canWritePlan(me, data);
  if (write && !canWrite) {
    fail(res, 403, 'FORBIDDEN', 'You may not change the schedule');
    return null;
  }
  return { me, canWrite };
}

const nameFor = (units: readonly MusicScheduleUnit[]) => (id: string) => units.find((u) => u.id === id)?.name ?? id;
function serviceViews(services: MusicServiceSlot[], assignments: MusicAssignment[], units: readonly MusicScheduleUnit[]) {
  const by = new Map(units.map((u) => [u.id, u]));
  return [...services]
    .sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind))
    .map((s) => ({
      id: s.id, periodKey: s.periodKey, date: s.date, kind: s.kind, label: s.label, time: s.time ?? null,
      musicRequired: s.musicRequired ?? true, protocolRequired: s.protocolRequired ?? false,
      units: unitsOn(assignments, s.id).map((id) => ({ unitId: id, name: by.get(id)?.name ?? id, kind: by.get(id)?.kind ?? 'PRIMARY' })),
    }));
}

/** Presentation metadata from the live configuration, for planners. */
async function schedulePresentation(doc: Pick<MonthDoc, 'services' | 'assignments' | 'configVersionId'>, units: MusicScheduleUnit[], canWrite: boolean) {
  const config = canWrite ? await loadMusicConfig() : null;
  const categoryNames = new Map((config?.categories ?? []).map(row => [row.id, row.name]));
  const byChoir = new Map((config?.links ?? []).filter(row => row.active).map(row => [row.choirId, categoryNames.get(row.categoryId)]));
  return {
    rules: config?.policies.map(row => ({ ...row, categoryName: categoryNames.get(row.categoryId) ?? '', serviceCode: config.services.find(service => service.id === row.serviceId)?.code ?? '' })) ?? [],
    validation: config ? validateLiveMusic(doc.services, doc.assignments, units, config, historyOutside(doc.services, await loadMonths())) : null,
    services: serviceViews(doc.services, doc.assignments, units).map(service => ({
      ...service,
      requirements: config?.policies.filter(rule => rule.active && rule.eligible && config.services.find(row => row.id === rule.serviceId)?.code.toLowerCase() === service.kind.toLowerCase()).map(rule => ({
        categoryName: categoryNames.get(rule.categoryId) ?? '',
        assigned: service.units.filter(unit => config.links.some(link => link.active && link.choirId === unit.unitId && link.categoryId === rule.categoryId)).length,
        minimum: rule.minCount, maximum: rule.maxCount,
      })) ?? [],
      units: service.units.map(unit => ({ ...unit, category: byChoir.get(unit.unitId) ?? null })),
    })),
  };
}

/* ───────────── What is there ───────────── */

musicScheduleRouter.get('/state', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gate(req, res, false);
  if (!g) return;
  const rows = await loadMonthRows();
  const months = rows
    .filter((r) => g.canWrite || r.state === 'PUBLISHED')
    .map((r) => ({ periodKey: r.periodKey, state: r.state, version: r.version, confirmedAt: iso(r.confirmedAt), publishedAt: iso(r.publishedAt), updatedAt: iso(r.updatedAt) }))
    .sort((a, b) => b.periodKey.localeCompare(a.periodKey));
  const units = unitsFrom(await loadChoirs()).filter((u) => u.active !== false);
  res.json({
    canWrite: g.canWrite, months,
    drafts: g.canWrite
      ? (await drafts()).map(draftDoc).map((d) => ({ id: d.id, label: d.label, horizon: d.horizon, startMonth: d.startMonth, months: monthsOf(d.services), warnings: d.warnings.length })).sort((a, b) => b.startMonth.localeCompare(a.startMonth))
      : [],
    options: g.canWrite ? Object.fromEntries(HORIZONS.map((h) => [h, periodOptionsForHorizon(h, nowMonth(), 24).slice(0, 8)])) : {},
    units: g.canWrite ? units.map((u) => ({ id: u.id, name: u.name, kind: u.kind })) : [],
  });
});

musicScheduleRouter.get('/months/:month', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gate(req, res, false);
  if (!g) return;
  const month = String(req.params.month);
  const row = (await loadMonthRows()).find((r) => r.periodKey === month);
  if (!row || (!g.canWrite && row.state !== 'PUBLISHED')) return fail(res, 404, 'NOT_FOUND', 'No schedule for this month');
  const doc = toDoc(row);
  const units = unitsFrom(await loadChoirs());
  res.json({ canWrite: g.canWrite, periodKey: month, state: doc.state, version: doc.version, warnings: doc.warnings, ...await schedulePresentation(doc, units, g.canWrite) });
});

musicScheduleRouter.get('/drafts/:id', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gate(req, res, true);
  if (!g) return;
  const row = (await drafts()).find((d) => d.id === String(req.params.id));
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Draft not found');
  const d = draftDoc(row);
  const units = unitsFrom(await loadChoirs());
  const decided = new Map((await loadMonthRows()).map((m) => [m.periodKey, m.state]));
  res.json({
    id: d.id, label: d.label, horizon: d.horizon, warnings: d.warnings,
    months: monthsOf(d.services).map((m) => ({ periodKey: m, decided: decided.get(m) ?? null })),
    ...await schedulePresentation(d, units, true),
  });
});

musicScheduleRouter.get('/log', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gate(req, res, true);
  if (!g) return;
  const month = typeof req.query.month === 'string' ? req.query.month : '';
  const rows = ((await prisma.musicLog.findMany()) as Array<{ id: string; at: Date | string; periodKey: string; stage: string; action: string; version: number; byId: string; summary: string; changesJson: string }>)
    .filter((r) => !month || r.periodKey === month)
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, 100);
  const who = new Map<string, string>();
  for (const p of (await prisma.person.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.byId))] } } })) as Array<{ id: string; fullName: string }>) who.set(p.id, p.fullName);
  res.json({ entries: rows.map((r) => ({ id: r.id, at: iso(r.at), periodKey: r.periodKey, stage: r.stage, action: r.action, version: r.version, by: who.get(r.byId) ?? '', summary: r.summary, changes: parse<LogChange[]>(r.changesJson, []).map((c) => c.text) })) });
});

/* ───────────── Drafts ───────────── */

musicScheduleRouter.post('/drafts/generate', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gate(req, res, true);
  if (!g) return;
  const parsed = z.object({
    horizon: z.enum(HORIZONS),
    start: z.string(),
    seed: z.number().int().safe().optional(),
  }).safeParse(req.body);
  if (!parsed.success || !isMonth(parsed.data.start)) return fail(res, 400, 'BAD_INPUT', 'Choose the period');
  const { horizon, start } = parsed.data;
  if (start < nowMonth()) return fail(res, 400, 'PAST', 'Choose a period from this month on');
  const units = unitsFrom(await loadChoirs());
  // Configuration is live: whatever is saved now is what this draft is built from.
  const cfg = await loadMusicConfig();
  if (!cfg.services.some((service) => service.active && service.musicRequired)) {
    return fail(res, 409, 'NO_CONFIG', 'Set up at least one Music service before generating a schedule.');
  }
  let services: MusicServiceSlot[];
  try {
    services = buildMusicCalendar(start, horizon, cfg.services);
  } catch (error) {
    if (error instanceof Error) return fail(res, 422, 'CONFIG', error.message);
    throw error;
  }
  // Frozen schedules: a month that is already confirmed or published is immutable, and config edits never
  // rebuild it. Only months with no schedule yet (or drafts, which live in MusicDraft) can be generated.
  const frozen = new Set((await loadMonths()).filter((m) => m.state === 'CONFIRMED' || m.state === 'PUBLISHED').map((m) => m.periodKey));
  const touched = [...new Set(services.map((service) => service.periodKey))].filter((month) => frozen.has(month));
  if (touched.length) {
    return res.status(409).json({
      error: 'SCHEDULE_FROZEN',
      message: 'This schedule is already confirmed. Edits to configuration do not rebuild confirmed or published schedules.',
      months: touched, // extra detail for the UI; the two fields above are the contract
    });
  }
  const history = historyOutside(services, await loadMonths());
  const result = generateConfiguredMusicSchedule({
    services, units, rules: configuredRules(cfg), history, seed: parsed.data.seed,
  });
  if (!result.ok) return fail(res, 422, 'ENGINE', result.reason ?? 'Could not build a valid schedule');
  const validation = validateLiveMusic(services, result.assignments, units, cfg, history, true);
  if (!validation.ok) return fail(res, 422, 'CONFIG', validation.reason ?? 'Configuration policy violation');
  const fp = fingerprint(start, horizon, services, result.assignments);
  const dup = (await drafts()).map(draftDoc).find((d) => fingerprint(d.startMonth, d.horizon, d.services, d.assignments) === fp);
  if (dup) return fail(res, 409, 'DUPLICATE', 'This is the same schedule as an existing draft');
  const row = (await prisma.musicDraft.create({
    data: {
      label: `${start} · ${horizon.toLowerCase()}`, horizon, startMonth: start, servicesJson: JSON.stringify(services), assignmentsJson: JSON.stringify(result.assignments),
      warningsJson: JSON.stringify([...result.warnings, ...validation.warnings]), createdById: g.me,
      configVersionId: null, // no longer pinned; the column stays only for rows written before live configuration
    },
  })) as { id: string };
  await audit(g.me, 'DRAFT_GENERATED', `Generated a ${horizon.toLowerCase()} choir schedule from ${start}`, { draftId: row.id });
  res.status(201).json({ id: row.id, warnings: [...result.warnings, ...validation.warnings] });
});

const editBody = z.object({ serviceId: z.string().min(1), action: z.enum(['add', 'remove', 'replace']), unitId: z.string().min(1), toUnitId: z.string().min(1).nullish() });
type Edit = z.infer<typeof editBody>;

/** Apply one hand edit to a lineup; hard rules refuse, soft ones come back as warnings. */
function applyEdit(
  services: MusicServiceSlot[],
  assignments: MusicAssignment[],
  e: Edit,
  units: readonly MusicScheduleUnit[],
  cfg: LoadedMusicConfig,
  history: HistoricalSchedule[],
  allowManualIncomplete = true,
) {
  if (!services.some((s) => s.id === e.serviceId)) return { ok: false as const, status: 404, code: 'NOT_FOUND', error: 'Service not found' };
  if (services.find((s) => s.id === e.serviceId)?.musicRequired === false) {
    return { ok: false as const, status: 409, code: 'NOT_MUSIC_SERVICE', error: 'This service does not use choir assignments' };
  }
  const now = unitsOn(assignments, e.serviceId);
  let next: string[];
  if (e.action === 'add') {
    if (now.includes(e.unitId)) return { ok: false as const, status: 409, code: 'ALREADY_EXISTS', error: 'Choir already scheduled' };
    next = [...now, e.unitId];
  } else if (e.action === 'remove') {
    if (!now.includes(e.unitId)) return { ok: false as const, status: 404, code: 'NOT_FOUND', error: 'Choir is not on this service' };
    next = now.filter((x) => x !== e.unitId);
  } else {
    if (!now.includes(e.unitId)) return { ok: false as const, status: 404, code: 'NOT_FOUND', error: 'Choir is not on this service' };
    if (!e.toUnitId) return { ok: false as const, status: 400, code: 'BAD_INPUT', error: 'Choose the replacement' };
    if (now.includes(e.toUnitId) && e.toUnitId !== e.unitId) return { ok: false as const, status: 409, code: 'ALREADY_EXISTS', error: 'Replacement choir already scheduled' };
    next = now.map((x) => (x === e.unitId ? e.toUnitId! : x));
  }
  const after = withService(assignments, e.serviceId, next);
  const validation = validateLiveMusic(services, after, units, cfg, history, allowManualIncomplete);
  if (!validation.ok) return { ok: false as const, status: 409, code: 'CONFIG', error: validation.reason ?? 'This breaks a configuration policy', warnings: validation.warnings };
  return { ok: true as const, assignments: after, warnings: validation.warnings };
}

musicScheduleRouter.post('/drafts/:id/edit', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gate(req, res, true);
  if (!g) return;
  const parsed = editBody.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the change');
  const row = (await drafts()).find((d) => d.id === String(req.params.id));
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Draft not found');
  const d = draftDoc(row);
  const cfg = await loadMusicConfig();
  const history = historyOutside(d.services, await loadMonths());
  const r = applyEdit(d.services, d.assignments, parsed.data, unitsFrom(await loadChoirs()), cfg, history);
  if (!r.ok) return res.status(r.status).json({ error: r.error, code: r.code, warnings: 'warnings' in r ? r.warnings : [] });
  await prisma.musicDraft.update({ where: { id: d.id }, data: { assignmentsJson: JSON.stringify(r.assignments), warningsJson: JSON.stringify(r.warnings) } });
  res.json({ ok: true, warnings: r.warnings });
});

musicScheduleRouter.delete('/drafts/:id', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gate(req, res, true);
  if (!g) return;
  const row = (await drafts()).find((d) => d.id === String(req.params.id));
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Draft not found');
  await prisma.musicDraft.delete({ where: { id: row.id } });
  await audit(g.me, 'DRAFT_DISCARDED', `Discarded draft ${row.label}`, { draftId: row.id });
  res.json({ ok: true });
});

/** Take decided months out of the draft; the draft keeps only what is undecided. */
async function takeMonthsOut(row: DraftRow, months: string[]) {
  const d = draftDoc(row);
  const gone = new Set(months);
  const services = d.services.filter((s) => !gone.has(s.periodKey));
  if (services.length === 0) return prisma.musicDraft.delete({ where: { id: d.id } });
  const ids = new Set(services.map((s) => s.id));
  return prisma.musicDraft.update({ where: { id: d.id }, data: { servicesJson: JSON.stringify(services), assignmentsJson: JSON.stringify(d.assignments.filter((a) => ids.has(a.serviceId))) } });
}

async function confirmMonths(me: string, row: DraftRow, chosen: string[]): Promise<{ ok: true } | { ok: false; status: number; code: string; error: string }> {
  const d = draftDoc(row);
  const config = await loadMusicConfig();
  const units = unitsFrom(await loadChoirs());
  const validation = validateLiveMusic(d.services, d.assignments, units, config, historyOutside(d.services, await loadMonths()));
  if (!validation.ok) {
    return { ok: false, status: 409, code: 'CONFIG', error: validation.reason ?? 'The draft does not satisfy the current Music configuration.' };
  }
  const have = monthsOf(d.services);
  if (chosen.length === 0) return { ok: false, status: 400, code: 'BAD_INPUT', error: 'Pick at least one month' };
  const unknown = chosen.filter((m) => !have.includes(m));
  if (unknown.length) return { ok: false, status: 400, code: 'BAD_INPUT', error: `Not in this draft: ${unknown.join(', ')}` };
  const existing = new Map((await loadMonths()).map((m) => [m.periodKey, m]));
  const published = chosen.filter((m) => existing.get(m)?.state === 'PUBLISHED');
  if (published.length) return { ok: false, status: 409, code: 'PUBLISHED', error: `Already published: ${published.join(', ')}. Edit the published month instead.` };
  const batchId = `mbatch-${Date.now().toString(36)}`;
  const at = new Date();
  for (const month of chosen) {
    const slice = sliceMonth(d, month);
    if (slice.services.some((service) => service.musicRequired !== false) && slice.assignments.length === 0) {
      const vacancies = new Set('vacantFixedServiceIds' in validation ? validation.vacantFixedServiceIds ?? [] : []);
      if (slice.services.some(service => service.musicRequired !== false && !vacancies.has(service.id))) {
        return { ok: false, status: 409, code: 'EMPTY', error: `${month} has no choirs assigned yet` };
      }
    }
  }
  for (const month of chosen) {
    const slice = sliceMonth(d, month);
    const before = existing.get(month) ?? null;
    const doc: MonthDoc = { periodKey: month, state: 'CONFIRMED', version: (before?.version ?? 0) + 1, batchId, batchHorizon: d.horizon, services: slice.services, assignments: slice.assignments, warnings: d.warnings, configVersionId: d.configVersionId ?? null };
    await saveMonth(doc, { confirmedAt: before ? undefined : at, confirmedById: me, updatedAt: at, updatedById: me, ...(before ? {} : {}) });
    await writeLog(month, 'CONFIRMED', before ? 'RECONFIRMED' : 'CONFIRMED', doc.version, me, before ? diffLineup(before, doc, nameFor(units)) : [], doc);
  }
  await takeMonthsOut(row, chosen);
  await tellProtocol('Music confirmed a choir schedule', `Months: ${chosen.join(', ')}. You can build Protocol teams against them.`, `music-confirm:${chosen.join(',')}:${Date.now()}`);
  return { ok: true };
}

musicScheduleRouter.post('/drafts/:id/confirm', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gate(req, res, true);
  if (!g) return;
  const parsed = z.object({ months: z.array(z.string()).optional() }).safeParse(req.body ?? {});
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the months');
  const row = (await drafts()).find((d) => d.id === String(req.params.id));
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Draft not found');
  const chosen = [...new Set(parsed.data.months ?? monthsOf(draftDoc(row).services))].sort();
  const r = await confirmMonths(g.me, row, chosen);
  if (!r.ok) return fail(res, r.status, r.code, r.error);
  await audit(g.me, 'MONTHS_CONFIRMED', `Confirmed ${chosen.join(', ')}`, { months: chosen });
  res.json({ ok: true, months: chosen });
});

async function publishMonths(me: string, months: string[]): Promise<{ ok: true } | { ok: false; status: number; code: string; error: string }> {
  const chosen = [...new Set(months)].sort();
  if (chosen.length === 0) return { ok: false, status: 400, code: 'BAD_INPUT', error: 'Pick at least one month' };
  const have = new Map((await loadMonths()).map((m) => [m.periodKey, m]));
  const missing = chosen.filter((m) => have.get(m)?.state !== 'CONFIRMED');
  if (missing.length) return { ok: false, status: 409, code: 'NOT_CONFIRMED', error: `Confirm first: ${missing.join(', ')} (only confirmed months can be published)` };
  const allMonths = await loadMonths();
  const units = unitsFrom(await loadChoirs());
  for (const month of chosen) {
    const doc = have.get(month)!;
    const config = await loadMusicConfig();
    const validation = validateLiveMusic(
      doc.services, doc.assignments, units, config, historyOutside(doc.services, allMonths),
    );
    if (!validation.ok) {
      return { ok: false, status: 409, code: 'CONFIG', error: `${month}: ${validation.reason ?? 'The schedule does not satisfy the current Music configuration.'}` };
    }
  }
  const at = new Date();
  for (const month of chosen) {
    const doc = have.get(month)!;
    await saveMonth({ ...doc, state: 'PUBLISHED' }, { publishedAt: at, publishedById: me, updatedAt: at, updatedById: me });
    await writeLog(month, 'PUBLISHED', 'PUBLISHED', doc.version, me, [], doc);
    await tellChoirs('Choir schedule published', `The choir schedule for ${month} is published.`, `music-pub:${month}:v${doc.version}`);
  }
  return { ok: true };
}

musicScheduleRouter.post('/months/publish', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gate(req, res, true);
  if (!g) return;
  const parsed = z.object({ months: z.array(z.string()).min(1) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Pick at least one month');
  const r = await publishMonths(g.me, parsed.data.months);
  if (!r.ok) return fail(res, r.status, r.code, r.error);
  await audit(g.me, 'MONTHS_PUBLISHED', `Published ${parsed.data.months.join(', ')}`, { months: parsed.data.months });
  res.json({ ok: true });
});

/** Publish a whole draft: fresh months are confirmed then released; months already published are replaced (version up). */
musicScheduleRouter.post('/drafts/:id/publish', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gate(req, res, true);
  if (!g) return;
  const row = (await drafts()).find((d) => d.id === String(req.params.id));
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Draft not found');
  const d = draftDoc(row);
  const months = monthsOf(d.services);
  if (months.length === 0) return fail(res, 409, 'EMPTY', 'This draft has no services to publish.');
  const existing = new Map((await loadMonths()).map((m) => [m.periodKey, m]));
  const already = months.filter((m) => existing.get(m)?.state === 'PUBLISHED');
  const fresh = months.filter((m) => !already.includes(m));
  const units = unitsFrom(await loadChoirs());
  const config = await loadMusicConfig();
  const validation = validateLiveMusic(d.services, d.assignments, units, config, historyOutside(d.services, await loadMonths()));
  if (!validation.ok) return fail(res, 409, 'CONFIG', validation.reason ?? 'The draft does not satisfy the current Music configuration.');
  for (const m of months) {
    const slice = sliceMonth(d, m);
    if (slice.services.some((service) => service.musicRequired !== false) && slice.assignments.length === 0) {
      return fail(res, 409, 'EMPTY', `${m} has no choirs assigned yet`);
    }
  }
  const at = new Date();
  for (const month of already) {
    const before = existing.get(month)!;
    const slice = sliceMonth(d, month);
    const doc: MonthDoc = {
      ...before, services: slice.services, assignments: slice.assignments, warnings: d.warnings,
      configVersionId: d.configVersionId ?? null, version: before.version + 1,
    };
    await saveMonth(doc, { updatedAt: at, updatedById: g.me });
    await writeLog(month, 'PUBLISHED', 'EDITED', doc.version, g.me, diffLineup(before, doc, nameFor(units)), doc);
    await tellChoirs('Choir schedule published', `The choir schedule for ${month} is published (v${doc.version}).`, `music-pub:${month}:v${doc.version}`);
  }
  if (fresh.length) {
    const c = await confirmMonths(g.me, row, fresh);
    if (!c.ok) return fail(res, c.status, c.code, c.error);
    const p = await publishMonths(g.me, fresh);
    if (!p.ok) return fail(res, p.status, p.code, p.error);
  }
  const left = (await drafts()).find((x) => x.id === row.id);
  if (left) await prisma.musicDraft.delete({ where: { id: row.id } });
  await tellProtocol('Music published a choir schedule', `Months: ${months.join(', ')}.`, `music-draftpub:${row.id}:${Date.now()}`);
  await audit(g.me, 'DRAFT_PUBLISHED', `Published ${months.join(', ')}`, { months });
  res.json({ ok: true, months });
});

/* ───────────── Editing a decided month ───────────── */

musicScheduleRouter.post('/months/:month/edit', requireAuth, async (req: AuthedRequest, res) => {
  const g = await gate(req, res, true);
  if (!g) return;
  const parsed = editBody.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the change');
  const month = String(req.params.month);
  const before = (await loadMonths()).find((m) => m.periodKey === month);
  if (!before) return fail(res, 404, 'NOT_FOUND', 'No choir schedule for this month');
  const units = unitsFrom(await loadChoirs());
  const cfg = await loadMusicConfig();
  const history = historyOutside(before.services, await loadMonths());
  const r = applyEdit(before.services, before.assignments, parsed.data, units, cfg, history, false);
  if (!r.ok) return res.status(r.status).json({ error: r.error, code: r.code, warnings: 'warnings' in r ? r.warnings : [] });
  const doc: MonthDoc = { ...before, assignments: r.assignments, warnings: r.warnings, version: before.version + 1 };
  const changes = diffLineup(before, doc, nameFor(units));
  await saveMonth(doc, { updatedAt: new Date(), updatedById: g.me });
  await writeLog(month, doc.state, 'EDITED', doc.version, g.me, changes, doc);
  if (doc.state === 'PUBLISHED') await tellChoirs('Choir schedule updated', `The choir schedule for ${month} was updated (v${doc.version}). The previous version is replaced.`, `music-edit:${month}:v${doc.version}`);
  await tellProtocol('Music changed a choir schedule', `${month}: ${summarise('EDITED', doc.state, changes)}`, `music-edit-prot:${month}:v${doc.version}`);
  await audit(g.me, 'MONTH_EDITED', `Edited ${month} (v${doc.version})`, { month, version: doc.version });
  res.json({ ok: true, warnings: r.warnings, version: doc.version });
});
