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
    { systemId: input.systemId, code: input.code, active: true },
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

export async function getSchedulingServiceByCode(systemId: SystemId, code: string): Promise<SchedulingServiceView | null> {
  const r = await prisma.schedulingService.findFirst({ where: { systemId, code } });
  return r ? toServiceView(r) : null;
}

export async function listSchedulingServices(systemId: SystemId, activeOnly = false): Promise<SchedulingServiceView[]> {
  const rows = await prisma.schedulingService.findMany({
    where: activeOnly ? { systemId, active: true } : { systemId },
    orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
  });
  return rows.map(toServiceView);
}

export async function updateSchedulingService(
  id: string,
  patch: Partial<Pick<SchedulingServiceCreateInput, 'name' | 'kind' | 'weekday' | 'time' | 'recurrence' | 'selectedDates' | 'active' | 'effectiveTo' | 'musicRequired' | 'protocolRequired' | 'displayOrder'>>,
): Promise<SchedulingServiceView> {
  const data: Record<string, unknown> = {};
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
    { systemId: input.systemId, code: input.code, active: true },
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

export async function getChoirCategoryByCode(systemId: SystemId, code: string): Promise<ChoirCategoryView | null> {
  const r = await prisma.choirCategory.findFirst({ where: { systemId, code } });
  return r ? toCategoryView(r) : null;
}

export async function listChoirCategories(systemId: SystemId, activeOnly = false): Promise<ChoirCategoryView[]> {
  const rows = await prisma.choirCategory.findMany({
    where: activeOnly ? { systemId, active: true } : { systemId },
    orderBy: [{ name: 'asc' }],
  });
  return rows.map(toCategoryView);
}

/* ─── CategoryServicePolicy ─── */

export async function createCategoryServicePolicy(input: CategoryServicePolicyCreateInput): Promise<CategoryServicePolicyView> {
  await assertNoActiveRecord(
    'categoryServicePolicy',
    { systemId: input.systemId, categoryId: input.categoryId, serviceId: input.serviceId },
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

export async function listCategoryServicePolicies(systemId: SystemId): Promise<CategoryServicePolicyView[]> {
  const rows = await prisma.categoryServicePolicy.findMany({
    where: { systemId },
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
    { systemId: input.systemId, choirId: input.choirId, active: true },
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

export async function getChoirCategoryLinkByChoir(systemId: SystemId, choirId: string): Promise<ChoirCategoryLinkView | null> {
  const r = await prisma.choirCategoryLink.findFirst({ where: { systemId, choirId } });
  return r ? toLinkView(r) : null;
}

export async function listChoirCategoryLinks(systemId: SystemId): Promise<ChoirCategoryLinkView[]> {
  const rows = await prisma.choirCategoryLink.findMany({
    where: { systemId },
    orderBy: [{ choirId: 'asc' }],
  });
  return rows.map(toLinkView);
}

/* ─── ProtocolServiceRule ─── */

export async function createProtocolServiceRule(input: ProtocolServiceRuleCreateInput): Promise<ProtocolServiceRuleView> {
  await assertNoActiveRecord(
    'protocolServiceRule',
    { systemId: input.systemId, serviceId: input.serviceId },
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
  return toProtocolRuleView(r);
}

export async function getProtocolServiceRule(id: string): Promise<ProtocolServiceRuleView | null> {
  const r = await prisma.protocolServiceRule.findUnique({ where: { id } });
  return r ? toProtocolRuleView(r) : null;
}

export async function getProtocolServiceRuleByService(systemId: SystemId, serviceId: string): Promise<ProtocolServiceRuleView | null> {
  const r = await prisma.protocolServiceRule.findFirst({ where: { systemId, serviceId } });
  return r ? toProtocolRuleView(r) : null;
}

export async function listProtocolServiceRules(systemId: SystemId): Promise<ProtocolServiceRuleView[]> {
  const rows = await prisma.protocolServiceRule.findMany({
    where: { systemId },
    orderBy: [{ serviceId: 'asc' }],
  });
  return rows.map(toProtocolRuleView);
}

/* ─── ProtocolDutyPolicy ─── */

export async function createProtocolDutyPolicy(input: ProtocolDutyPolicyCreateInput): Promise<ProtocolDutyPolicyView> {
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

export async function getProtocolDutyPolicyBySystem(systemId: SystemId): Promise<ProtocolDutyPolicyView | null> {
  const r = await prisma.protocolDutyPolicy.findFirst({ where: { systemId } });
  return r ? toDutyPolicyView(r) : null;
}

export async function listProtocolDutyPolicies(systemId: SystemId): Promise<ProtocolDutyPolicyView[]> {
  const rows = await prisma.protocolDutyPolicy.findMany({
    where: { systemId },
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

/* ─── Internal mappers ─── */

function toConfigVersionView(r: any): ConfigVersionView {
  return {
    id: r.id, systemId: r.systemId, version: r.version, label: r.label, status: r.status as ConfigStatus,
    effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
    createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
    reason: r.reason, previousVersionId: r.previousVersionId,
    notes: parseJson(r.notesJson, {}), validation: parseJson(r.validationJson, {}),
    affectedSchedules: parseJson(r.affectedSchedulesJson, []),
  };
}

function toServiceView(r: any): SchedulingServiceView {
  return {
    id: r.id, systemId: r.systemId, code: r.code, name: r.name, kind: r.kind as ServiceKind,
    weekday: r.weekday, time: r.time, recurrence: r.recurrence as Recurrence,
    selectedDates: parseJson(r.selectedDatesJson, []),
    active: r.active,
    effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
    musicRequired: r.musicRequired, protocolRequired: r.protocolRequired,
    maxChoirs: r.maxChoirs, configVersionId: r.configVersionId,
    displayOrder: r.displayOrder, supersedesId: r.supersedesId,
    createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
  };
}

function toCategoryView(r: any): ChoirCategoryView {
  return {
    id: r.id, systemId: r.systemId, code: r.code, name: r.name, description: r.description,
    active: r.active,
    effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
    configVersionId: r.configVersionId,
    supersedesId: r.supersedesId, createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
  };
}

function toPolicyView(r: any): CategoryServicePolicyView {
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

function toLinkView(r: any): ChoirCategoryLinkView {
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

function toProtocolRuleView(r: any): ProtocolServiceRuleView {
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

function toDutyPolicyView(r: any): ProtocolDutyPolicyView {
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
