/**
 * Row mappers for the live scheduling configuration.
 *
 * Writing is NOT done here any more: every config mutation goes through
 * `saveConfigChange` (saveConfigChange.ts) so validation, the edit lock and the
 * audit entry can never be skipped. Reading goes through `configLoader.ts`.
 * The old version CRUD (create/clone/activate/archive/supersede) is gone with ConfigVersion.
 */

import type {
  SchedulingServiceView, ChoirCategoryView, CategoryServicePolicyView, ChoirCategoryLinkView,
  ProtocolServiceRuleView, ProtocolDutyPolicyView,
  ServiceKind, FrequencyCounting, FrequencyKind, FrequencyPeriod, PlanningMode, Recurrence,
} from './types.js';
import { parseJson } from './types.js';

export function toServiceView(r: any): SchedulingServiceView {
  return {
    id: r.id, systemId: r.systemId, code: r.code, name: r.name, kind: r.kind as ServiceKind,
    weekday: r.weekday, time: r.time, recurrence: r.recurrence as Recurrence,
    selectedDates: parseJson(r.selectedDatesJson, []),
    active: r.active,
    musicRequired: r.musicRequired, protocolRequired: r.protocolRequired,
    maxChoirs: r.maxChoirs, targetTeamSize: r.targetTeamSize ?? 10,
    displayOrder: r.displayOrder,
    createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
  };
}

export function toCategoryView(r: any): ChoirCategoryView {
  return {
    id: r.id, systemId: r.systemId, code: r.code, name: r.name, description: r.description,
    active: r.active,
    createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
  };
}

export function toPolicyView(r: any): CategoryServicePolicyView {
  return {
    id: r.id, systemId: r.systemId, categoryId: r.categoryId, serviceId: r.serviceId,
    active: r.active ?? true,
    eligible: r.eligible, frequencyTarget: r.frequencyTarget,
    frequencyCounting: r.frequencyCounting as FrequencyCounting,
    frequencyKind: r.frequencyKind as FrequencyKind,
    frequencyPeriod: r.frequencyPeriod as FrequencyPeriod | null,
    planningMode: r.planningMode as PlanningMode,
    minCount: r.minCount, maxCount: r.maxCount, requireAll: r.requireAll,
    createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
  };
}

export function toLinkView(r: any): ChoirCategoryLinkView {
  return {
    id: r.id, systemId: r.systemId, choirId: r.choirId, categoryId: r.categoryId,
    eligibleOverride: parseJson(r.eligibleOverrideJson, {}),
    frequencyOverride: parseJson(r.frequencyOverrideJson, {}),
    active: r.active,
    createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
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
    createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
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
    createdByPersonId: r.createdByPersonId, createdAt: r.createdAt.toISOString(),
  };
}
