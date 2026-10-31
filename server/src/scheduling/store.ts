/**
 * Configurable scheduling persistence layer (slice 3.17).
 *
 * CRUD + versioning for SchedulingService, ChoirCategory, CategoryServicePolicy,
 * ChoirCategoryLink, ProtocolServiceRule, ProtocolDutyPolicy and ConfigVersion.
 * Every row is tenant-scoped by systemId. Edits supersede the prior row instead
 * of overwriting it: the old row gets effectiveTo set and status SUPERSEDED.
 *
 * Phase 2 boundary: reads and writes configuration only. Does not touch the
 * Music or Protocol scheduling engines.
 */

import { prisma } from '../lib/prisma.js';
import type {
  SchedulingServiceCreateInput, ChoirCategoryCreateInput, CategoryServicePolicyCreateInput,
  ProtocolServiceRuleCreateInput, ProtocolDutyPolicyCreateInput, ConfigVersionCreateInput,
  SchedulingServiceView, ChoirCategoryView, CategoryServicePolicyView, ChoirCategoryLinkView,
  ProtocolServiceRuleView, ProtocolDutyPolicyView, ConfigVersionView,
  ConfigStatus, ServiceKind, FrequencyCounting, FrequencyKind, PlanningMode, Recurrence,
  SystemId,
} from './types.js';
import { parseJson, stringifyJson } from './types.js';

/* ─── ConfigVersion ─── */

export async function createConfigVersion(input: ConfigVersionCreateInput): Promise<ConfigVersionView> {
  const r = await prisma.configVersion.create({
    data: {
      systemId: input.systemId,
      version: input.version,
      label: input.label,
      status: input.status ?? 'DRAFT',
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      createdByPersonId: input.createdByPersonId,
      reason: input.reason ?? null,
      previousVersionId: input.previousVersionId ?? null,
      notesJson: stringifyJson(input.notes),
      validationJson: stringifyJson(input.validation),
      affectedSchedulesJson: stringifyJson(input.affectedSchedules),
    },
  });
  return toConfigVersionView(r);
}

export async function getConfigVersion(id: string): Promise<ConfigVersionView | null> {
  const r = await prisma.configVersion.findUnique({ where: { id } });
  return r ? toConfigVersionView(r) : null;
}

export async function listConfigVersions(systemId: SystemId): Promise<ConfigVersionView[]> {
  const rows = await prisma.configVersion.findMany({
    where: { systemId },
    orderBy: [{ version: 'desc' }],
  });
  return rows.map(toConfigVersionView);
}

export async function getActiveConfigVersion(systemId: SystemId): Promise<ConfigVersionView | null> {
  const r = await prisma.configVersion.findFirst({
    where: { systemId, status: 'ACTIVE' },
    orderBy: [{ version: 'desc' }],
  });
  return r ? toConfigVersionView(r) : null;
}

export async function cloneActiveConfigVersion(
  systemId: SystemId,
  input: { label: string; createdByPersonId: string; reason?: string | null },
): Promise<ConfigVersionView> {
  const active = await prisma.configVersion.findFirst({
    where: { systemId, status: 'ACTIVE' },
    orderBy: [{ version: 'desc' }],
  });
  if (!active) {
    const latest = await prisma.configVersion.findFirst({ where: { systemId }, orderBy: [{ version: 'desc' }] });
    return createConfigVersion({
      systemId,
      version: (latest?.version ?? 0) + 1,
      label: input.label,
      status: 'DRAFT',
      createdByPersonId: input.createdByPersonId,
      reason: input.reason,
      previousVersionId: latest?.id ?? null,
    });
  }

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const latest = await tx.configVersion.findFirst({ where: { systemId }, orderBy: [{ version: 'desc' }] });
    const version = await tx.configVersion.create({
      data: {
        systemId,
        version: (latest?.version ?? active.version) + 1,
        label: input.label,
        status: 'DRAFT',
        effectiveFrom: now,
        createdByPersonId: input.createdByPersonId,
        reason: input.reason ?? null,
        previousVersionId: active.id,
        notesJson: active.notesJson,
        validationJson: '{}',
        affectedSchedulesJson: '[]',
      },
    });

    const [services, categories, policies, links, rules, dutyPolicies] = await Promise.all([
      tx.schedulingService.findMany({ where: { systemId, configVersionId: active.id } }),
      tx.choirCategory.findMany({ where: { systemId, configVersionId: active.id } }),
      tx.categoryServicePolicy.findMany({ where: { systemId, configVersionId: active.id } }),
      tx.choirCategoryLink.findMany({ where: { systemId, configVersionId: active.id } }),
      tx.protocolServiceRule.findMany({ where: { systemId, configVersionId: active.id } }),
      tx.protocolDutyPolicy.findMany({ where: { systemId, configVersionId: active.id } }),
    ]);

    const serviceIdMap = new Map<string, string>();
    for (const row of services) {
      const copy = await tx.schedulingService.create({ data: {
        systemId, code: row.code, name: row.name, kind: row.kind, weekday: row.weekday, time: row.time,
        recurrence: row.recurrence, selectedDatesJson: row.selectedDatesJson, active: row.active,
        effectiveFrom: now, effectiveTo: null, musicRequired: row.musicRequired, protocolRequired: row.protocolRequired,
        maxChoirs: row.maxChoirs, targetTeamSize: row.targetTeamSize, configVersionId: version.id,
        displayOrder: row.displayOrder, supersedesId: row.id, createdByPersonId: input.createdByPersonId,
      } });
      serviceIdMap.set(row.id, copy.id);
    }
    const categoryIdMap = new Map<string, string>();
    for (const row of categories) {
      const copy = await tx.choirCategory.create({ data: {
        systemId, code: row.code, name: row.name, description: row.description, active: row.active,
        effectiveFrom: now, effectiveTo: null, configVersionId: version.id, supersedesId: row.id,
        createdByPersonId: input.createdByPersonId,
      } });
      categoryIdMap.set(row.id, copy.id);
    }
    for (const row of policies) await tx.categoryServicePolicy.create({ data: {
      systemId,
      categoryId: categoryIdMap.get(row.categoryId) ?? row.categoryId,
      serviceId: serviceIdMap.get(row.serviceId) ?? row.serviceId,
      eligible: row.eligible, active: row.active,
      frequencyTarget: row.frequencyTarget, frequencyCounting: row.frequencyCounting, frequencyKind: row.frequencyKind,
      planningMode: row.planningMode, minCount: row.minCount, maxCount: row.maxCount, requireAll: row.requireAll,
      configVersionId: version.id, effectiveFrom: now, effectiveTo: null, supersedesId: row.id,
      createdByPersonId: input.createdByPersonId,
    } });
    for (const row of links) await tx.choirCategoryLink.create({ data: {
      systemId, choirId: row.choirId, categoryId: categoryIdMap.get(row.categoryId) ?? row.categoryId,
      eligibleOverrideJson: row.eligibleOverrideJson,
      frequencyOverrideJson: row.frequencyOverrideJson, active: row.active, effectiveFrom: now, effectiveTo: null,
      configVersionId: version.id, supersedesId: row.id, createdByPersonId: input.createdByPersonId,
    } });
    for (const row of rules) await tx.protocolServiceRule.create({ data: {
      systemId, serviceId: serviceIdMap.get(row.serviceId) ?? row.serviceId,
      active: row.active, required: row.required, defaultTeamSize: row.defaultTeamSize,
      teamSizeOverridesJson: row.teamSizeOverridesJson, requireChoir: row.requireChoir, requireWorship: row.requireWorship,
      relaxableKindsJson: row.relaxableKindsJson, configVersionId: version.id, effectiveFrom: now, effectiveTo: null,
      supersedesId: row.id, createdByPersonId: input.createdByPersonId,
    } });
    for (const row of dutyPolicies) await tx.protocolDutyPolicy.create({ data: {
      systemId, preferTarget: row.preferTarget, softMax: row.softMax, hardMax: row.hardMax,
      extraDutyPolicy: row.extraDutyPolicy, duplicateSameDayAllowed: row.duplicateSameDayAllowed,
      musicCompatibilityRequired: row.musicCompatibilityRequired, leadershipPrioritiesJson: row.leadershipPrioritiesJson,
      exceptionsAllowed: row.exceptionsAllowed, configVersionId: version.id, effectiveFrom: now, effectiveTo: null,
      supersedesId: row.id, createdByPersonId: input.createdByPersonId,
    } });

    return toConfigVersionView(version);
  });
}

export async function activateConfigVersion(id: string, systemId: SystemId): Promise<ConfigVersionView | null> {
  return prisma.$transaction(async (tx) => {
    const target = await tx.configVersion.findFirst({ where: { id, systemId } });
    if (!target) return null;
    if (target.status !== 'DRAFT' && target.status !== 'SCHEDULED') {
      throw new Error('Only a draft or scheduled configuration can be activated');
    }

    const now = new Date();
    await tx.configVersion.updateMany({
      where: { systemId, status: 'ACTIVE' },
      data: { status: 'SUPERSEDED', effectiveTo: now },
    });
    const activated = await tx.configVersion.update({
      where: { id },
      data: { status: 'ACTIVE', effectiveFrom: now, effectiveTo: null },
    });
    return toConfigVersionView(activated);
  });
}

export async function supersedeConfigVersion(id: string, now: Date): Promise<void> {
  await prisma.configVersion.update({
    where: { id },
    data: { status: 'SUPERSEDED', effectiveTo: now },
  });
}

/* ─── SchedulingService ─── */

export async function createSchedulingService(input: SchedulingServiceCreateInput): Promise<SchedulingServiceView> {
  await assertNoActiveRecord(
    'schedulingService',
    { systemId: input.systemId, code: input.code, active: true, ...(input.configVersionId ? { configVersionId: input.configVersionId } : {}) },
    `A service with code “${input.code}” already exists in system ${input.systemId}`,
  );
  const r = await prisma.schedulingService.create({
    data: {
      systemId: input.systemId,
      code: input.code,
      name: input.name,
      kind: input.kind ?? 'SERVICE',
      weekday: input.weekday ?? null,
      time: input.time ?? null,
      recurrence: input.recurrence ?? 'WEEKLY',
      selectedDatesJson: stringifyJson(input.selectedDates),
      active: input.active ?? true,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      musicRequired: input.musicRequired ?? false,
      protocolRequired: input.protocolRequired ?? false,
      maxChoirs: input.maxChoirs ?? 3,
      configVersionId: input.configVersionId ?? null,
      displayOrder: input.displayOrder ?? 0,
      supersedesId: input.supersedesId ?? null,
      createdByPersonId: input.createdByPersonId,
    },
  });
  return toServiceView(r);
}

export async function getSchedulingService(id: string): Promise<SchedulingServiceView | null> {
  const r = await prisma.schedulingService.findUnique({ where: { id } });
  return r ? toServiceView(r) : null;
}

export async function getSchedulingServiceByCode(systemId: SystemId, code: string, configVersionId?: string): Promise<SchedulingServiceView | null> {
  const r = await prisma.schedulingService.findFirst({ where: { systemId, code, ...(configVersionId ? { configVersionId } : {}) } });
  return r ? toServiceView(r) : null;
}

export async function getSchedulingServiceByCodeInVersion(
  systemId: SystemId, code: string, configVersionId: string,
): Promise<SchedulingServiceView | null> {
  const r = await prisma.schedulingService.findFirst({ where: { systemId, code, configVersionId } });
  return r ? toServiceView(r) : null;
}

export async function listSchedulingServices(
  systemId: SystemId, activeOnly = false, configVersionId?: string,
): Promise<SchedulingServiceView[]> {
  const rows = await prisma.schedulingService.findMany({
    where: { systemId, ...(activeOnly ? { active: true } : {}), ...(configVersionId ? { configVersionId } : {}) },
    orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
  });
  return rows.map(toServiceView);
}

export async function updateSchedulingService(
  id: string,
  patch: Partial<Pick<SchedulingServiceCreateInput, 'code' | 'name' | 'kind' | 'weekday' | 'time' | 'recurrence' | 'selectedDates' | 'active' | 'effectiveTo' | 'musicRequired' | 'protocolRequired' | 'maxChoirs' | 'displayOrder'>>,
): Promise<SchedulingServiceView> {
  const data: Record<string, unknown> = {};
  if (patch.code !== undefined) data.code = patch.code;
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.kind !== undefined) data.kind = patch.kind;
  if (patch.weekday !== undefined) data.weekday = patch.weekday;
  if (patch.time !== undefined) data.time = patch.time;
  if (patch.recurrence !== undefined) data.recurrence = patch.recurrence;
  if (patch.selectedDates !== undefined) data.selectedDatesJson = stringifyJson(patch.selectedDates);
  if (patch.active !== undefined) data.active = patch.active;
  if (patch.effectiveTo !== undefined) data.effectiveTo = patch.effectiveTo ? new Date(patch.effectiveTo) : null;
  if (patch.musicRequired !== undefined) data.musicRequired = patch.musicRequired;
  if (patch.protocolRequired !== undefined) data.protocolRequired = patch.protocolRequired;
  if (patch.maxChoirs !== undefined) data.maxChoirs = patch.maxChoirs;
  if (patch.displayOrder !== undefined) data.displayOrder = patch.displayOrder;
  const r = await prisma.schedulingService.update({ where: { id }, data });
  return toServiceView(r);
}

export async function supersedeSchedulingService(id: string, now: Date): Promise<void> {
  await prisma.schedulingService.update({
    where: { id },
    data: { active: false, effectiveTo: now },
  });
}

/* ─── ChoirCategory ─── */

export async function createChoirCategory(input: ChoirCategoryCreateInput): Promise<ChoirCategoryView> {
  await assertNoActiveRecord(
    'choirCategory',
    { systemId: input.systemId, code: input.code, active: true, ...(input.configVersionId ? { configVersionId: input.configVersionId } : {}) },
    `A category with code “${input.code}” already exists in system ${input.systemId}`,
  );
  const r = await prisma.choirCategory.create({
    data: {
      systemId: input.systemId,
      code: input.code,
      name: input.name,
      description: input.description ?? '',
      active: input.active ?? true,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      configVersionId: input.configVersionId ?? null,
      supersedesId: input.supersedesId ?? null,
      createdByPersonId: input.createdByPersonId,
    },
  });
  return toCategoryView(r);
}

export async function getChoirCategory(id: string): Promise<ChoirCategoryView | null> {
  const r = await prisma.choirCategory.findUnique({ where: { id } });
  return r ? toCategoryView(r) : null;
}

export async function getChoirCategoryByCode(systemId: SystemId, code: string, configVersionId?: string): Promise<ChoirCategoryView | null> {
  const r = await prisma.choirCategory.findFirst({ where: { systemId, code, ...(configVersionId ? { configVersionId } : {}) } });
  return r ? toCategoryView(r) : null;
}

export async function updateChoirCategory(
  id: string,
  patch: Partial<Pick<ChoirCategoryCreateInput, 'code' | 'name' | 'description' | 'active'>>,
): Promise<ChoirCategoryView> {
  const r = await prisma.choirCategory.update({ where: { id }, data: patch });
  return toCategoryView(r);
}

export async function listChoirCategories(
  systemId: SystemId, activeOnly = false, configVersionId?: string,
): Promise<ChoirCategoryView[]> {
  const rows = await prisma.choirCategory.findMany({
    where: { systemId, ...(activeOnly ? { active: true } : {}), ...(configVersionId ? { configVersionId } : {}) },
    orderBy: [{ name: 'asc' }],
  });
  return rows.map(toCategoryView);
}

/* ─── CategoryServicePolicy ─── */

export async function createCategoryServicePolicy(input: CategoryServicePolicyCreateInput): Promise<CategoryServicePolicyView> {
  await assertNoActiveRecord(
    'categoryServicePolicy',
    { systemId: input.systemId, categoryId: input.categoryId, serviceId: input.serviceId, ...(input.configVersionId ? { configVersionId: input.configVersionId } : {}) },
    `A policy for category ${input.categoryId} × service ${input.serviceId} already exists in system ${input.systemId}`,
  );
  const r = await prisma.categoryServicePolicy.create({
    data: {
      systemId: input.systemId,
      categoryId: input.categoryId,
      serviceId: input.serviceId,
      eligible: input.eligible ?? true,
      frequencyTarget: input.frequencyTarget ?? null,
      frequencyCounting: input.frequencyCounting ?? 'ASSIGNMENTS',
      frequencyKind: input.frequencyKind ?? 'TARGET',
      planningMode: input.planningMode ?? 'ROTATION',
      minCount: input.minCount ?? null,
      maxCount: input.maxCount ?? null,
      requireAll: input.requireAll ?? false,
      active: input.active ?? true,
      configVersionId: input.configVersionId ?? null,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      supersedesId: input.supersedesId ?? null,
      createdByPersonId: input.createdByPersonId,
    },
  });
  return toPolicyView(r);
}

export async function getCategoryServicePolicy(id: string): Promise<CategoryServicePolicyView | null> {
  const r = await prisma.categoryServicePolicy.findUnique({ where: { id } });
  return r ? toPolicyView(r) : null;
}

export async function updateCategoryServicePolicy(
  id: string,
  patch: Partial<Pick<CategoryServicePolicyCreateInput,
    'categoryId' | 'serviceId' | 'eligible' | 'active' | 'frequencyTarget' | 'frequencyCounting' |
    'frequencyKind' | 'planningMode' | 'minCount' | 'maxCount' | 'requireAll'>>,
): Promise<CategoryServicePolicyView> {
  const r = await prisma.categoryServicePolicy.update({ where: { id }, data: patch });
  return toPolicyView(r);
}

export async function listCategoryServicePolicies(systemId: SystemId, configVersionId?: string): Promise<CategoryServicePolicyView[]> {
  const rows = await prisma.categoryServicePolicy.findMany({
    where: { systemId, ...(configVersionId ? { configVersionId } : {}) },
    orderBy: [{ categoryId: 'asc' }, { serviceId: 'asc' }],
  });
  return rows.map(toPolicyView);
}

export async function getPoliciesForCategory(systemId: SystemId, categoryId: string): Promise<CategoryServicePolicyView[]> {
  const rows = await prisma.categoryServicePolicy.findMany({
    where: { systemId, categoryId },
    orderBy: [{ serviceId: 'asc' }],
  });
  return rows.map(toPolicyView);
}

export async function getPoliciesForService(systemId: SystemId, serviceId: string): Promise<CategoryServicePolicyView[]> {
  const rows = await prisma.categoryServicePolicy.findMany({
    where: { systemId, serviceId },
    orderBy: [{ categoryId: 'asc' }],
  });
  return rows.map(toPolicyView);
}

/* ─── ChoirCategoryLink ─── */

export async function createChoirCategoryLink(input: {
  systemId: string; choirId: string; categoryId: string;
  eligibleOverride?: Record<string, unknown>; frequencyOverride?: Record<string, unknown>;
  active?: boolean; effectiveFrom?: string; effectiveTo?: string | null;
  configVersionId?: string | null;
  supersedesId?: string | null; createdByPersonId: string;
}): Promise<ChoirCategoryLinkView> {
  await assertNoActiveRecord(
    'choirCategoryLink',
    { systemId: input.systemId, choirId: input.choirId, active: true, ...(input.configVersionId ? { configVersionId: input.configVersionId } : {}) },
    `A category link for choir ${input.choirId} already exists in system ${input.systemId}`,
  );
  const r = await prisma.choirCategoryLink.create({
    data: {
      systemId: input.systemId,
      choirId: input.choirId,
      categoryId: input.categoryId,
      eligibleOverrideJson: stringifyJson(input.eligibleOverride),
      frequencyOverrideJson: stringifyJson(input.frequencyOverride),
      active: input.active ?? true,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      configVersionId: input.configVersionId ?? null,
      supersedesId: input.supersedesId ?? null,
      createdByPersonId: input.createdByPersonId,
    },
  });
  return toLinkView(r);
}

export async function getChoirCategoryLink(id: string): Promise<ChoirCategoryLinkView | null> {
  const r = await prisma.choirCategoryLink.findUnique({ where: { id } });
  return r ? toLinkView(r) : null;
}

export async function updateChoirCategoryLink(
  id: string,
  patch: Partial<Pick<Parameters<typeof createChoirCategoryLink>[0],
    'choirId' | 'categoryId' | 'eligibleOverride' | 'frequencyOverride' | 'active'>>,
): Promise<ChoirCategoryLinkView> {
  const data: Record<string, unknown> = {};
  if (patch.choirId !== undefined) data.choirId = patch.choirId;
  if (patch.categoryId !== undefined) data.categoryId = patch.categoryId;
  if (patch.eligibleOverride !== undefined) data.eligibleOverrideJson = stringifyJson(patch.eligibleOverride);
  if (patch.frequencyOverride !== undefined) data.frequencyOverrideJson = stringifyJson(patch.frequencyOverride);
  if (patch.active !== undefined) data.active = patch.active;
  const r = await prisma.choirCategoryLink.update({ where: { id }, data });
  return toLinkView(r);
}

export async function getChoirCategoryLinkByChoir(systemId: SystemId, choirId: string, configVersionId?: string): Promise<ChoirCategoryLinkView | null> {
  const r = await prisma.choirCategoryLink.findFirst({ where: { systemId, choirId, ...(configVersionId ? { configVersionId } : {}) } });
  return r ? toLinkView(r) : null;
}

export async function listChoirCategoryLinks(systemId: SystemId, configVersionId?: string): Promise<ChoirCategoryLinkView[]> {
  const rows = await prisma.choirCategoryLink.findMany({
    where: { systemId, ...(configVersionId ? { configVersionId } : {}) },
    orderBy: [{ choirId: 'asc' }],
  });
  return rows.map(toLinkView);
}

/* ─── ProtocolServiceRule ─── */

export async function createProtocolServiceRule(input: ProtocolServiceRuleCreateInput): Promise<ProtocolServiceRuleView> {
  await assertNoActiveRecord(
    'protocolServiceRule',
    { systemId: input.systemId, serviceId: input.serviceId, ...(input.configVersionId ? { configVersionId: input.configVersionId } : {}) },
    `A protocol rule for service ${input.serviceId} already exists in system ${input.systemId}`,
  );
  const r = await prisma.protocolServiceRule.create({
    data: {
      systemId: input.systemId,
      serviceId: input.serviceId,
      required: input.required ?? false,
      defaultTeamSize: input.defaultTeamSize ?? 10,
      teamSizeOverridesJson: stringifyJson(input.teamSizeOverrides),
      requireChoir: input.requireChoir ?? true,
      requireWorship: input.requireWorship ?? true,
      relaxableKindsJson: stringifyJson(input.relaxableKinds),
      active: input.active ?? true,
      configVersionId: input.configVersionId ?? null,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      supersedesId: input.supersedesId ?? null,
      createdByPersonId: input.createdByPersonId,
    },
  });
  return toRuleView(r);
}

export async function getProtocolServiceRule(id: string): Promise<ProtocolServiceRuleView | null> {
  const r = await prisma.protocolServiceRule.findUnique({ where: { id } });
  return r ? toRuleView(r) : null;
}

export async function updateProtocolServiceRule(
  id: string,
  patch: Partial<Pick<ProtocolServiceRuleCreateInput,
    'serviceId' | 'active' | 'required' | 'defaultTeamSize' | 'teamSizeOverrides' |
    'requireChoir' | 'requireWorship' | 'relaxableKinds'>>,
): Promise<ProtocolServiceRuleView> {
  const data: Record<string, unknown> = {};
  if (patch.serviceId !== undefined) data.serviceId = patch.serviceId;
  if (patch.active !== undefined) data.active = patch.active;
  if (patch.required !== undefined) data.required = patch.required;
  if (patch.defaultTeamSize !== undefined) data.defaultTeamSize = patch.defaultTeamSize;
  if (patch.teamSizeOverrides !== undefined) data.teamSizeOverridesJson = stringifyJson(patch.teamSizeOverrides);
  if (patch.requireChoir !== undefined) data.requireChoir = patch.requireChoir;
  if (patch.requireWorship !== undefined) data.requireWorship = patch.requireWorship;
  if (patch.relaxableKinds !== undefined) data.relaxableKindsJson = stringifyJson(patch.relaxableKinds);
  const r = await prisma.protocolServiceRule.update({ where: { id }, data });
  return toRuleView(r);
}

export async function getProtocolServiceRuleByService(systemId: SystemId, serviceId: string, configVersionId?: string): Promise<ProtocolServiceRuleView | null> {
  const r = await prisma.protocolServiceRule.findFirst({ where: { systemId, serviceId, ...(configVersionId ? { configVersionId } : {}) } });
  return r ? toRuleView(r) : null;
}

export async function listProtocolServiceRules(systemId: SystemId, configVersionId?: string): Promise<ProtocolServiceRuleView[]> {
  const rows = await prisma.protocolServiceRule.findMany({
    where: { systemId, ...(configVersionId ? { configVersionId } : {}) },
    orderBy: [{ serviceId: 'asc' }],
  });
  return rows.map(toRuleView);
}

/* ─── ProtocolDutyPolicy ─── */

export async function createProtocolDutyPolicy(input: ProtocolDutyPolicyCreateInput): Promise<ProtocolDutyPolicyView> {
  await assertNoActiveRecord(
    'protocolDutyPolicy',
    { systemId: input.systemId, configVersionId: input.configVersionId },
    `A Protocol duty policy already exists in system ${input.systemId} for this version`,
  );
  const r = await prisma.protocolDutyPolicy.create({
    data: {
      systemId: input.systemId,
      preferTarget: input.preferTarget ?? 3,
      softMax: input.softMax ?? 3,
      hardMax: input.hardMax ?? 4,
      extraDutyPolicy: input.extraDutyPolicy ?? 'ALLOW_WHEN_SHORT',
      duplicateSameDayAllowed: input.duplicateSameDayAllowed ?? false,
      musicCompatibilityRequired: input.musicCompatibilityRequired ?? true,
      leadershipPrioritiesJson: stringifyJson(input.leadershipPriorities),
      exceptionsAllowed: input.exceptionsAllowed ?? true,
      configVersionId: input.configVersionId ?? null,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      supersedesId: input.supersedesId ?? null,
      createdByPersonId: input.createdByPersonId,
    },
  });
  return toDutyPolicyView(r);
}

export async function getProtocolDutyPolicy(id: string): Promise<ProtocolDutyPolicyView | null> {
  const r = await prisma.protocolDutyPolicy.findUnique({ where: { id } });
  return r ? toDutyPolicyView(r) : null;
}

export async function updateProtocolDutyPolicy(
  id: string,
  patch: Partial<Pick<ProtocolDutyPolicyCreateInput,
    'preferTarget' | 'softMax' | 'hardMax' | 'extraDutyPolicy' | 'duplicateSameDayAllowed' |
    'musicCompatibilityRequired' | 'leadershipPriorities' | 'exceptionsAllowed'>>,
): Promise<ProtocolDutyPolicyView> {
  const data: Record<string, unknown> = {};
  if (patch.preferTarget !== undefined) data.preferTarget = patch.preferTarget;
  if (patch.softMax !== undefined) data.softMax = patch.softMax;
  if (patch.hardMax !== undefined) data.hardMax = patch.hardMax;
  if (patch.extraDutyPolicy !== undefined) data.extraDutyPolicy = patch.extraDutyPolicy;
  if (patch.duplicateSameDayAllowed !== undefined) data.duplicateSameDayAllowed = patch.duplicateSameDayAllowed;
  if (patch.musicCompatibilityRequired !== undefined) data.musicCompatibilityRequired = patch.musicCompatibilityRequired;
  if (patch.leadershipPriorities !== undefined) data.leadershipPrioritiesJson = stringifyJson(patch.leadershipPriorities);
  if (patch.exceptionsAllowed !== undefined) data.exceptionsAllowed = patch.exceptionsAllowed;
  const r = await prisma.protocolDutyPolicy.update({ where: { id }, data });
  return toDutyPolicyView(r);
}

export async function getProtocolDutyPolicyBySystem(systemId: SystemId, configVersionId?: string): Promise<ProtocolDutyPolicyView | null> {
  const r = await prisma.protocolDutyPolicy.findFirst({ where: { systemId, ...(configVersionId ? { configVersionId } : {}) } });
  return r ? toDutyPolicyView(r) : null;
}

export async function listProtocolDutyPolicies(systemId: SystemId, configVersionId?: string): Promise<ProtocolDutyPolicyView[]> {
  const rows = await prisma.protocolDutyPolicy.findMany({
    where: { systemId, ...(configVersionId ? { configVersionId } : {}) },
    orderBy: [{ createdAt: 'desc' }],
  });
  return rows.map(toDutyPolicyView);
}

/* ─── Internal helpers ─── */

/** Assert no active record with the same logical identity exists. Allows
  * superseding an existing inactive row, but prevents conflicting active rows.
  * Models without an `active` column (Policy, Rule) always block duplicates;
  * the test fake simulates supersession by setting `active = false`. */
async function assertNoActiveRecord(
  model: string,
  where: Record<string, unknown>,
  message: string,
): Promise<void> {
  const existing = await (prisma as any)[model].findFirst({ where });
  if (existing && existing.active !== false) {
    throw new Error(message);
  }
}

/* ─── Internal mappers (also exported for the config loader) ─── */

export function toConfigVersionView(r: any): ConfigVersionView {
  return {
    id: r.id, systemId: r.systemId, version: r.version, label: r.label, status: r.status as ConfigStatus,
    effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
    createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
    reason: r.reason, previousVersionId: r.previousVersionId,
    notes: parseJson(r.notesJson, {}), validation: parseJson(r.validationJson, {}),
    affectedSchedules: parseJson(r.affectedSchedulesJson, []),
  };
}

export function toServiceView(r: any): SchedulingServiceView {
  return {
    id: r.id, systemId: r.systemId, code: r.code, name: r.name, kind: r.kind as ServiceKind,
    weekday: r.weekday, time: r.time, recurrence: r.recurrence as Recurrence,
    selectedDates: parseJson(r.selectedDatesJson, []),
    active: r.active,
    effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
    musicRequired: r.musicRequired, protocolRequired: r.protocolRequired,
    maxChoirs: r.maxChoirs, targetTeamSize: r.targetTeamSize ?? 10, configVersionId: r.configVersionId,
    displayOrder: r.displayOrder, supersedesId: r.supersedesId,
    createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
  };
}

export function toCategoryView(r: any): ChoirCategoryView {
  return {
    id: r.id, systemId: r.systemId, code: r.code, name: r.name, description: r.description,
    active: r.active,
    effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
    configVersionId: r.configVersionId,
    supersedesId: r.supersedesId, createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
  };
}

export function toPolicyView(r: any): CategoryServicePolicyView {
  return {
    id: r.id, systemId: r.systemId, categoryId: r.categoryId, serviceId: r.serviceId,
    active: r.active ?? true,
    eligible: r.eligible, frequencyTarget: r.frequencyTarget,
    frequencyCounting: r.frequencyCounting as FrequencyCounting,
    frequencyKind: r.frequencyKind as FrequencyKind,
    planningMode: r.planningMode as PlanningMode,
    minCount: r.minCount, maxCount: r.maxCount, requireAll: r.requireAll,
    configVersionId: r.configVersionId,
    effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
    supersedesId: r.supersedesId, createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
  };
}

export function toLinkView(r: any): ChoirCategoryLinkView {
  return {
    id: r.id, systemId: r.systemId, choirId: r.choirId, categoryId: r.categoryId,
    eligibleOverride: parseJson(r.eligibleOverrideJson, {}),
    frequencyOverride: parseJson(r.frequencyOverrideJson, {}),
    active: r.active,
    effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
    configVersionId: r.configVersionId,
    supersedesId: r.supersedesId, createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
  };
}

export function toRuleView(r: any): ProtocolServiceRuleView {
  return {
    id: r.id, systemId: r.systemId, serviceId: r.serviceId, active: r.active ?? true,
    required: r.required,
    defaultTeamSize: r.defaultTeamSize,
    teamSizeOverrides: parseJson(r.teamSizeOverridesJson, {}),
    requireChoir: r.requireChoir, requireWorship: r.requireWorship,
    relaxableKinds: parseJson(r.relaxableKindsJson, []),
    configVersionId: r.configVersionId,
    effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
    supersedesId: r.supersedesId, createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
  };
}

export function toDutyPolicyView(r: any): ProtocolDutyPolicyView {
  return {
    id: r.id, systemId: r.systemId,
    preferTarget: r.preferTarget, softMax: r.softMax, hardMax: r.hardMax,
    extraDutyPolicy: r.extraDutyPolicy as 'ALLOW_WHEN_SHORT' | 'NEVER' | 'ALWAYS',
    duplicateSameDayAllowed: r.duplicateSameDayAllowed,
    musicCompatibilityRequired: r.musicCompatibilityRequired,
    leadershipPriorities: parseJson(r.leadershipPrioritiesJson, []),
    exceptionsAllowed: r.exceptionsAllowed,
    configVersionId: r.configVersionId,
    effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
    supersedesId: r.supersedesId, createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
  };
}
