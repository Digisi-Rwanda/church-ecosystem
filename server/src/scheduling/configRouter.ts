/**
 * Scheduling configuration HTTP API: LIVE settings (no versions, no drafts, no activation).
 *
 *   GET    /api/scheduling/config/services|categories|policies|links       read live rows
 *   GET    /api/scheduling/config/fixed-assignments|availability           read live rows
 *   GET    /api/scheduling/config/protocol/rules|policy                    read live rows
 *   GET    /api/scheduling/config/validation                               can the live config generate?
 *   POST   /api/scheduling/config/services|categories|policies|links       create
 *   PATCH  /api/scheduling/config/services|categories|policies|links/:id   edit
 *   POST   /api/scheduling/config/services/:id/retire                      retire a service
 *   POST   /api/scheduling/config/fixed-assignments  DELETE .../:id        designate / remove a choir
 *   POST   /api/scheduling/config/availability       DELETE .../:id        record / clear unavailability
 *   POST   /api/scheduling/config/protocol/rules     PATCH .../:id         Protocol team rules
 *   POST   /api/scheduling/config/protocol/policy    PATCH .../:id         Protocol duty policy
 *   GET|POST|PATCH|DELETE /api/scheduling/config/rules                Rules (see routes/configRules.ts)
 *   GET /config/choirs, PUT /config/choirs/:id/category               Choirs tab (same file)
 *   POST   /api/scheduling/config/lock               take the edit lock
 *   POST   /api/scheduling/config/lock/refresh       keep it alive
 *   DELETE /api/scheduling/config/lock               give it up
 *
 * Query `systemId` selects the tenant. Authorization is by SCHEDULING letters held in that system, never by
 * a client-supplied systemId alone.
 *
 * EVERY mutating route below does one thing: build a change and hand it to `saveConfigChange`, which owns the
 * permission check, the edit lock, validation and the audit entry. A route that writes a row itself is a bug.
 *
 * Compatibility: old clients still send `configVersionId` in bodies and queries. It is ignored (zod strips
 * unknown keys; query params are never read). The /versions routes are gone and now answer 404.
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest, pathParam } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { canReadConfig, canWriteConfig } from './rules.js';
import {
  EligibleOverrideSchema, FrequencyOverrideSchema, FrequencyPeriodSchema,
} from './musicConfigRules.js';
import { toCategoryView, toDutyPolicyView, toLinkView, toPolicyView, toRuleView, toServiceView } from './store.js';
import { configRulesRouter } from '../routes/configRules.js';
import { acquireEditLock, refreshEditLock, releaseEditLock } from './editLock.js';
import {
  ConfigError, MUSIC_SYSTEM, PROTOCOL_SYSTEM, saveConfigChange, validateLiveConfig,
  type ConfigOp,
} from './saveConfigChange.js';

export const configRouter = Router();
configRouter.use(configRulesRouter); // Rules + Choirs tab endpoints (routes/configRules.ts)

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
const accessOf = async (me: string) => (await loadAccessData(me)).data;

const IdSchema = z.string().min(1);
const NonEmptyName = z.string().trim().min(1).max(120);
const CodeSchema = z.string().trim().min(1).max(40).regex(/^[a-zA-Z0-9_-]+$/);
const PositiveInt = z.number().int().positive();
const NonNegativeInt = z.number().int().nonnegative();
const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, 'Use a valid calendar date.');

const ServiceSchema = z.object({
  systemId: z.literal(MUSIC_SYSTEM),
  code: CodeSchema,
  name: NonEmptyName,
  kind: z.enum(['SERVICE', 'REHEARSAL', 'MEETING', 'OTHER']).default('SERVICE'),
  weekday: z.number().int().min(0).max(6).optional().nullable(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  recurrence: z.enum(['WEEKLY', 'MONTHLY', 'SELECTED_DATES', 'CUSTOM']).default('WEEKLY'),
  selectedDates: z.array(z.string()).default([]),
  active: z.boolean().default(true),
  musicRequired: z.boolean().default(false),
  protocolRequired: z.boolean().default(false),
  maxChoirs: NonNegativeInt.default(3),
  displayOrder: NonNegativeInt.default(0),
});
const CategorySchema = z.object({
  systemId: z.literal(MUSIC_SYSTEM),
  code: CodeSchema,
  name: NonEmptyName,
  description: z.string().max(500).default(''),
  active: z.boolean().default(true),
});
const PolicySchema = z.object({
  systemId: z.literal(MUSIC_SYSTEM),
  categoryId: IdSchema,
  serviceId: IdSchema,
  eligible: z.boolean().default(true),
  active: z.boolean().default(true),
  frequencyTarget: PositiveInt.optional().nullable(),
  frequencyCounting: z.enum(['ASSIGNMENTS', 'DISTINCT_DATES']).default('ASSIGNMENTS'),
  frequencyKind: z.enum(['MINIMUM', 'TARGET', 'MAXIMUM']).default('TARGET'),
  planningMode: z.enum(['ROTATION', 'FIXED', 'MANUAL']).default('ROTATION'),
  minCount: NonNegativeInt.optional().nullable(),
  maxCount: NonNegativeInt.optional().nullable(),
  frequencyPeriod: FrequencyPeriodSchema.optional().nullable(),
  requireAll: z.boolean().default(false),
});
const LinkSchema = z.object({
  systemId: z.literal(MUSIC_SYSTEM),
  choirId: IdSchema,
  categoryId: IdSchema,
  eligibleOverride: EligibleOverrideSchema,
  frequencyOverride: FrequencyOverrideSchema,
  active: z.boolean().default(true),
});
const ProtocolRuleSchema = z.object({
  systemId: z.literal(PROTOCOL_SYSTEM),
  serviceId: IdSchema,
  active: z.boolean().default(true),
  required: z.boolean().default(false),
  defaultTeamSize: PositiveInt.default(10),
  teamSizeOverrides: z.record(z.string(), PositiveInt).default({}),
  requireChoir: z.boolean().default(true),
  requireWorship: z.boolean().default(true),
  relaxableKinds: z.array(z.string()).default([]),
});
const DutyPolicySchema = z.object({
  systemId: z.literal(PROTOCOL_SYSTEM),
  preferTarget: PositiveInt.default(3),
  softMax: PositiveInt.default(3),
  hardMax: PositiveInt.default(4),
  extraDutyPolicy: z.enum(['ALLOW_WHEN_SHORT', 'NEVER', 'ALWAYS']).default('ALLOW_WHEN_SHORT'),
  duplicateSameDayAllowed: z.boolean().default(false),
  musicCompatibilityRequired: z.boolean().default(true),
  leadershipPriorities: z.array(z.string()).default([]),
  exceptionsAllowed: z.boolean().default(true),
});

/* ─── Helpers ─── */

function systemIdOf(req: AuthedRequest): string | undefined {
  const raw = req.query.systemId;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
  return undefined;
}
const isConfigSystem = (systemId: string) => systemId === MUSIC_SYSTEM || systemId === PROTOCOL_SYSTEM;

/** Read gate: SCHEDULING R in the tenant, else 404 (never reveal the system exists). */
async function readGate(req: AuthedRequest, res: Res, only?: string): Promise<string | null> {
  const systemId = systemIdOf(req);
  if (!systemId || !isConfigSystem(systemId) || (only && systemId !== only)) { fail(res, 400, 'BAD_INPUT', 'A supported systemId is required'); return null; }
  if (!canReadConfig(req.auth!.personId, systemId, await accessOf(req.auth!.personId))) { fail(res, 404, 'NOT_FOUND', 'Not found'); return null; }
  return systemId;
}

/** Run one change through the single write path and translate its refusals. */
async function save(req: AuthedRequest, res: Res, systemId: string, op: ConfigOp, reply: (row: unknown, status: string) => object, createdStatus = 201) {
  try {
    const { results } = await saveConfigChange(systemId, req.auth!.personId, { ops: [op] });
    const main = results.find((r) => r.op === op.op)!;
    const code = main.status === 'CREATED' ? createdStatus : 200;
    return res.status(code).json({ ...reply(main.row, main.status), status: main.status, implied: results.filter((r) => r.op === 'policy.implied').length });
  } catch (error) {
    if (error instanceof ConfigError) return res.status(error.status).json(error.body);
    throw error;
  }
}
const badInput = (res: Res, what: string) => fail(res, 400, 'BAD_INPUT', what);
const idOf = (req: AuthedRequest) => { const id = pathParam(req, 'id'); return id && IdSchema.safeParse(id).success ? id : null; };

/* ─── Edit lock ─── */

async function lockGate(req: AuthedRequest, res: Res): Promise<string | null> {
  const raw = systemIdOf(req) ?? (typeof (req.body as { systemId?: unknown } | undefined)?.systemId === 'string' ? (req.body as { systemId: string }).systemId : undefined);
  if (!raw || !isConfigSystem(raw)) { fail(res, 400, 'BAD_INPUT', 'A supported systemId is required'); return null; }
  const me = req.auth!.personId;
  const data = await accessOf(me);
  if (!canReadConfig(me, raw, data)) { fail(res, 404, 'NOT_FOUND', 'Not found'); return null; }
  if (!canWriteConfig(me, raw, data)) { fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration'); return null; }
  return raw;
}

configRouter.post('/config/lock', requireAuth, async (req: AuthedRequest, res) => {
  const systemId = await lockGate(req, res);
  if (!systemId) return;
  const result = await acquireEditLock(systemId, req.auth!.personId);
  if (!result.ok) {
    return res.status(409).json({
      error: 'LOCKED', code: 'LOCKED', holder: result.holder,
      message: `${result.holder.name ?? 'Another person'} is currently editing configuration.`,
    });
  }
  res.json({ ok: true, lock: result.lock });
});

configRouter.post('/config/lock/refresh', requireAuth, async (req: AuthedRequest, res) => {
  const systemId = await lockGate(req, res);
  if (!systemId) return;
  if (!(await refreshEditLock(systemId, req.auth!.personId))) {
    return res.status(409).json({ error: 'LOCKED', code: 'LOCKED', holder: null, message: 'Your edit lock expired. Reopen the configuration to take it again.' });
  }
  res.json({ ok: true });
});

configRouter.delete('/config/lock', requireAuth, async (req: AuthedRequest, res) => {
  const systemId = await lockGate(req, res);
  if (!systemId) return;
  res.json({ ok: true, released: await releaseEditLock(systemId, req.auth!.personId) });
});

/* ─── Validation status ─── */

configRouter.get('/config/validation', requireAuth, async (req: AuthedRequest, res) => {
  const systemId = await readGate(req, res);
  if (!systemId) return;
  res.json(await validateLiveConfig(systemId));
});

/* ─── Services ─── */

configRouter.get('/config/services', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await readGate(req, res))) return;
  const rows = await prisma.schedulingService.findMany({
    where: { systemId: MUSIC_SYSTEM, ...(req.query.active === 'true' ? { active: true } : {}) },
    orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
  });
  res.json({ services: rows.map(toServiceView) });
});

configRouter.post('/config/services', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = ServiceSchema.safeParse(req.body);
  if (!parsed.success) return badInput(res, 'Invalid service');
  const { systemId, ...data } = parsed.data;
  return save(req, res, systemId, { op: 'service.create', data }, (service) => ({ service }));
});

configRouter.patch('/config/services/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = idOf(req);
  const parsed = z.object({
    patch: ServiceSchema.omit({ systemId: true }).partial(),
  }).safeParse(req.body);
  if (!id || !parsed.success) return badInput(res, 'Check the service fields');
  return save(req, res, MUSIC_SYSTEM, { op: 'service.update', id, patch: parsed.data.patch }, (service) => ({ service }));
});

configRouter.post('/config/services/:id/retire', requireAuth, async (req: AuthedRequest, res) => {
  const id = idOf(req);
  if (!id) return badInput(res, 'Invalid service id');
  return save(req, res, MUSIC_SYSTEM, { op: 'service.retire', id }, () => ({ ok: true }));
});

/* ─── Categories ─── */

configRouter.get('/config/categories', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await readGate(req, res, MUSIC_SYSTEM))) return;
  const rows = await prisma.choirCategory.findMany({
    where: { systemId: MUSIC_SYSTEM, ...(req.query.active === 'true' ? { active: true } : {}) },
    orderBy: [{ code: 'asc' }],
  });
  res.json({ categories: rows.map(toCategoryView) });
});

configRouter.post('/config/categories', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = CategorySchema.safeParse(req.body);
  if (!parsed.success) return badInput(res, 'Invalid category');
  const { systemId, ...data } = parsed.data;
  return save(req, res, systemId, { op: 'category.create', data }, (category) => ({ category }));
});

configRouter.patch('/config/categories/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = idOf(req);
  const parsed = z.object({ patch: CategorySchema.pick({ code: true, name: true, description: true, active: true }).partial() }).safeParse(req.body);
  if (!id || !parsed.success) return badInput(res, 'Check the category fields');
  return save(req, res, MUSIC_SYSTEM, { op: 'category.update', id, patch: parsed.data.patch }, (category) => ({ category }));
});

/* ─── Category x service policies ─── */

configRouter.get('/config/policies', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await readGate(req, res, MUSIC_SYSTEM))) return;
  const rows = await prisma.categoryServicePolicy.findMany({ where: { systemId: MUSIC_SYSTEM } });
  res.json({ policies: rows.map(toPolicyView) });
});

configRouter.post('/config/policies', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = PolicySchema.safeParse(req.body);
  if (!parsed.success) return badInput(res, 'Invalid policy');
  const { systemId, ...data } = parsed.data;
  return save(req, res, systemId, { op: 'policy.create', data }, (policy) => ({ policy }));
});

configRouter.patch('/config/policies/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = idOf(req);
  const parsed = z.object({
    patch: PolicySchema.pick({
      categoryId: true, serviceId: true, eligible: true, active: true, frequencyTarget: true, frequencyCounting: true,
      frequencyKind: true, frequencyPeriod: true, planningMode: true, minCount: true, maxCount: true, requireAll: true,
    }).partial(),
  }).safeParse(req.body);
  if (!id || !parsed.success) return badInput(res, 'Check the category policy fields');
  return save(req, res, MUSIC_SYSTEM, { op: 'policy.update', id, patch: parsed.data.patch }, (policy) => ({ policy }));
});

/* ─── Choir <-> category links ─── */

configRouter.get('/config/links', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await readGate(req, res, MUSIC_SYSTEM))) return;
  const rows = await prisma.choirCategoryLink.findMany({ where: { systemId: MUSIC_SYSTEM } });
  res.json({ links: rows.map(toLinkView) });
});

configRouter.post('/config/links', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = LinkSchema.safeParse(req.body);
  if (!parsed.success) return badInput(res, 'Invalid link');
  const { systemId, ...data } = parsed.data;
  return save(req, res, systemId, { op: 'link.create', data }, (link) => ({ link }));
});

configRouter.patch('/config/links/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = idOf(req);
  const parsed = z.object({
    patch: LinkSchema.pick({ choirId: true, categoryId: true, eligibleOverride: true, frequencyOverride: true, active: true }).partial(),
  }).safeParse(req.body);
  if (!id || !parsed.success) return badInput(res, 'Check the choir category link fields');
  return save(req, res, MUSIC_SYSTEM, { op: 'link.update', id, patch: parsed.data.patch }, (link) => ({ link }));
});

/* ─── Fixed Music designations ─── */

configRouter.get('/config/fixed-assignments', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await readGate(req, res, MUSIC_SYSTEM))) return;
  const assignments = await prisma.musicFixedAssignment.findMany({
    where: { systemId: MUSIC_SYSTEM }, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ assignments });
});

configRouter.post('/config/fixed-assignments', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z.object({
    systemId: z.literal(MUSIC_SYSTEM),
    categoryServicePolicyId: IdSchema.optional(),
    serviceId: IdSchema.optional(),
    serviceDate: z.string().date().optional().nullable(),
    serviceTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(),
    choirId: IdSchema,
    displayOrder: NonNegativeInt.default(0),
  }).safeParse(req.body);
  if (!parsed.success) return badInput(res, 'Choose a fixed rule and a choir.');
  const { systemId, ...data } = parsed.data;
  return save(req, res, systemId, { op: 'fixed.create', data }, (assignment) => ({ assignment }));
});

configRouter.delete('/config/fixed-assignments/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = idOf(req);
  if (!id) return badInput(res, 'Choose the fixed assignment to remove.');
  return save(req, res, MUSIC_SYSTEM, { op: 'fixed.delete', id }, () => ({ ok: true }));
});

/* ─── Music choir availability ─── */

configRouter.get('/config/availability', requireAuth, async (req: AuthedRequest, res) => {
  const systemId = await readGate(req, res, MUSIC_SYSTEM);
  if (!systemId) return;
  const filter = z.object({ serviceDate: DateOnly.optional(), choirId: IdSchema.optional() }).safeParse(req.query);
  if (!filter.success) return badInput(res, 'Check the date or choir filter.');
  const records = await prisma.musicChoirUnavailability.findMany({
    where: { systemId, active: true, ...(filter.data.choirId ? { choirId: filter.data.choirId } : {}) },
    orderBy: [{ serviceDate: 'asc' }, { serviceCode: 'asc' }],
  });
  res.json({ availability: records.filter((row) => !filter.data.serviceDate || (row.serviceDate <= filter.data.serviceDate && (row.endDate ?? row.serviceDate) >= filter.data.serviceDate)).slice(0, 200) });
});

configRouter.post('/config/availability', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z.object({
    systemId: z.literal(MUSIC_SYSTEM),
    choirId: IdSchema,
    serviceDate: DateOnly.optional(),
    fromDate: DateOnly.optional(),
    toDate: DateOnly.optional(),
    serviceCode: CodeSchema.optional().nullable(),
    reason: z.string().trim().max(500).optional().nullable(),
  }).safeParse(req.body);
  if (!parsed.success) return badInput(res, 'Choose a choir, date, and optional service.');
  const b = parsed.data;
  const start = b.fromDate ?? b.serviceDate;
  const end = b.toDate ?? start;
  if (!start || !end) return badInput(res, 'Choose a valid From and To date; To cannot be before From.');
  return save(req, res, b.systemId, { op: 'availability.add', data: { choirId: b.choirId, fromDate: start, toDate: end, serviceCode: b.serviceCode, reason: b.reason } }, (availability) => ({ availability }));
});

configRouter.delete('/config/availability/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = idOf(req);
  if (!id) return badInput(res, 'Invalid availability record.');
  return save(req, res, MUSIC_SYSTEM, { op: 'availability.clear', id }, () => ({ ok: true }));
});

/* ─── Protocol service rules ─── */

configRouter.get('/config/protocol/rules', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await readGate(req, res, PROTOCOL_SYSTEM))) return;
  const [rules, services] = await Promise.all([
    prisma.protocolServiceRule.findMany({ where: { systemId: PROTOCOL_SYSTEM } }),
    prisma.schedulingService.findMany({ where: { systemId: MUSIC_SYSTEM } }),
  ]);
  const codeById = new Map(services.map((service) => [service.id, service.code]));
  res.json({ rules: rules.map((rule) => ({ ...toRuleView(rule), serviceCode: codeById.get(rule.serviceId) })) });
});

configRouter.post('/config/protocol/rules', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = ProtocolRuleSchema.safeParse(req.body);
  if (!parsed.success) return badInput(res, 'Invalid protocol rule');
  const { systemId, ...data } = parsed.data;
  return save(req, res, systemId, { op: 'rule.create', data }, (rule) => ({ rule }));
});

configRouter.patch('/config/protocol/rules/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = idOf(req);
  const parsed = z.object({
    patch: ProtocolRuleSchema.pick({
      serviceId: true, active: true, required: true, defaultTeamSize: true, teamSizeOverrides: true,
      requireChoir: true, requireWorship: true, relaxableKinds: true,
    }).partial(),
  }).safeParse(req.body);
  if (!id || !parsed.success) return badInput(res, 'Check the Protocol service rule fields');
  return save(req, res, PROTOCOL_SYSTEM, { op: 'rule.update', id, patch: parsed.data.patch }, (rule) => ({ rule }));
});

/* ─── Protocol duty policy ─── */

configRouter.get('/config/protocol/policy', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await readGate(req, res, PROTOCOL_SYSTEM))) return;
  const row = await prisma.protocolDutyPolicy.findFirst({ where: { systemId: PROTOCOL_SYSTEM } });
  res.json({ policy: row ? toDutyPolicyView(row) : null });
});

configRouter.post('/config/protocol/policy', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = DutyPolicySchema.safeParse(req.body);
  if (!parsed.success) return badInput(res, 'Invalid duty policy');
  const { systemId, ...data } = parsed.data;
  return save(req, res, systemId, { op: 'duty.create', data }, (policy) => ({ policy }));
});

configRouter.patch('/config/protocol/policy/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = idOf(req);
  const parsed = z.object({
    patch: DutyPolicySchema.omit({ systemId: true }).partial(),
  }).safeParse(req.body);
  if (!id || !parsed.success) return badInput(res, 'Check the Protocol duty policy fields');
  return save(req, res, PROTOCOL_SYSTEM, { op: 'duty.update', id, patch: parsed.data.patch }, (policy) => ({ policy }));
});
