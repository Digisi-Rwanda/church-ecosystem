/**
 * Configurable scheduling HTTP API (slice 3.17).
 *
 * Endpoints:
 *   GET    /api/scheduling/config/versions          list config versions for a system
 *   POST   /api/scheduling/config/versions          create a config version
 *   GET    /api/scheduling/config/services          list scheduling services
 *   POST   /api/scheduling/config/services          create a scheduling service
 *   PATCH  /api/scheduling/config/services/:id      edit a draft service
 *   GET    /api/scheduling/config/categories        list choir categories
 *   POST   /api/scheduling/config/categories        create a choir category
 *   PATCH  /api/scheduling/config/categories/:id    edit a draft category
 *   GET    /api/scheduling/config/policies          list category × service policies
 *   POST   /api/scheduling/config/policies          create a category × service policy
 *   PATCH  /api/scheduling/config/policies/:id      edit a draft policy
 *   GET    /api/scheduling/config/links             list choir ↔ category links
 *   POST   /api/scheduling/config/links             create a choir ↔ category link
 *   PATCH  /api/scheduling/config/links/:id          edit a draft link
 *   GET    /api/scheduling/config/protocol/rules    list protocol service rules
 *   POST   /api/scheduling/config/protocol/rules    create a protocol service rule
 *   PATCH  /api/scheduling/config/protocol/rules/:id edit a draft rule
 *   GET    /api/scheduling/config/protocol/policy   get protocol duty policy
 *   POST   /api/scheduling/config/protocol/policy   create a protocol duty policy
 *   PATCH  /api/scheduling/config/protocol/policy/:id edit a draft duty policy
 *
 * Query `systemId` selects the tenant. Authorization is by SCHEDULING/PEOPLE
 * letters held in that system, never by a client-supplied systemId alone.
 *
 * Configuration writes are restricted to DRAFT versions.
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest, pathParam } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import {
  createConfigVersion, listConfigVersions, getActiveConfigVersion,
  cloneActiveConfigVersion, activateConfigVersion,
  createSchedulingService, listSchedulingServices, getSchedulingServiceByCodeInVersion, supersedeSchedulingService, updateSchedulingService,
  createChoirCategory, listChoirCategories, getChoirCategoryByCode, updateChoirCategory,
  createCategoryServicePolicy, listCategoryServicePolicies, updateCategoryServicePolicy,
  createChoirCategoryLink, listChoirCategoryLinks, getChoirCategoryLinkByChoir, updateChoirCategoryLink,
  createProtocolServiceRule, listProtocolServiceRules, getProtocolServiceRuleByService, updateProtocolServiceRule,
  createProtocolDutyPolicy, getProtocolDutyPolicyBySystem, updateProtocolDutyPolicy,
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
  createdByPersonId: SystemIdSchema.optional(),
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
  configVersionId: IdSchema.optional().nullable(),
  displayOrder: NonNegativeInt.default(0),
  supersedesId: z.string().cuid().optional().nullable(),
  createdByPersonId: SystemIdSchema.optional(),
});

const CategorySchema = z.object({
  systemId: SystemIdSchema,
  code: CodeSchema,
  name: NonEmptyName,
  description: z.string().max(500).default(''),
  active: z.boolean().default(true),
  effectiveFrom: IsoDate,
  effectiveTo: IsoDate,
  configVersionId: IdSchema.optional().nullable(),
  supersedesId: z.string().cuid().optional().nullable(),
  createdByPersonId: SystemIdSchema.optional(),
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
  configVersionId: IdSchema.optional().nullable(),
  effectiveFrom: IsoDate,
  effectiveTo: IsoDate,
  supersedesId: z.string().cuid().optional().nullable(),
  createdByPersonId: SystemIdSchema.optional(),
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
  configVersionId: IdSchema.optional().nullable(),
  supersedesId: z.string().cuid().optional().nullable(),
  createdByPersonId: SystemIdSchema.optional(),
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
  configVersionId: IdSchema.optional().nullable(),
  effectiveFrom: IsoDate,
  effectiveTo: IsoDate,
  supersedesId: z.string().cuid().optional().nullable(),
  createdByPersonId: SystemIdSchema.optional(),
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
  configVersionId: IdSchema.optional().nullable(),
  effectiveFrom: IsoDate,
  effectiveTo: IsoDate,
  supersedesId: z.string().cuid().optional().nullable(),
  createdByPersonId: SystemIdSchema.optional(),
});

/* ─── Helpers ─── */

function systemIdOf(req: AuthedRequest): string | undefined {
  const raw = req.query.systemId;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
  return undefined;
}

const MUSIC_SYSTEM = 'sys-music';
const PROTOCOL_SYSTEM = 'sys-protocol';
const isConfigSystem = (systemId: string) => systemId === MUSIC_SYSTEM || systemId === PROTOCOL_SYSTEM;

async function draftVersionExists(res: Res, systemId: string, versionId: string | null | undefined): Promise<boolean> {
  if (!versionId) {
    fail(res, 400, 'CONFIG_VERSION_REQUIRED', 'Create a draft configuration version first');
    return false;
  }
  const version = await prisma.configVersion.findFirst({ where: { id: versionId, systemId } });
  if (!version || version.status !== 'DRAFT') {
    fail(res, 409, 'CONFIG_VERSION_NOT_DRAFT', 'Configuration changes must be made in a draft version');
    return false;
  }
  return true;
}

async function musicDraftReferencesExist(
  res: Res,
  configVersionId: string,
  input: { categoryId?: string; serviceId?: string },
): Promise<boolean> {
  if (input.categoryId) {
    const category = await prisma.choirCategory.findFirst({
      where: { id: input.categoryId, systemId: MUSIC_SYSTEM, configVersionId, active: true },
    });
    if (!category) {
      fail(res, 400, 'CONFIG_REFERENCE', 'Choose an active choir category in this draft');
      return false;
    }
  }
  if (input.serviceId) {
    const service = await prisma.schedulingService.findFirst({
      where: { id: input.serviceId, systemId: MUSIC_SYSTEM, configVersionId, active: true },
    });
    if (!service) {
      fail(res, 400, 'CONFIG_REFERENCE', 'Choose an active service in this draft');
      return false;
    }
  }
  return true;
}

async function activeSharedServiceExists(res: Res, serviceId: string): Promise<boolean> {
  const service = await prisma.schedulingService.findFirst({
    where: { id: serviceId, systemId: MUSIC_SYSTEM, active: true },
  });
  if (!service) {
    fail(res, 400, 'CONFIG_REFERENCE', 'Choose an active shared calendar service');
    return false;
  }
  return true;
}

/* ─── ConfigVersion ─── */

configRouter.get('/config/versions', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = systemIdOf(req);
  if (!systemId || !isConfigSystem(systemId)) return fail(res, 400, 'BAD_INPUT', 'A supported systemId is required');
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
  if (!isConfigSystem(b.systemId)) return fail(res, 400, 'BAD_INPUT', 'Unsupported configuration system');
  if (!canWriteConfig(me, b.systemId, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  if (b.status !== 'DRAFT') return fail(res, 400, 'BAD_INPUT', 'Create a draft version, then activate it separately');
  // Idempotency: same (systemId, version) already exists -> return it.
  const existing = await prisma.configVersion.findFirst({ where: { systemId: b.systemId, version: b.version } });
  if (existing) {
    await audit(me, b.systemId, 'CONFIG_VERSION_EXISTS', `Config version ${b.version} already exists`, { configVersionId: existing.id });
    return res.json({ version: existing.id, status: 'EXISTS' });
  }
  const created = await createConfigVersion({ ...b, status: 'DRAFT', createdByPersonId: me });
  await audit(me, b.systemId, 'CONFIG_VERSION_CREATED', `Created config version ${b.version} “${b.label}”`, { configVersionId: created.id });
  res.status(201).json({ version: created.id });
});

configRouter.post('/config/versions/clone', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = z.object({
    systemId: z.enum([MUSIC_SYSTEM, PROTOCOL_SYSTEM]),
    label: NonEmptyName,
    reason: z.string().max(500).optional().nullable(),
  }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Choose a system and draft label');
  const b = parsed.data;
  const d = await accessOf(me);
  if (!canWriteConfig(me, b.systemId, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  try {
    const version = await cloneActiveConfigVersion(b.systemId, { ...b, createdByPersonId: me });
    await audit(me, b.systemId, 'CONFIG_VERSION_CLONED', `Created draft “${version.label}” from the active configuration`, { configVersionId: version.id, previousVersionId: version.previousVersionId });
    return res.status(201).json({ version });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('No active configuration')) return fail(res, 409, 'NO_ACTIVE_CONFIG', error.message);
    throw error;
  }
});

configRouter.post('/config/versions/:id/activate', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const id = pathParam(req, 'id');
  if (!id || !IdSchema.safeParse(id).success) return fail(res, 400, 'BAD_INPUT', 'Invalid version id');
  const version = await prisma.configVersion.findUnique({ where: { id } });
  if (!version) return fail(res, 404, 'NOT_FOUND', 'Configuration version not found');
  const d = await accessOf(me);
  if (!canWriteConfig(me, version.systemId, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  try {
    const activated = await activateConfigVersion(id, version.systemId);
    if (!activated) return fail(res, 404, 'NOT_FOUND', 'Configuration version not found');
    await audit(me, version.systemId, 'CONFIG_VERSION_ACTIVATED', `Activated configuration v${activated.version}`, { configVersionId: id });
    return res.json({ version: activated });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Only a draft or scheduled')) return fail(res, 409, 'CONFIG_VERSION_STATE', error.message);
    throw error;
  }
});

/* ─── SchedulingService ─── */

configRouter.get('/config/services', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = systemIdOf(req);
  if (!systemId || !isConfigSystem(systemId)) return fail(res, 400, 'BAD_INPUT', 'A supported systemId is required');
  const d = await accessOf(me);
  if (!canReadConfig(me, systemId, d)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const activeOnly = req.query.active === 'true';
  const requestedVersion = typeof req.query.configVersionId === 'string' ? req.query.configVersionId : undefined;
  const calendarVersion = requestedVersion
    ? await prisma.configVersion.findFirst({ where: { id: requestedVersion, systemId: MUSIC_SYSTEM } })
    : await getActiveConfigVersion(MUSIC_SYSTEM);
  if (requestedVersion && !calendarVersion) return fail(res, 404, 'NOT_FOUND', 'Calendar version not found');
  const services = await listSchedulingServices(MUSIC_SYSTEM, activeOnly, calendarVersion?.id);
  res.json({ services });
});

configRouter.post('/config/services', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = ServiceSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid service');
  const b = parsed.data;
  const d = await accessOf(me);
  if (!canWriteConfig(me, b.systemId, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  if (b.systemId !== MUSIC_SYSTEM) return fail(res, 400, 'BAD_INPUT', 'Shared calendar services are managed in sys-music');
  if (!(await draftVersionExists(res, b.systemId, b.configVersionId))) return;
  const existing = await getSchedulingServiceByCodeInVersion(b.systemId, b.code, b.configVersionId!);
  if (existing) {
    await audit(me, b.systemId, 'SERVICE_EXISTS', `Service ${b.code} already exists`, { serviceId: existing.id });
    return res.json({ service: existing.id, status: 'EXISTS' });
  }
  const created = await createSchedulingService({ ...b, createdByPersonId: me });
  await audit(me, b.systemId, 'SERVICE_CREATED', `Created service “${b.name}” (${b.code})`, { serviceId: created.id });
  res.status(201).json({ service: created.id });
});

configRouter.patch('/config/services/:id', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const id = pathParam(req, 'id');
  const parsed = z.object({
    configVersionId: IdSchema,
    patch: ServiceSchema.pick({
      code: true, name: true, kind: true, weekday: true, time: true, recurrence: true,
      selectedDates: true, active: true, musicRequired: true, protocolRequired: true,
      maxChoirs: true, displayOrder: true,
    }).partial(),
  }).safeParse(req.body);
  if (!id || !IdSchema.safeParse(id).success || !parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the service fields');
  const d = await accessOf(me);
  if (!canWriteConfig(me, MUSIC_SYSTEM, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  if (!(await draftVersionExists(res, MUSIC_SYSTEM, parsed.data.configVersionId))) return;
  const row = await prisma.schedulingService.findUnique({ where: { id } });
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Service not found');
  if (row.systemId !== MUSIC_SYSTEM || row.configVersionId !== parsed.data.configVersionId) {
    return fail(res, 409, 'CONFIG_VERSION_MISMATCH', 'The service does not belong to the selected draft');
  }
  const { patch } = parsed.data;
  if (patch.code && patch.code !== row.code) {
    const duplicate = await getSchedulingServiceByCodeInVersion(MUSIC_SYSTEM, patch.code, parsed.data.configVersionId);
    if (duplicate) return fail(res, 409, 'DUPLICATE', 'That service code is already used in this draft');
  }
  const updated = await updateSchedulingService(id, patch);
  await audit(me, MUSIC_SYSTEM, 'SERVICE_UPDATED', `Updated service “${updated.name}” (${updated.code})`, { serviceId: id, configVersionId: parsed.data.configVersionId });
  res.json({ service: updated });
});

configRouter.post('/config/services/:id/retire', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const id = pathParam(req, 'id');
  if (!id || !IdSchema.safeParse(id).success) return fail(res, 400, 'BAD_INPUT', 'Invalid service id');
  const row = await prisma.schedulingService.findUnique({ where: { id } });
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Service not found');
  if (row.systemId !== MUSIC_SYSTEM) return fail(res, 409, 'SERVICE_OWNER', 'Only shared calendar services can be retired here');
  const d = await accessOf(me);
  if (!canWriteConfig(me, MUSIC_SYSTEM, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  if (!row.configVersionId) return fail(res, 409, 'LEGACY_SERVICE', 'Create a versioned draft before retiring this service');
  const oldVersion = await prisma.configVersion.findFirst({ where: { id: row.configVersionId, systemId: MUSIC_SYSTEM } });
  if (!oldVersion || oldVersion.status !== 'ACTIVE') return fail(res, 409, 'CONFIG_VERSION_STATE', 'Only a service in the active calendar can be retired');
  const draft = await cloneActiveConfigVersion(MUSIC_SYSTEM, {
    label: `${oldVersion.label} - retire ${row.code}`,
    reason: `Retire shared calendar service ${row.code}`,
    createdByPersonId: me,
  });
  const replacement = await getSchedulingServiceByCodeInVersion(MUSIC_SYSTEM, row.code, draft.id);
  if (!replacement) return fail(res, 409, 'SERVICE_NOT_COPIED', 'The service was not found in the copied draft');
  await supersedeSchedulingService(replacement.id, new Date());
  await activateConfigVersion(draft.id, MUSIC_SYSTEM);
  await audit(me, MUSIC_SYSTEM, 'SERVICE_RETIRED', `Retired service “${row.name}” (${row.code})`, { serviceId: id, configVersionId: draft.id });
  res.json({ ok: true });
});

/* ─── ChoirCategory ─── */

configRouter.get('/config/categories', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = systemIdOf(req);
  if (systemId !== MUSIC_SYSTEM) return fail(res, 400, 'BAD_INPUT', 'Choir categories belong to sys-music');
  const d = await accessOf(me);
  if (!canReadConfig(me, systemId, d)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const activeOnly = req.query.active === 'true';
  const versionId = typeof req.query.configVersionId === 'string' ? req.query.configVersionId : (await getActiveConfigVersion(MUSIC_SYSTEM))?.id;
  const categories = await listChoirCategories(systemId, activeOnly, versionId);
  res.json({ categories });
});

configRouter.post('/config/categories', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = CategorySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid category');
  const b = parsed.data;
  const d = await accessOf(me);
  if (!canWriteConfig(me, b.systemId, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  if (b.systemId !== MUSIC_SYSTEM) return fail(res, 400, 'BAD_INPUT', 'Choir categories belong to sys-music');
  if (!(await draftVersionExists(res, b.systemId, b.configVersionId))) return;
  const existing = await getChoirCategoryByCode(b.systemId, b.code, b.configVersionId!);
  if (existing) {
    await audit(me, b.systemId, 'CATEGORY_EXISTS', `Category ${b.code} already exists`, { categoryId: existing.id });
    return res.json({ category: existing.id, status: 'EXISTS' });
  }
  const created = await createChoirCategory({ ...b, createdByPersonId: me });
  await audit(me, b.systemId, 'CATEGORY_CREATED', `Created category “${b.name}” (${b.code})`, { categoryId: created.id });
  res.status(201).json({ category: created.id });
});

configRouter.patch('/config/categories/:id', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const id = pathParam(req, 'id');
  const parsed = z.object({
    configVersionId: IdSchema,
    patch: CategorySchema.pick({ code: true, name: true, description: true, active: true }).partial(),
  }).safeParse(req.body);
  if (!id || !IdSchema.safeParse(id).success || !parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the category fields');
  const d = await accessOf(me);
  if (!canWriteConfig(me, MUSIC_SYSTEM, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  if (!(await draftVersionExists(res, MUSIC_SYSTEM, parsed.data.configVersionId))) return;
  const row = await prisma.choirCategory.findUnique({ where: { id } });
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Category not found');
  if (row.systemId !== MUSIC_SYSTEM || row.configVersionId !== parsed.data.configVersionId) {
    return fail(res, 409, 'CONFIG_VERSION_MISMATCH', 'The category does not belong to the selected draft');
  }
  if (parsed.data.patch.code && parsed.data.patch.code !== row.code) {
    const duplicate = await getChoirCategoryByCode(MUSIC_SYSTEM, parsed.data.patch.code, parsed.data.configVersionId);
    if (duplicate) return fail(res, 409, 'DUPLICATE', 'That category code is already used in this draft');
  }
  const updated = await updateChoirCategory(id, parsed.data.patch);
  await audit(me, MUSIC_SYSTEM, 'CATEGORY_UPDATED', `Updated category “${updated.name}” (${updated.code})`, { categoryId: id, configVersionId: parsed.data.configVersionId });
  res.json({ category: updated });
});

/* ─── CategoryServicePolicy ─── */

configRouter.get('/config/policies', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = systemIdOf(req);
  if (systemId !== MUSIC_SYSTEM) return fail(res, 400, 'BAD_INPUT', 'Choir policies belong to sys-music');
  const d = await accessOf(me);
  if (!canReadConfig(me, systemId, d)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const versionId = typeof req.query.configVersionId === 'string' ? req.query.configVersionId : (await getActiveConfigVersion(MUSIC_SYSTEM))?.id;
  const policies = await listCategoryServicePolicies(systemId, versionId);
  res.json({ policies });
});

configRouter.post('/config/policies', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = PolicySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid policy');
  const b = parsed.data;
  const d = await accessOf(me);
  if (!canWriteConfig(me, b.systemId, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  if (b.systemId !== MUSIC_SYSTEM) return fail(res, 400, 'BAD_INPUT', 'Choir policies belong to sys-music');
  if (!(await draftVersionExists(res, b.systemId, b.configVersionId))) return;
  if (!(await musicDraftReferencesExist(res, b.configVersionId!, { categoryId: b.categoryId, serviceId: b.serviceId }))) return;
  // Idempotency: same (systemId, categoryId, serviceId) already exists -> return it.
  const existing = await prisma.categoryServicePolicy.findFirst({
    where: { systemId: b.systemId, categoryId: b.categoryId, serviceId: b.serviceId, configVersionId: b.configVersionId },
  });
  if (existing) {
    await audit(me, b.systemId, 'POLICY_EXISTS', `Policy for ${b.categoryId} × ${b.serviceId} already exists`, { policyId: existing.id });
    return res.json({ policy: existing.id, status: 'EXISTS' });
  }
  const created = await createCategoryServicePolicy({ ...b, createdByPersonId: me });
  await audit(me, b.systemId, 'POLICY_CREATED', `Created policy ${b.categoryId} × ${b.serviceId}`, { policyId: created.id });
  res.status(201).json({ policy: created.id });
});

configRouter.patch('/config/policies/:id', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const id = pathParam(req, 'id');
  const parsed = z.object({
    configVersionId: IdSchema,
    patch: PolicySchema.pick({
      categoryId: true, serviceId: true, eligible: true, active: true, frequencyTarget: true,
      frequencyCounting: true, frequencyKind: true, planningMode: true, minCount: true,
      maxCount: true, requireAll: true,
    }).partial(),
  }).safeParse(req.body);
  if (!id || !IdSchema.safeParse(id).success || !parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the category policy fields');
  const d = await accessOf(me);
  if (!canWriteConfig(me, MUSIC_SYSTEM, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  if (!(await draftVersionExists(res, MUSIC_SYSTEM, parsed.data.configVersionId))) return;
  const row = await prisma.categoryServicePolicy.findUnique({ where: { id } });
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Policy not found');
  if (row.systemId !== MUSIC_SYSTEM || row.configVersionId !== parsed.data.configVersionId) {
    return fail(res, 409, 'CONFIG_VERSION_MISMATCH', 'The policy does not belong to the selected draft');
  }
  const categoryId = parsed.data.patch.categoryId ?? row.categoryId;
  const serviceId = parsed.data.patch.serviceId ?? row.serviceId;
  if (!(await musicDraftReferencesExist(res, parsed.data.configVersionId, { categoryId, serviceId }))) return;
  const duplicate = await prisma.categoryServicePolicy.findFirst({
    where: { systemId: MUSIC_SYSTEM, configVersionId: parsed.data.configVersionId, categoryId, serviceId },
  });
  if (duplicate && duplicate.id !== id) return fail(res, 409, 'DUPLICATE', 'That category and service already have a policy in this draft');
  const updated = await updateCategoryServicePolicy(id, parsed.data.patch);
  await audit(me, MUSIC_SYSTEM, 'POLICY_UPDATED', `Updated policy for ${categoryId} × ${serviceId}`, { policyId: id, configVersionId: parsed.data.configVersionId });
  res.json({ policy: updated });
});

/* ─── ChoirCategoryLink ─── */

configRouter.get('/config/links', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = systemIdOf(req);
  if (systemId !== MUSIC_SYSTEM) return fail(res, 400, 'BAD_INPUT', 'Choir category links belong to sys-music');
  const d = await accessOf(me);
  if (!canReadConfig(me, systemId, d)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const versionId = typeof req.query.configVersionId === 'string' ? req.query.configVersionId : (await getActiveConfigVersion(MUSIC_SYSTEM))?.id;
  const links = await listChoirCategoryLinks(systemId, versionId);
  res.json({ links });
});

configRouter.post('/config/links', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = LinkSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid link');
  const b = parsed.data;
  const d = await accessOf(me);
  if (!canWriteConfig(me, b.systemId, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  if (b.systemId !== MUSIC_SYSTEM) return fail(res, 400, 'BAD_INPUT', 'Choir category links belong to sys-music');
  if (!(await draftVersionExists(res, b.systemId, b.configVersionId))) return;
  if (!(await musicDraftReferencesExist(res, b.configVersionId!, { categoryId: b.categoryId }))) return;
  const choir = await prisma.musicChoir.findFirst({ where: { id: b.choirId, active: true } });
  if (!choir) return fail(res, 400, 'CONFIG_REFERENCE', 'Choose an active choir');
  const existing = await getChoirCategoryLinkByChoir(b.systemId, b.choirId, b.configVersionId!);
  if (existing) {
    await audit(me, b.systemId, 'LINK_EXISTS', `Link for choir ${b.choirId} already exists`, { linkId: existing.id });
    return res.json({ link: existing.id, status: 'EXISTS' });
  }
  const created = await createChoirCategoryLink({ ...b, createdByPersonId: me });
  await audit(me, b.systemId, 'LINK_CREATED', `Linked choir ${b.choirId} to category ${b.categoryId}`, { linkId: created.id });
  res.status(201).json({ link: created.id });
});

configRouter.patch('/config/links/:id', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const id = pathParam(req, 'id');
  const parsed = z.object({
    configVersionId: IdSchema,
    patch: LinkSchema.pick({
      choirId: true, categoryId: true, eligibleOverride: true, frequencyOverride: true, active: true,
    }).partial(),
  }).safeParse(req.body);
  if (!id || !IdSchema.safeParse(id).success || !parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the choir category link fields');
  const d = await accessOf(me);
  if (!canWriteConfig(me, MUSIC_SYSTEM, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  if (!(await draftVersionExists(res, MUSIC_SYSTEM, parsed.data.configVersionId))) return;
  const row = await prisma.choirCategoryLink.findUnique({ where: { id } });
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Choir category link not found');
  if (row.systemId !== MUSIC_SYSTEM || row.configVersionId !== parsed.data.configVersionId) {
    return fail(res, 409, 'CONFIG_VERSION_MISMATCH', 'The link does not belong to the selected draft');
  }
  const categoryId = parsed.data.patch.categoryId ?? row.categoryId;
  const choirId = parsed.data.patch.choirId ?? row.choirId;
  if (!(await musicDraftReferencesExist(res, parsed.data.configVersionId, { categoryId }))) return;
  const choir = await prisma.musicChoir.findFirst({ where: { id: choirId, active: true } });
  if (!choir) return fail(res, 400, 'CONFIG_REFERENCE', 'Choose an active choir');
  const duplicate = await prisma.choirCategoryLink.findFirst({
    where: { systemId: MUSIC_SYSTEM, configVersionId: parsed.data.configVersionId, choirId },
  });
  if (duplicate && duplicate.id !== id) return fail(res, 409, 'DUPLICATE', 'That choir already has a category link in this draft');
  const updated = await updateChoirCategoryLink(id, parsed.data.patch);
  await audit(me, MUSIC_SYSTEM, 'LINK_UPDATED', `Updated choir category link for ${choirId}`, { linkId: id, configVersionId: parsed.data.configVersionId });
  res.json({ link: updated });
});

/* ─── ProtocolServiceRule ─── */

configRouter.get('/config/protocol/rules', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = systemIdOf(req);
  if (systemId !== PROTOCOL_SYSTEM) return fail(res, 400, 'BAD_INPUT', 'Protocol rules belong to sys-protocol');
  const d = await accessOf(me);
  if (!canReadConfig(me, systemId, d)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const versionId = typeof req.query.configVersionId === 'string' ? req.query.configVersionId : (await getActiveConfigVersion(PROTOCOL_SYSTEM))?.id;
  const [rules, allServices, activeCalendarVersion] = await Promise.all([
    listProtocolServiceRules(systemId, versionId),
    prisma.schedulingService.findMany({ where: { systemId: MUSIC_SYSTEM } }),
    getActiveConfigVersion(MUSIC_SYSTEM),
  ]);
  const activeServices = await listSchedulingServices(MUSIC_SYSTEM, true, activeCalendarVersion?.id);
  const codeById = new Map(allServices.map((service) => [service.id, service.code]));
  const currentIdByCode = new Map(activeServices.map((service) => [service.code, service.id]));
  res.json({
    rules: rules.map((rule) => ({
      ...rule,
      serviceCode: codeById.get(rule.serviceId),
      serviceId: currentIdByCode.get(codeById.get(rule.serviceId) ?? '') ?? rule.serviceId,
    })),
  });
});

configRouter.post('/config/protocol/rules', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = ProtocolRuleSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid protocol rule');
  const b = parsed.data;
  const d = await accessOf(me);
  if (!canWriteConfig(me, b.systemId, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  if (b.systemId !== PROTOCOL_SYSTEM) return fail(res, 400, 'BAD_INPUT', 'Protocol rules belong to sys-protocol');
  if (!(await draftVersionExists(res, b.systemId, b.configVersionId))) return;
  if (!(await activeSharedServiceExists(res, b.serviceId))) return;
  const existing = await getProtocolServiceRuleByService(b.systemId, b.serviceId, b.configVersionId!);
  if (existing) {
    await audit(me, b.systemId, 'PROTOCOL_RULE_EXISTS', `Rule for ${b.serviceId} already exists`, { ruleId: existing.id });
    return res.json({ rule: existing.id, status: 'EXISTS' });
  }
  const created = await createProtocolServiceRule({ ...b, createdByPersonId: me });
  await audit(me, b.systemId, 'PROTOCOL_RULE_CREATED', `Created protocol rule for ${b.serviceId}`, { ruleId: created.id });
  res.status(201).json({ rule: created.id });
});

configRouter.patch('/config/protocol/rules/:id', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const id = pathParam(req, 'id');
  const parsed = z.object({
    configVersionId: IdSchema,
    patch: ProtocolRuleSchema.pick({
      serviceId: true, active: true, required: true, defaultTeamSize: true,
      teamSizeOverrides: true, requireChoir: true, requireWorship: true, relaxableKinds: true,
    }).partial(),
  }).safeParse(req.body);
  if (!id || !IdSchema.safeParse(id).success || !parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the Protocol service rule fields');
  const d = await accessOf(me);
  if (!canWriteConfig(me, PROTOCOL_SYSTEM, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  if (!(await draftVersionExists(res, PROTOCOL_SYSTEM, parsed.data.configVersionId))) return;
  const row = await prisma.protocolServiceRule.findUnique({ where: { id } });
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Protocol rule not found');
  if (row.systemId !== PROTOCOL_SYSTEM || row.configVersionId !== parsed.data.configVersionId) {
    return fail(res, 409, 'CONFIG_VERSION_MISMATCH', 'The Protocol rule does not belong to the selected draft');
  }
  const serviceId = parsed.data.patch.serviceId ?? row.serviceId;
  if (!(await activeSharedServiceExists(res, serviceId))) return;
  const duplicate = await prisma.protocolServiceRule.findFirst({
    where: { systemId: PROTOCOL_SYSTEM, configVersionId: parsed.data.configVersionId, serviceId },
  });
  if (duplicate && duplicate.id !== id) return fail(res, 409, 'DUPLICATE', 'That service already has a Protocol rule in this draft');
  const updated = await updateProtocolServiceRule(id, parsed.data.patch);
  await audit(me, PROTOCOL_SYSTEM, 'PROTOCOL_RULE_UPDATED', `Updated Protocol rule for ${serviceId}`, { ruleId: id, configVersionId: parsed.data.configVersionId });
  res.json({ rule: updated });
});

/* ─── ProtocolDutyPolicy ─── */

configRouter.get('/config/protocol/policy', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const systemId = systemIdOf(req);
  if (systemId !== PROTOCOL_SYSTEM) return fail(res, 400, 'BAD_INPUT', 'Protocol duty policy belongs to sys-protocol');
  const d = await accessOf(me);
  if (!canReadConfig(me, systemId, d)) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const versionId = typeof req.query.configVersionId === 'string' ? req.query.configVersionId : (await getActiveConfigVersion(PROTOCOL_SYSTEM))?.id;
  const policy = await getProtocolDutyPolicyBySystem(systemId, versionId);
  res.json({ policy });
});

configRouter.post('/config/protocol/policy', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const parsed = DutyPolicySchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Invalid duty policy');
  const b = parsed.data;
  const d = await accessOf(me);
  if (!canWriteConfig(me, b.systemId, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  if (b.systemId !== PROTOCOL_SYSTEM) return fail(res, 400, 'BAD_INPUT', 'Protocol duty policy belongs to sys-protocol');
  if (!(await draftVersionExists(res, b.systemId, b.configVersionId))) return;
  if (b.softMax < b.preferTarget || b.hardMax < b.softMax) {
    return fail(res, 400, 'BAD_INPUT', 'Duty limits must satisfy prefer target ≤ soft maximum ≤ hard maximum');
  }
  const existing = await getProtocolDutyPolicyBySystem(b.systemId, b.configVersionId!);
  if (existing) {
    await audit(me, b.systemId, 'DUTY_POLICY_EXISTS', `Duty policy for ${b.systemId} already exists`, { policyId: existing.id });
    return res.json({ policy: existing.id, status: 'EXISTS' });
  }
  const created = await createProtocolDutyPolicy({ ...b, createdByPersonId: me });
  await audit(me, b.systemId, 'DUTY_POLICY_CREATED', `Created protocol duty policy for ${b.systemId}`, { policyId: created.id });
  res.status(201).json({ policy: created.id });
});

configRouter.patch('/config/protocol/policy/:id', requireAuth, async (req: AuthedRequest, res) => {
  const me = req.auth!.personId;
  const id = pathParam(req, 'id');
  const parsed = z.object({
    configVersionId: IdSchema,
    patch: DutyPolicySchema.pick({
      preferTarget: true, softMax: true, hardMax: true, extraDutyPolicy: true,
      duplicateSameDayAllowed: true, musicCompatibilityRequired: true, leadershipPriorities: true,
      exceptionsAllowed: true,
    }).partial(),
  }).safeParse(req.body);
  if (!id || !IdSchema.safeParse(id).success || !parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the Protocol duty policy fields');
  const d = await accessOf(me);
  if (!canWriteConfig(me, PROTOCOL_SYSTEM, d)) return fail(res, 403, 'FORBIDDEN', 'You may not change scheduling configuration');
  if (!(await draftVersionExists(res, PROTOCOL_SYSTEM, parsed.data.configVersionId))) return;
  const row = await prisma.protocolDutyPolicy.findUnique({ where: { id } });
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Protocol duty policy not found');
  if (row.systemId !== PROTOCOL_SYSTEM || row.configVersionId !== parsed.data.configVersionId) {
    return fail(res, 409, 'CONFIG_VERSION_MISMATCH', 'The Protocol duty policy does not belong to the selected draft');
  }
  const { preferTarget, softMax, hardMax } = parsed.data.patch;
  const currentTarget = preferTarget ?? row.preferTarget;
  const currentSoftMax = softMax ?? row.softMax;
  const currentHardMax = hardMax ?? row.hardMax;
  if (currentSoftMax < currentTarget || currentHardMax < currentSoftMax) {
    return fail(res, 400, 'BAD_INPUT', 'Duty limits must satisfy prefer target ≤ soft maximum ≤ hard maximum');
  }
  const updated = await updateProtocolDutyPolicy(id, parsed.data.patch);
  await audit(me, PROTOCOL_SYSTEM, 'DUTY_POLICY_UPDATED', 'Updated Protocol duty policy', { policyId: id, configVersionId: parsed.data.configVersionId });
  res.json({ policy: updated });
});
