/**
 * Configurable Music & Protocol scheduling.
 *
 * Tenant-scoped LIVE configuration. Rows are edited in place; the next
 * generate call reads them. There are no versions, drafts or effective ranges.
 * Confirmed/published schedules are frozen copies and are never rebuilt.
 */

import type { SchedulingService, ChoirCategory, CategoryServicePolicy, ChoirCategoryLink, ProtocolServiceRule, ProtocolDutyPolicy } from '@prisma/client';

export type { SchedulingService, ChoirCategory, CategoryServicePolicy, ChoirCategoryLink, ProtocolServiceRule, ProtocolDutyPolicy };

export const SYSTEM_MUSIC = 'sys-music';
export const SYSTEM_PROTOCOL = 'sys-protocol';

export type SystemId = string;

export type ServiceKind = 'SERVICE' | 'REHEARSAL' | 'MEETING' | 'OTHER';

export type FrequencyCounting = 'ASSIGNMENTS' | 'DISTINCT_DATES';
export type FrequencyKind = 'MINIMUM' | 'TARGET' | 'MAXIMUM';
export type FrequencyPeriod = 'MONTH' | 'QUARTER' | 'HALF_YEAR' | 'YEAR';
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
  /** Monthly services: 1–4 = the 1st–4th of the weekday, -1 = the last. Several allowed. */
  monthlyOccurrences: number[];
  active: boolean;
  musicRequired: boolean;
  protocolRequired: boolean;
  maxChoirs: number;
  targetTeamSize: number;
  displayOrder: number;
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
  frequencyPeriod: FrequencyPeriod | null;
  planningMode: PlanningMode;
  minCount: number | null;
  maxCount: number | null;
  requireAll: boolean;
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
  createdByPersonId: string;
  createdAt: string;
}

export interface MusicFixedAssignmentView {
  id: string;
  systemId: string;
  categoryServicePolicyId: string;
  choirId: string;
  serviceDate?: string | null;
  serviceTime?: string | null;
  displayOrder: number;
  createdByPersonId: string;
  createdAt: string;
}

export interface MusicChoirUnavailabilityView {
  id: string;
  systemId: string;
  choirId: string;
  serviceDate: string;
  endDate?: string | null;
  serviceCode: string | null;
  reason: string | null;
  active: boolean;
  recordedByPersonId: string;
  recordedAt: string;
  updatedAt: string;
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
  createdByPersonId: string;
  createdAt: string;
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
  monthlyOccurrences?: number[];
  active?: boolean;
  musicRequired?: boolean;
  protocolRequired?: boolean;
  maxChoirs?: number;
  displayOrder?: number;
  createdByPersonId: string;
}

export interface ChoirCategoryCreateInput {
  systemId: string;
  code: string;
  name: string;
  description?: string;
  active?: boolean;
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
  frequencyPeriod?: FrequencyPeriod | null;
  planningMode?: PlanningMode;
  minCount?: number | null;
  maxCount?: number | null;
  requireAll?: boolean;
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
  createdByPersonId: string;
}

/* ─── Row mappers ─── */

export const toServiceView = (r: SchedulingService): SchedulingServiceView => ({
  id: r.id, systemId: r.systemId, code: r.code, name: r.name, kind: r.kind as ServiceKind,
  weekday: r.weekday, time: r.time, recurrence: r.recurrence as Recurrence,
  selectedDates: parseJson(r.selectedDatesJson, [] as string[]),
  monthlyOccurrences: parseJson(r.monthlyOccurrencesJson, [] as number[]),
  active: r.active,
  musicRequired: r.musicRequired, protocolRequired: r.protocolRequired,
  maxChoirs: r.maxChoirs, targetTeamSize: r.targetTeamSize,
  displayOrder: r.displayOrder,
  createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
});

export const toCategoryView = (r: ChoirCategory): ChoirCategoryView => ({
  id: r.id, systemId: r.systemId, code: r.code, name: r.name, description: r.description,
  active: r.active,
  createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
});

export const toPolicyView = (r: CategoryServicePolicy): CategoryServicePolicyView => ({
  id: r.id, systemId: r.systemId, categoryId: r.categoryId, serviceId: r.serviceId,
  active: r.active,
  eligible: r.eligible, frequencyTarget: r.frequencyTarget,
  frequencyCounting: r.frequencyCounting as FrequencyCounting,
  frequencyKind: r.frequencyKind as FrequencyKind,
  frequencyPeriod: r.frequencyPeriod as FrequencyPeriod | null,
  planningMode: r.planningMode as PlanningMode,
  minCount: r.minCount, maxCount: r.maxCount, requireAll: r.requireAll,
  createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
});

export const toLinkView = (r: ChoirCategoryLink): ChoirCategoryLinkView => ({
  id: r.id, systemId: r.systemId, choirId: r.choirId, categoryId: r.categoryId,
  eligibleOverride: parseJson(r.eligibleOverrideJson, {}),
  frequencyOverride: parseJson(r.frequencyOverrideJson, {}),
  active: r.active,
  createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
});

export const toProtocolRuleView = (r: ProtocolServiceRule): ProtocolServiceRuleView => ({
  id: r.id, systemId: r.systemId, serviceId: r.serviceId, active: r.active,
  required: r.required,
  defaultTeamSize: r.defaultTeamSize,
  teamSizeOverrides: parseJson(r.teamSizeOverridesJson, {} as Record<string, number>),
  requireChoir: r.requireChoir, requireWorship: r.requireWorship,
  relaxableKinds: parseJson(r.relaxableKindsJson, [] as string[]),
  createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
});

export const toDutyPolicyView = (r: ProtocolDutyPolicy): ProtocolDutyPolicyView => ({
  id: r.id, systemId: r.systemId,
  preferTarget: r.preferTarget, softMax: r.softMax, hardMax: r.hardMax,
  extraDutyPolicy: r.extraDutyPolicy as 'ALLOW_WHEN_SHORT' | 'NEVER' | 'ALWAYS',
  duplicateSameDayAllowed: r.duplicateSameDayAllowed,
  musicCompatibilityRequired: r.musicCompatibilityRequired,
  leadershipPriorities: parseJson(r.leadershipPrioritiesJson, [] as string[]),
  exceptionsAllowed: r.exceptionsAllowed,
  createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
});

/** Parse a JSON column safely, returning the default on failure. */
export function parseJson<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

/** Stringify a value for a JSON column. */
export function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}
