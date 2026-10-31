/**
 * Configurable Music & Protocol scheduling (slice 3.17).
 *
 * Tenant-scoped, versioned configuration that replaces hard-coded church
 * scheduling policy. Every row carries systemId, effectiveFrom / effectiveTo
 * and status; edits supersede the prior row instead of overwriting it.
 * MusicMonth and ProtocolPlan record the ConfigVersion they were generated
 * against, keeping published schedules reproducible.
 *
 * Phase 2 boundary: this module only persists and reads configuration. It does
 * not modify the Music or Protocol scheduling engines.
 */

import type { ConfigVersion, SchedulingService, ChoirCategory, CategoryServicePolicy, ChoirCategoryLink, ProtocolServiceRule, ProtocolDutyPolicy } from '@prisma/client';

export type { ConfigVersion, SchedulingService, ChoirCategory, CategoryServicePolicy, ChoirCategoryLink, ProtocolServiceRule, ProtocolDutyPolicy };

export const SYSTEM_MUSIC = 'sys-music';
export const SYSTEM_PROTOCOL = 'sys-protocol';

export type SystemId = string;

export type ConfigStatus = 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'SCHEDULED';

export type ServiceKind = 'SERVICE' | 'REHEARSAL' | 'MEETING' | 'OTHER';

export type FrequencyCounting = 'ASSIGNMENTS' | 'DISTINCT_DATES';
export type FrequencyKind = 'MINIMUM' | 'TARGET' | 'MAXIMUM';
export type PlanningMode = 'ROTATION' | 'FIXED' | 'MANUAL';
export type Recurrence = 'WEEKLY' | 'MONTHLY' | 'SELECTED_DATES' | 'CUSTOM';

export const SERVICE_CODES = ['SS1', 'SS2', 'TUESDAY', 'FRIDAY', 'IGABURO'] as const;
export type ServiceCode = (typeof SERVICE_CODES)[number];

export const CHOIR_CATEGORY_CODES = ['PRIMARY', 'SECONDARY', 'CHILDREN', 'WORSHIP'] as const;
export type ChoirCategoryCode = (typeof CHOIR_CATEGORY_CODES)[number];

/* ─── Public read types (leak nothing internal) ─── */

export interface SchedulingServiceView {
  id: string;
  systemId: string;
  code: string;
  name: string;
  kind: ServiceKind;
  weekday: number | null;
  time: string | null;
  recurrence: Recurrence;
  selectedDates: string[];
  active: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  musicRequired: boolean;
  protocolRequired: boolean;
  maxChoirs: number;
  targetTeamSize: number;
  configVersionId: string | null;
  displayOrder: number;
  supersedesId: string | null;
  createdByPersonId: string;
  createdAt: string;
}

export interface ChoirCategoryView {
  id: string;
  systemId: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  configVersionId: string | null;
  supersedesId: string | null;
  createdByPersonId: string;
  createdAt: string;
}

export interface CategoryServicePolicyView {
  id: string;
  systemId: string;
  categoryId: string;
  serviceId: string;
  eligible: boolean;
  active: boolean;
  frequencyTarget: number | null;
  frequencyCounting: FrequencyCounting;
  frequencyKind: FrequencyKind;
  planningMode: PlanningMode;
  minCount: number | null;
  maxCount: number | null;
  requireAll: boolean;
  configVersionId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  supersedesId: string | null;
  createdByPersonId: string;
  createdAt: string;
}

export interface ChoirCategoryLinkView {
  id: string;
  systemId: string;
  choirId: string;
  categoryId: string;
  eligibleOverride: Record<string, unknown>;
  frequencyOverride: Record<string, unknown>;
  active: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  configVersionId: string | null;
  supersedesId: string | null;
  createdByPersonId: string;
  createdAt: string;
}

export interface ProtocolServiceRuleView {
  id: string;
  systemId: string;
  serviceId: string;
  active: boolean;
  required: boolean;
  defaultTeamSize: number;
  teamSizeOverrides: Record<string, number>;
  requireChoir: boolean;
  requireWorship: boolean;
  relaxableKinds: string[];
  configVersionId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  supersedesId: string | null;
  createdByPersonId: string;
  createdAt: string;
}

export interface ProtocolDutyPolicyView {
  id: string;
  systemId: string;
  preferTarget: number;
  softMax: number;
  hardMax: number;
  extraDutyPolicy: 'ALLOW_WHEN_SHORT' | 'NEVER' | 'ALWAYS';
  duplicateSameDayAllowed: boolean;
  musicCompatibilityRequired: boolean;
  leadershipPriorities: string[];
  exceptionsAllowed: boolean;
  configVersionId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  supersedesId: string | null;
  createdByPersonId: string;
  createdAt: string;
}

export interface ConfigVersionView {
  id: string;
  systemId: string;
  version: number;
  label: string;
  status: ConfigStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdByPersonId: string;
  createdAt: string;
  reason: string | null;
  previousVersionId: string | null;
  notes: Record<string, unknown>;
  validation: Record<string, unknown>;
  affectedSchedules: string[];
}

export interface ConfigVersionCreateInput {
  systemId: string;
  version: number;
  label: string;
  status?: ConfigStatus;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  createdByPersonId: string;
  reason?: string | null;
  previousVersionId?: string | null;
  notes?: Record<string, unknown>;
  validation?: Record<string, unknown>;
  affectedSchedules?: string[];
}

export interface SchedulingServiceCreateInput {
  systemId: string;
  code: string;
  name: string;
  kind?: ServiceKind;
  weekday?: number | null;
  time?: string | null;
  recurrence?: Recurrence;
  selectedDates?: string[];
  active?: boolean;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  musicRequired?: boolean;
  protocolRequired?: boolean;
  maxChoirs?: number;
  configVersionId?: string | null;
  displayOrder?: number;
  supersedesId?: string | null;
  createdByPersonId: string;
}

export interface ChoirCategoryCreateInput {
  systemId: string;
  code: string;
  name: string;
  description?: string;
  active?: boolean;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  configVersionId?: string | null;
  supersedesId?: string | null;
  createdByPersonId: string;
}

export interface CategoryServicePolicyCreateInput {
  systemId: string;
  categoryId: string;
  serviceId: string;
  eligible?: boolean;
  active?: boolean;
  frequencyTarget?: number | null;
  frequencyCounting?: FrequencyCounting;
  frequencyKind?: FrequencyKind;
  planningMode?: PlanningMode;
  minCount?: number | null;
  maxCount?: number | null;
  requireAll?: boolean;
  configVersionId?: string | null;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  supersedesId?: string | null;
  createdByPersonId: string;
}

export interface ProtocolServiceRuleCreateInput {
  systemId: string;
  serviceId: string;
  active?: boolean;
  required?: boolean;
  defaultTeamSize?: number;
  teamSizeOverrides?: Record<string, number>;
  requireChoir?: boolean;
  requireWorship?: boolean;
  relaxableKinds?: string[];
  configVersionId?: string | null;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  supersedesId?: string | null;
  createdByPersonId: string;
}

export interface ProtocolDutyPolicyCreateInput {
  systemId: string;
  preferTarget?: number;
  softMax?: number;
  hardMax?: number;
  extraDutyPolicy?: 'ALLOW_WHEN_SHORT' | 'NEVER' | 'ALWAYS';
  duplicateSameDayAllowed?: boolean;
  musicCompatibilityRequired?: boolean;
  leadershipPriorities?: string[];
  exceptionsAllowed?: boolean;
  configVersionId?: string | null;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  supersedesId?: string | null;
  createdByPersonId: string;
}

/* ─── Row mappers ─── */

export const toServiceView = (r: SchedulingService): SchedulingServiceView => ({
  id: r.id, systemId: r.systemId, code: r.code, name: r.name, kind: r.kind as ServiceKind,
  weekday: r.weekday, time: r.time, recurrence: r.recurrence as Recurrence,
  selectedDates: parseJson(r.selectedDatesJson, [] as string[]),
  active: r.active,
  effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
  musicRequired: r.musicRequired, protocolRequired: r.protocolRequired,
  maxChoirs: r.maxChoirs, targetTeamSize: r.targetTeamSize, configVersionId: r.configVersionId,
  displayOrder: r.displayOrder, supersedesId: r.supersedesId,
  createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
});

export const toCategoryView = (r: ChoirCategory): ChoirCategoryView => ({
  id: r.id, systemId: r.systemId, code: r.code, name: r.name, description: r.description,
  active: r.active,
  effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
  configVersionId: r.configVersionId,
  supersedesId: r.supersedesId, createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
});

export const toPolicyView = (r: CategoryServicePolicy): CategoryServicePolicyView => ({
  id: r.id, systemId: r.systemId, categoryId: r.categoryId, serviceId: r.serviceId,
  active: r.active,
  eligible: r.eligible, frequencyTarget: r.frequencyTarget,
  frequencyCounting: r.frequencyCounting as FrequencyCounting,
  frequencyKind: r.frequencyKind as FrequencyKind,
  planningMode: r.planningMode as PlanningMode,
  minCount: r.minCount, maxCount: r.maxCount, requireAll: r.requireAll,
  configVersionId: r.configVersionId,
  effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
  supersedesId: r.supersedesId, createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
});

export const toLinkView = (r: ChoirCategoryLink): ChoirCategoryLinkView => ({
  id: r.id, systemId: r.systemId, choirId: r.choirId, categoryId: r.categoryId,
  eligibleOverride: parseJson(r.eligibleOverrideJson, {}),
  frequencyOverride: parseJson(r.frequencyOverrideJson, {}),
  active: r.active,
  effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
  configVersionId: r.configVersionId,
  supersedesId: r.supersedesId, createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
});

export const toProtocolRuleView = (r: ProtocolServiceRule): ProtocolServiceRuleView => ({
  id: r.id, systemId: r.systemId, serviceId: r.serviceId, active: r.active,
  required: r.required,
  defaultTeamSize: r.defaultTeamSize,
  teamSizeOverrides: parseJson(r.teamSizeOverridesJson, {} as Record<string, number>),
  requireChoir: r.requireChoir, requireWorship: r.requireWorship,
  relaxableKinds: parseJson(r.relaxableKindsJson, [] as string[]),
  configVersionId: r.configVersionId,
  effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
  supersedesId: r.supersedesId, createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
});

export const toDutyPolicyView = (r: ProtocolDutyPolicy): ProtocolDutyPolicyView => ({
  id: r.id, systemId: r.systemId,
  preferTarget: r.preferTarget, softMax: r.softMax, hardMax: r.hardMax,
  extraDutyPolicy: r.extraDutyPolicy as 'ALLOW_WHEN_SHORT' | 'NEVER' | 'ALWAYS',
  duplicateSameDayAllowed: r.duplicateSameDayAllowed,
  musicCompatibilityRequired: r.musicCompatibilityRequired,
  leadershipPriorities: parseJson(r.leadershipPrioritiesJson, [] as string[]),
  exceptionsAllowed: r.exceptionsAllowed,
  configVersionId: r.configVersionId,
  effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
  supersedesId: r.supersedesId, createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
});

export const toConfigVersionView = (r: ConfigVersion): ConfigVersionView => ({
  id: r.id, systemId: r.systemId, version: r.version, label: r.label, status: r.status as ConfigStatus,
  effectiveFrom: r.effectiveFrom.toISOString(), effectiveTo: r.effectiveTo?.toISOString() ?? null,
  createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
  reason: r.reason, previousVersionId: r.previousVersionId,
  notes: parseJson(r.notesJson, {}), validation: parseJson(r.validationJson, {}),
  affectedSchedules: parseJson(r.affectedSchedulesJson, [] as string[]),
});

/** Parse a JSON column safely, returning the default on failure. */
export function parseJson<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

/** Stringify a value for a JSON column. */
export function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}
