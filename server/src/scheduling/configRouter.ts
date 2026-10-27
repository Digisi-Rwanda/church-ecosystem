/**
 * Configurable scheduling HTTP API (slice 3.17).
 *
 * Endpoints:
 *   GET    /api/scheduling/config/versions          list config versions for a system
 *   POST   /api/scheduling/config/versions          create a config version
 *   GET    /api/scheduling/config/services          list scheduling services
 *   POST   /api/scheduling/config/services          create a scheduling service
 *   GET    /api/scheduling/config/categories        list choir categories
 *   POST   /api/scheduling/config/categories        create a choir category
 *   GET    /api/scheduling/config/policies          list category × service policies
 *   POST   /api/scheduling/config/policies          create a category × service policy
 *   GET    /api/scheduling/config/links             list choir ↔ category links
 *   POST   /api/scheduling/config/links             create a choir ↔ category link
 *   GET    /api/scheduling/config/protocol/rules    list protocol service rules
 *   POST   /api/scheduling/config/protocol/rules    create a protocol service rule
 *   GET    /api/scheduling/config/protocol/policy   get protocol duty policy
 *   POST   /api/scheduling/config/protocol/policy   create a protocol duty policy
 *
 * Query `systemId` selects the tenant. Authorization is by SCHEDULING/PEOPLE
 * letters held in that system, never by a client-supplied systemId alone.
 *
 * Phase 2 boundary: reads and writes configuration only. No engine changes.
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest, pathParam } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import {
  createConfigVersion, listConfigVersions, getActiveConfigVersion, supersedeConfigVersion,
  createSchedulingService, listSchedulingServices, getSchedulingServiceByCode, supersedeSchedulingService,
  createChoirCategory, listChoirCategories, getChoirCategoryByCode,
  createCategoryServicePolicy, listCategoryServicePolicies,
  createChoirCategoryLink, listChoirCategoryLinks, getChoirCategoryLinkByChoir,
  createProtocolServiceRule, listProtocolServiceRules, getProtocolServiceRuleByService,
  createProtocolDutyPolicy, getProtocolDutyPolicyBySystem,
} from './store.js';
import {
  canReadConfig, canWriteConfig,
} from './rules.js';

export const configRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });

const accessOf = async (me: string) => (await loadAccessData(me)).data;

async function audit(actorId: string, systemId: string, action: string, detail: string, meta: object) {
  await prisma.auditEvent.create({ data: { at: new Date(), actorId, systemId, action, resource: 'SCHEDULING', detail, metaJson: JSON.stringify(meta) } });
}

/* ─── Validation ─── */

const IdSchema = z.string().min(1);
const SystemIdSchema = z.string().min(1);
const NonEmptyName = z.string().trim().min(1).max(120);
const CodeSchema = z.string().trim().min(1).max(40).regex(/^[a-zA-Z0-9_-]+$/);
const PositiveInt = z.number().int().positive();
const NonNegativeInt = z.number().int().nonnegative();
const IsoDate = z.string().datetime().optional();

const VersionSchema = z.object({
  systemId: SystemIdSchema,
  version: PositiveInt,
  label: NonEmptyName,
  status: z.enum(['DRAFT', 'ACTIVE', 'SUPERSEDED', 'SCHEDULED']).default('DRAFT'),
  effectiveFrom: IsoDate,
  effectiveTo: IsoDate,
  createdByPersonId: SystemIdSchema,
  reason: z.string().max(500).optional().nullable(),
  previousVersionId: z.string().cuid().optional().nullable(),
  notes: z.record(z.string(), z.unknown()).default({}),
  validation: z.record(z.string(), z.unknown()).default({}),
  affectedSchedules: z.array(z.string()).default([]),
});

const ServiceSchema = z.object({
  systemId: SystemIdSchema,
  code: CodeSchema,
  name: NonEmptyName,
  kind: z.enum(['SERVICE', 'REHEARSAL', 'MEETING', 'OTHER']).default('SERVICE'),
  weekday: z.number().int().min(0).max(6).optional().nullable(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  recurrence: z.enum(['WEEKLY', 'MONTHLY', 'SELECTED_DATES', 'CUSTOM']).default('WEEKLY'),
  selectedDates: z.array(z.string()).default([]),
  active: z.boolean().default(true),
  effectiveFrom: IsoDate,
  effectiveTo: IsoDate,
  musicRequired: z.boolean().default(false),
  protocolRequired: z.boolean().default(false),
  maxChoirs: NonNegativeInt.default(3),
  configVersionId: z.string().cuid().optional().nullable(),
  displayOrder: NonNegativeInt.default(0),
  supersedesId: z.string().cuid().optional().nullable(),
  createdByPersonId: SystemIdSchema,
});

const CategorySchema = z.object({
  systemId: SystemIdSchema,
  code: CodeSchema,
  name: NonEmptyName,
  description: z.string().max(500).default(''),
  active: z.boolean().default(true),
  effectiveFrom: IsoDate,
  effectiveTo: IsoDate,
  configVersionId: z.string().cuid().optional().nullable(),
  supersedesId: z.string().cuid().optional().nullable(),
  createdByPersonId: SystemIdSchema,
});

const PolicySchema = z.object({
  systemId: SystemIdSchema,
  categoryId: SystemIdSchema,
  serviceId: SystemIdSchema,
  eligible: z.boolean().default(true),
  active: z.boolean().default(true),
  frequencyTarget: PositiveInt.optional().nullable(),
  frequencyCounting: z.enum(['ASSIGNMENTS', 'DISTINCT_DATES']).default('ASSIGNMENTS'),
  frequencyKind: z.enum(['MINIMUM', 'TARGET', 'MAXIMUM']).default('TARGET'),
  planningMode: z.enum(['ROTATION', 'FIXED', 'MANUAL']).default('ROTATION'),
  minCount: PositiveInt.optional().nullable(),
  maxCount: PositiveInt.optional().nullable(),
  requireAll: z.boolean().default(false),
  configVersionId: z.string().cuid().optional().nullable(),
  effectiveFrom: IsoDate,
  effectiveTo: IsoDate,
  supersedesId: z.string().cuid().optional().nullable(),
  createdByPersonId: SystemIdSchema,
});

const LinkSchema = z.object({
  systemId: SystemIdSchema,
  choirId: SystemIdSchema,
  categoryId: SystemIdSchema,
  eligibleOverride: z.record(z.string(), z.unknown()).default({}),
  frequencyOverride: z.record(z.string(), z.unknown()).default({}),
  active: z.boolean().default(true),
  effectiveFrom: IsoDate,
  effectiveTo: IsoDate,
  configVersionId: z.string().cuid().optional().nullable(),
  supersedesId: z.string().cuid().optional().nullable(),
  createdByPersonId: SystemIdSchema,
});

const ProtocolRuleSchema = z.object({
  systemId: SystemIdSchema,
  serviceId: SystemIdSchema,
  active: z.boolean().default(true),
  required: z.boolean().default(false),
  defaultTeamSize: PositiveInt.default(10),
  teamSizeOverrides: z.record(z.string(), PositiveInt).default({}),
  requireChoir: z.boolean().default(true),
  requireWorship: z.boolean().default(true),
  relaxableKinds: z.array(z.string()).default([]),
  configVersionId: z.string().cuid().optional().nullable(),
  effectiveFrom: IsoDate,
  effectiveTo: IsoDate,
  supersedesId: z.string().cuid().optional().nullable(),
  createdByPersonId: SystemIdSchema,
});

const DutyPolicySchema = z.object({
  systemId: SystemIdSchema,
  preferTarget: PositiveInt.default(3),
  softMax: PositiveInt.default(3),
  hardMax: PositiveInt.default(4),
  extraDutyPolicy: z.enum(['ALLOW_WHEN_SHORT', 'NEVER', 'ALWAYS']).default('ALLOW_WHEN_SHORT'),
  duplicateSameDayAllowed: z.boolean().default(false),
  musicCompatibilityRequired: z.boolean().default(true),
  leadershipPriorities: z.array(z.string()).default([]),
  exceptionsAllowed: z.boolean().default(true),
  configVersionId: z.string().cuid().optional().nullable(),
  effectiveFrom: IsoDate,
  effectiveTo: IsoDate,
  supersedesId: z.string().cuid().optional().nullable(),
  createdByPersonId: SystemIdSchema,
});

/* ─── Helpers ─── */

function systemIdOf(req: AuthedRequest): string | undefined {
  const raw = req.query.systemId;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
  return undefined;
}

/* ─── ConfigVersion ─── */

configRouter.get('/config/versions', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = systemIdOf(req);
  if (!systemId) return fail(res, 400, 'BAD_INPUT', 'systemId is required');
  const d = await accessOf(me);
  if (!canReadConfig(me, systemId, d)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const versions = await listConfigVersions(systemId);
  res.json({ versions });
});

configRouter.post('/config/versions', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = VersionSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid config version');
  const b = parsed.data;
  const d = await accessOf(me);
  if (!canWriteConfig(me, b.systemId, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  // Idempotency: same (systemId, version) already exists -> return it.
  const existing = await prisma.configVersion.findFirst({ where: { systemId: b.systemId, version: b.version } });
  if (existing) {
    await audit(me, b.systemId, 'CONFIG_VERSION_EXISTS', `Config version ${b.version} already exists`, { configVersionId: existing.id });
    return res.json({ version: existing.id, status: 'EXISTS' });
  }
  // If activating, supersede the current active version.
  if (b.status === 'ACTIVE') {
    const current = await getActiveConfigVersion(b.systemId);
    if (current) await supersedeConfigVersion(current.id, new Date());
  }
  const created = await createConfigVersion({ ...b, createdByPersonId: me });
  await audit(me, b.systemId, 'CONFIG_VERSION_CREATED', `Created config version ${b.version} “${b.label}”`, { configVersionId: created.id });
  res.status(201).json({ version: created.id });
});

/* ─── SchedulingService ─── */

configRouter.get('/config/services', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = systemIdOf(req);
  if (!systemId) return fail(res, 400, 'BAD_INPUT', 'systemId is required');
  const d = await accessOf(me);
  if (!canReadConfig(me, systemId, d)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const activeOnly = req.query.active === 'true';
  const services = await listSchedulingServices(systemId, activeOnly);
  res.json({ services });
});

configRouter.post('/config/services', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = ServiceSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid service');
  const b = parsed.data;
  const d = await accessOf(me);
  if (!canWriteConfig(me, b.systemId, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  // Idempotency: same (systemId, code) already exists -> return it.
  const existing = await getSchedulingServiceByCode(b.systemId, b.code);
  if (existing) {
    await audit(me, b.systemId, 'SERVICE_EXISTS', `Service ${b.code} already exists`, { serviceId: existing.id });
    return res.json({ service: existing.id, status: 'EXISTS' });
  }
  const created = await createSchedulingService({ ...b, createdByPersonId: me });
  await audit(me, b.systemId, 'SERVICE_CREATED', `Created service “${b.name}” (${b.code})`, { serviceId: created.id });
  res.status(201).json({ service: created.id });
});

configRouter.post('/config/services/:id/retire', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const id = pathParam(req, 'id');
  if (!id || !IdSchema.safeParse(id).success) return fail(res, 400, 'BAD_INPUT', 'Invalid service id');
  const row = await prisma.schedulingService.findUnique({ where: { id } });
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Service not found');
  const d = await accessOf(me);
  if (!canWriteConfig(me, row.systemId, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  await supersedeSchedulingService(id, new Date());
  await audit(me, row.systemId, 'SERVICE_RETIRED', `Retired service “${row.name}” (${row.code})`, { serviceId: id });
  res.json({ ok: true });
});

/* ─── ChoirCategory ─── */

configRouter.get('/config/categories', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = systemIdOf(req);
  if (!systemId) return fail(res, 400, 'BAD_INPUT', 'systemId is required');
  const d = await accessOf(me);
  if (!canReadConfig(me, systemId, d)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const activeOnly = req.query.active === 'true';
  const categories = await listChoirCategories(systemId, activeOnly);
  res.json({ categories });
});

configRouter.post('/config/categories', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = CategorySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid category');
  const b = parsed.data;
  const d = await accessOf(me);
  if (!canWriteConfig(me, b.systemId, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  const existing = await getChoirCategoryByCode(b.systemId, b.code);
  if (existing) {
    await audit(me, b.systemId, 'CATEGORY_EXISTS', `Category ${b.code} already exists`, { categoryId: existing.id });
    return res.json({ category: existing.id, status: 'EXISTS' });
  }
  const created = await createChoirCategory({ ...b, createdByPersonId: me });
  await audit(me, b.systemId, 'CATEGORY_CREATED', `Created category “${b.name}” (${b.code})`, { categoryId: created.id });
  res.status(201).json({ category: created.id });
});

/* ─── CategoryServicePolicy ─── */

configRouter.get('/config/policies', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = systemIdOf(req);
  if (!systemId) return fail(res, 400, 'BAD_INPUT', 'systemId is required');
  const d = await accessOf(me);
  if (!canReadConfig(me, systemId, d)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const policies = await listCategoryServicePolicies(systemId);
  res.json({ policies });
});

configRouter.post('/config/policies', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = PolicySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid policy');
  const b = parsed.data;
  const d = await accessOf(me);
  if (!canWriteConfig(me, b.systemId, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  // Idempotency: same (systemId, categoryId, serviceId) already exists -> return it.
  const existing = await prisma.categoryServicePolicy.findFirst({
    where: { systemId: b.systemId, categoryId: b.categoryId, serviceId: b.serviceId },
  });
  if (existing) {
    await audit(me, b.systemId, 'POLICY_EXISTS', `Policy for ${b.categoryId} × ${b.serviceId} already exists`, { policyId: existing.id });
    return res.json({ policy: existing.id, status: 'EXISTS' });
  }
  const created = await createCategoryServicePolicy({ ...b, createdByPersonId: me });
  await audit(me, b.systemId, 'POLICY_CREATED', `Created policy ${b.categoryId} × ${b.serviceId}`, { policyId: created.id });
  res.status(201).json({ policy: created.id });
});

/* ─── ChoirCategoryLink ─── */

configRouter.get('/config/links', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = systemIdOf(req);
  if (!systemId) return fail(res, 400, 'BAD_INPUT', 'systemId is required');
  const d = await accessOf(me);
  if (!canReadConfig(me, systemId, d)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const links = await listChoirCategoryLinks(systemId);
  res.json({ links });
});

configRouter.post('/config/links', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = LinkSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid link');
  const b = parsed.data;
  const d = await accessOf(me);
  if (!canWriteConfig(me, b.systemId, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  const existing = await getChoirCategoryLinkByChoir(b.systemId, b.choirId);
  if (existing) {
    await audit(me, b.systemId, 'LINK_EXISTS', `Link for choir ${b.choirId} already exists`, { linkId: existing.id });
    return res.json({ link: existing.id, status: 'EXISTS' });
  }
  const created = await createChoirCategoryLink({ ...b, createdByPersonId: me });
  await audit(me, b.systemId, 'LINK_CREATED', `Linked choir ${b.choirId} to category ${b.categoryId}`, { linkId: created.id });
  res.status(201).json({ link: created.id });
});

/* ─── ProtocolServiceRule ─── */

configRouter.get('/config/protocol/rules', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = systemIdOf(req);
  if (!systemId) return fail(res, 400, 'BAD_INPUT', 'systemId is required');
  const d = await accessOf(me);
  if (!canReadConfig(me, systemId, d)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const rules = await listProtocolServiceRules(systemId);
  res.json({ rules });
});

configRouter.post('/config/protocol/rules', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = ProtocolRuleSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid protocol rule');
  const b = parsed.data;
  const d = await accessOf(me);
  if (!canWriteConfig(me, b.systemId, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  const existing = await getProtocolServiceRuleByService(b.systemId, b.serviceId);
  if (existing) {
    await audit(me, b.systemId, 'PROTOCOL_RULE_EXISTS', `Rule for ${b.serviceId} already exists`, { ruleId: existing.id });
    return res.json({ rule: existing.id, status: 'EXISTS' });
  }
  const created = await createProtocolServiceRule({ ...b, createdByPersonId: me });
  await audit(me, b.systemId, 'PROTOCOL_RULE_CREATED', `Created protocol rule for ${b.serviceId}`, { ruleId: created.id });
  res.status(201).json({ rule: created.id });
});

/* ─── ProtocolDutyPolicy ─── */

configRouter.get('/config/protocol/policy', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = systemIdOf(req);
  if (!systemId) return fail(res, 400, 'BAD_INPUT', 'systemId is required');
  const d = await accessOf(me);
  if (!canReadConfig(me, systemId, d)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const policy = await getProtocolDutyPolicyBySystem(systemId);
  if (!policy) return fail(res, 404, 'NOT_FOUND', 'No duty policy for this system');
  res.json({ policy });
});

configRouter.post('/config/protocol/policy', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = DutyPolicySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid duty policy');
  const b = parsed.data;
  const d = await accessOf(me);
  if (!canWriteConfig(me, b.systemId, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  const existing = await getProtocolDutyPolicyBySystem(b.systemId);
  if (existing) {
    await audit(me, b.systemId, 'DUTY_POLICY_EXISTS', `Duty policy for ${b.systemId} already exists`, { policyId: existing.id });
    return res.json({ policy: existing.id, status: 'EXISTS' });
  }
  const created = await createProtocolDutyPolicy({ ...b, createdByPersonId: me });
  await audit(me, b.systemId, 'DUTY_POLICY_CREATED', `Created protocol duty policy for ${b.systemId}`, { policyId: created.id });
  res.status(201).json({ policy: created.id });
});
