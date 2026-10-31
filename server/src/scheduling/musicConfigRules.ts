import { z } from 'zod';
import type { CategoryServicePolicyView, ChoirCategoryLinkView, FrequencyPeriod, SchedulingServiceView } from './types.js';

export const FREQUENCY_PERIODS = ['MONTH', 'QUARTER', 'HALF_YEAR', 'YEAR'] as const;
export const FrequencyPeriodSchema = z.enum(FREQUENCY_PERIODS);

const serviceCodeKey = z.string().min(1).max(40).regex(/^[a-zA-Z0-9_-]+$/);
const frequencyOverrideValue = z.object({
  frequencyTarget: z.number().int().positive().optional(),
  frequencyCounting: z.enum(['ASSIGNMENTS', 'DISTINCT_DATES']).optional(),
  frequencyKind: z.enum(['MINIMUM', 'TARGET', 'MAXIMUM']).optional(),
  frequencyPeriod: FrequencyPeriodSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Choose at least one frequency setting');

export const EligibleOverrideSchema = z.record(serviceCodeKey, z.boolean()).default({});
export const FrequencyOverrideSchema = z.record(serviceCodeKey, frequencyOverrideValue).default({});

export interface MusicPolicyRules {
  id: string;
  categoryId: string;
  serviceId: string;
  active: boolean;
  eligible: boolean;
  frequencyTarget: number | null;
  frequencyCounting: string;
  frequencyKind: string;
  frequencyPeriod: string | null;
  planningMode: string;
  minCount: number | null;
  maxCount: number | null;
  requireAll: boolean;
}

export interface MusicLinkRules {
  choirId: string;
  categoryId: string;
  active: boolean;
  eligibleOverride: Record<string, unknown>;
  frequencyOverride: Record<string, unknown>;
}

export interface MusicConfigRulesSnapshot {
  services: Array<Pick<SchedulingServiceView, 'id' | 'code' | 'name' | 'active' | 'musicRequired' | 'maxChoirs'>>;
  categories: Array<{ id: string; active: boolean }>;
  policies: MusicPolicyRules[];
  links: MusicLinkRules[];
  choirs: Array<{ id: string; active: boolean }>;
  fixedAssignments: Array<{ categoryServicePolicyId: string; choirId: string }>;
}

export interface MusicConfigValidation {
  ok: boolean;
  errors: string[];
}

function scopedValue<T>(values: Record<string, T>, serviceCode: string): T | undefined {
  const key = Object.keys(values).find((candidate) => candidate.toLowerCase() === serviceCode.toLowerCase());
  return key === undefined ? undefined : values[key];
}

export function validatePolicyValues(policy: Pick<MusicPolicyRules,
  'frequencyTarget' | 'frequencyCounting' | 'frequencyKind' | 'frequencyPeriod' |
  'planningMode' | 'minCount' | 'maxCount' | 'requireAll' | 'eligible'>): string[] {
  const errors: string[] = [];
  if (policy.minCount !== null && (!Number.isInteger(policy.minCount) || policy.minCount < 0)) {
    errors.push('The minimum choir count must be zero or greater.');
  }
  if (policy.maxCount !== null && (!Number.isInteger(policy.maxCount) || policy.maxCount < 0)) {
    errors.push('The maximum choir count must be zero or greater.');
  }
  if (policy.minCount !== null && policy.maxCount !== null && policy.minCount > policy.maxCount) {
    errors.push('The minimum choir count cannot be greater than the maximum.');
  }
  if (policy.frequencyTarget !== null && (!Number.isInteger(policy.frequencyTarget) || policy.frequencyTarget <= 0)) {
    errors.push('A frequency target must be a positive whole number.');
  }
  if (policy.frequencyTarget !== null && !FREQUENCY_PERIODS.includes(policy.frequencyPeriod as FrequencyPeriod)) {
    errors.push('Choose whether the frequency target applies per month, quarter, half-year, or year.');
  }
  if (policy.frequencyTarget === null && policy.frequencyPeriod !== null) {
    errors.push('Choose a frequency target before setting its period.');
  }
  if (!['ASSIGNMENTS', 'DISTINCT_DATES'].includes(policy.frequencyCounting)) {
    errors.push('Choose a supported frequency counting method.');
  }
  if (!['MINIMUM', 'TARGET', 'MAXIMUM'].includes(policy.frequencyKind)) {
    errors.push('Choose a supported frequency rule.');
  }
  if (!['ROTATION', 'FIXED', 'MANUAL'].includes(policy.planningMode)) {
    errors.push('Choose a supported planning mode.');
  }
  return errors;
}

export function isMusicChoirEligible(input: {
  choirActive: boolean;
  categoryId: string;
  serviceCode: string;
  policy: Pick<MusicPolicyRules, 'eligible'> | null;
  link: Pick<MusicLinkRules, 'categoryId' | 'active' | 'eligibleOverride'> | null;
}): boolean {
  if (!input.choirActive || !input.link?.active || input.link.categoryId !== input.categoryId) return false;
  const override = scopedValue(input.link.eligibleOverride, input.serviceCode);
  if (typeof override === 'boolean') return override;
  return input.policy?.eligible ?? true;
}

export function validateMusicConfigSnapshot(snapshot: MusicConfigRulesSnapshot): MusicConfigValidation {
  const errors: string[] = [];
  const serviceById = new Map(snapshot.services.map((service) => [service.id, service]));
  const serviceByCode = new Map(snapshot.services.map((service) => [service.code.toLowerCase(), service]));
  const categoryById = new Map(snapshot.categories.map((category) => [category.id, category]));
  const choirById = new Map(snapshot.choirs.map((choir) => [choir.id, choir]));
  const activeLinks = snapshot.links.filter((link) => link.active);
  const linksByChoir = new Map<string, MusicLinkRules[]>();

  for (const link of activeLinks) {
    const choirLinks = linksByChoir.get(link.choirId) ?? [];
    choirLinks.push(link);
    linksByChoir.set(link.choirId, choirLinks);
    if (!categoryById.has(link.categoryId)) errors.push('A choir link refers to a category outside this configuration version.');
    if (!choirById.has(link.choirId)) errors.push('A choir link refers to a choir that no longer exists.');
    const eligibleOverrides = EligibleOverrideSchema.safeParse(link.eligibleOverride);
    const frequencyOverrides = FrequencyOverrideSchema.safeParse(link.frequencyOverride);
    if (!eligibleOverrides.success || !frequencyOverrides.success) {
      errors.push('A choir has an invalid eligibility or frequency exception. Review its settings before activation.');
      continue;
    }
    const serviceCodes = [...Object.keys(eligibleOverrides.data), ...Object.keys(frequencyOverrides.data)];
    for (const code of serviceCodes) {
      const service = serviceByCode.get(code.toLowerCase());
      const policy = service && snapshot.policies.find((row) =>
        row.active && row.categoryId === link.categoryId && row.serviceId === service.id);
      if (!service || !policy) {
        errors.push(`A choir exception refers to ${code}, which has no active rule for its linked category.`);
        continue;
      }
      const override = frequencyOverrides.data[code];
      if (override) {
        const target = override.frequencyTarget ?? policy.frequencyTarget;
        const period = override.frequencyPeriod ?? policy.frequencyPeriod;
        if (target === null || target === undefined || !period) {
          errors.push(`The frequency exception for ${service.name} needs a positive target and a defined period.`);
          continue;
        }
        errors.push(...validatePolicyValues({
          eligible: policy.eligible,
          frequencyTarget: target,
          frequencyCounting: override.frequencyCounting ?? policy.frequencyCounting,
          frequencyKind: override.frequencyKind ?? policy.frequencyKind,
          frequencyPeriod: period,
          planningMode: policy.planningMode,
          minCount: policy.minCount,
          maxCount: policy.maxCount,
          requireAll: policy.requireAll,
        }));
      }
    }
  }
  for (const choirLinks of linksByChoir.values()) {
    if (choirLinks.length > 1) errors.push('Each choir can belong to only one category in a configuration version.');
  }

  const fixedByPolicy = new Map<string, Array<{ choirId: string }>>();
  for (const assignment of snapshot.fixedAssignments) {
    const rows = fixedByPolicy.get(assignment.categoryServicePolicyId) ?? [];
    rows.push(assignment);
    fixedByPolicy.set(assignment.categoryServicePolicyId, rows);
  }

  const requirementsByService = new Map<string, number>();
  const fixedChoirsByService = new Map<string, Set<string>>();
  for (const policy of snapshot.policies.filter((row) => row.active)) {
    const service = serviceById.get(policy.serviceId);
    if (!service) {
      errors.push('A category rule refers to a service outside this configuration version.');
      continue;
    }
    if (!categoryById.has(policy.categoryId)) {
      errors.push('A category rule refers to a category outside this configuration version.');
      continue;
    }
    if (!categoryById.get(policy.categoryId)?.active) {
      errors.push('An active service rule must use an active choir category.');
    }
    errors.push(...validatePolicyValues(policy));
    if (!service.active || !service.musicRequired) continue;

    const eligibleMembers = activeLinks.filter((link) => {
      if (link.categoryId !== policy.categoryId || !choirById.get(link.choirId)?.active || !categoryById.get(policy.categoryId)?.active) return false;
      const override = scopedValue(link.eligibleOverride, service.code);
      return typeof override === 'boolean' ? override : policy.eligible;
    });
    const fixed = fixedByPolicy.get(policy.id) ?? [];
    if (policy.planningMode === 'FIXED' && fixed.length === 0) {
      errors.push(`Choose at least one choir for the fixed arrangement for service ${service.code}.`);
    }
    if (policy.planningMode === 'FIXED' && policy.minCount !== null && fixed.length < policy.minCount) {
      errors.push(`The fixed arrangement for ${service.code} needs at least ${policy.minCount} designated choirs.`);
    }
    if (policy.planningMode === 'FIXED' && policy.requireAll &&
      eligibleMembers.some((member) => !fixed.some((row) => row.choirId === member.choirId))) {
      errors.push(`The fixed arrangement for ${service.code} must include every eligible linked choir.`);
    }

    for (const designation of fixed) {
      const link = eligibleMembers.find((member) => member.choirId === designation.choirId);
      if (!link) errors.push(`A fixed arrangement for ${service.code} must use an active choir linked to its category.`);
      const used = fixedChoirsByService.get(service.id) ?? new Set<string>();
      if (used.has(designation.choirId)) {
        errors.push(`A choir cannot fill two categories on service ${service.code}.`);
      }
      used.add(designation.choirId);
      fixedChoirsByService.set(service.id, used);
    }

    const requireAllCount = policy.requireAll ? eligibleMembers.length : 0;
    if ((policy.minCount ?? 0) > eligibleMembers.length) {
      errors.push(`The minimum for ${service.code} is greater than the number of eligible linked choirs.`);
    }
    if (policy.maxCount !== null && requireAllCount > policy.maxCount) {
      errors.push(`The “include every eligible choir” rule for ${service.code} exceeds that category's maximum.`);
    }
    const minimumRequired = Math.max(policy.minCount ?? 0, requireAllCount, fixed.length);
    if (!policy.eligible && minimumRequired > 0) {
      errors.push(`Service ${service.code} requires choirs from a category that is marked ineligible.`);
    }
    if (policy.maxCount !== null && minimumRequired > policy.maxCount) {
      errors.push(`The required choirs for ${service.code} exceed that category's maximum.`);
    }
    requirementsByService.set(service.id, (requirementsByService.get(service.id) ?? 0) + minimumRequired);
  }

  for (const service of snapshot.services.filter((row) => row.active && row.musicRequired)) {
    const required = requirementsByService.get(service.id) ?? 0;
    if (required > service.maxChoirs) {
      errors.push(`The required choir count for ${service.code} exceeds its service capacity of ${service.maxChoirs}.`);
    }
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function frequencyBucket(monthKey: string, period: FrequencyPeriod): string {
  const [yearText, monthText] = monthKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid scheduling month: ${monthKey}`);
  }
  if (period === 'MONTH') return monthKey;
  if (period === 'QUARTER') return `${year}-Q${Math.ceil(month / 3)}`;
  if (period === 'HALF_YEAR') return `${year}-H${month <= 6 ? 1 : 2}`;
  return String(year);
}

export function monthsInFrequencyBucket(bucket: string, period: FrequencyPeriod): string[] {
  if (period === 'MONTH') return [bucket];
  const [yearText, part] = bucket.split('-');
  const year = Number(yearText);
  const start = period === 'QUARTER'
    ? (Number(part.slice(1)) - 1) * 3 + 1
    : period === 'HALF_YEAR'
      ? (Number(part.slice(1)) - 1) * 6 + 1
      : 1;
  const count = period === 'QUARTER' ? 3 : period === 'HALF_YEAR' ? 6 : 12;
  return Array.from({ length: count }, (_, index) => {
    const month = String(start + index).padStart(2, '0');
    return `${year}-${month}`;
  });
}
