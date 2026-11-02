import { describe, expect, it } from 'vitest';
import {
  EligibleOverrideSchema,
  FrequencyOverrideSchema,
  FrequencyPeriodSchema,
  isMusicChoirEligible,
  validateMusicConfigSnapshot,
  validatePolicyValues,
  type MusicConfigRulesSnapshot,
} from '../src/scheduling/musicConfigRules';

const baseSnapshot = (): MusicConfigRulesSnapshot => ({
  services: [{ id: 'service-v1', code: 'ss1', active: true, musicRequired: true, maxChoirs: 3 }],
  categories: [{ id: 'category-v1', active: true }],
  policies: [{
    id: 'policy-v1', categoryId: 'category-v1', serviceId: 'service-v1', active: true, eligible: true,
    frequencyTarget: null, frequencyCounting: 'ASSIGNMENTS', frequencyKind: 'TARGET', frequencyPeriod: null,
    planningMode: 'ROTATION', minCount: null, maxCount: null, requireAll: false,
  }],
  links: [{ choirId: 'choir-1', categoryId: 'category-v1', active: true, eligibleOverride: {}, frequencyOverride: {} }],
  choirs: [{ id: 'choir-1', active: true }],
  fixedAssignments: [],
});

describe('Music scheduling rule contracts', () => {
  it('rejects a choir linked to more than one category in a version', () => {
    const snapshot = baseSnapshot();
    snapshot.categories.push({ id: 'category-v2', active: true });
    snapshot.links.push({ choirId: 'choir-1', categoryId: 'category-v2', active: true, eligibleOverride: {}, frequencyOverride: {} });
    expect(validateMusicConfigSnapshot(snapshot).errors).toContain('Each choir can belong to only one category in a configuration version.');
  });

  it('rejects inverted category limits and frequency targets without an explicit period', () => {
    expect(validatePolicyValues({
      eligible: true, frequencyTarget: null, frequencyCounting: 'ASSIGNMENTS', frequencyKind: 'TARGET',
      frequencyPeriod: null, planningMode: 'ROTATION', minCount: 2, maxCount: 1, requireAll: false,
    })).toContain('The minimum choir count cannot be greater than the maximum.');
    expect(validatePolicyValues({
      eligible: true, frequencyTarget: 2, frequencyCounting: 'ASSIGNMENTS', frequencyKind: 'MINIMUM',
      frequencyPeriod: null, planningMode: 'ROTATION', minCount: null, maxCount: null, requireAll: false,
    })).toContain('Choose whether the frequency target applies per month, quarter, half-year, or year.');
  });

  it('rejects requireAll when linked active membership exceeds the category maximum', () => {
    const snapshot = baseSnapshot();
    snapshot.policies[0]!.requireAll = true;
    snapshot.policies[0]!.maxCount = 1;
    snapshot.links.push({ choirId: 'choir-2', categoryId: 'category-v1', active: true, eligibleOverride: {}, frequencyOverride: {} });
    snapshot.choirs.push({ id: 'choir-2', active: true });
    expect(validateMusicConfigSnapshot(snapshot).errors).toContain('The “include every eligible choir” rule for ss1 exceeds that category\'s maximum.');
  });

  it('rejects combined category requirements that exceed service capacity', () => {
    const snapshot = baseSnapshot();
    snapshot.services[0]!.maxChoirs = 1;
    snapshot.policies[0]!.minCount = 1;
    snapshot.categories.push({ id: 'category-v2', active: true });
    snapshot.policies.push({
      ...snapshot.policies[0]!, id: 'policy-v2', categoryId: 'category-v2', minCount: 1,
    });
    snapshot.links.push({ choirId: 'choir-2', categoryId: 'category-v2', active: true, eligibleOverride: {}, frequencyOverride: {} });
    snapshot.choirs.push({ id: 'choir-2', active: true });
    expect(validateMusicConfigSnapshot(snapshot).errors).toContain('The required choir count for ss1 exceeds its service capacity of 1.');
  });

  it('requires explicit fixed designations and checks their linked category', () => {
    const snapshot = baseSnapshot();
    snapshot.policies[0]!.planningMode = 'FIXED';
    expect(validateMusicConfigSnapshot(snapshot).errors).toContain('Choose at least one choir for the fixed arrangement for service ss1.');
    snapshot.fixedAssignments.push({ categoryServicePolicyId: 'policy-v1', choirId: 'choir-1' });
    expect(validateMusicConfigSnapshot(snapshot).ok).toBe(true);
    snapshot.fixedAssignments[0]!.choirId = 'unlinked-choir';
    expect(validateMusicConfigSnapshot(snapshot).errors).toContain('A fixed arrangement for ss1 must use a choir linked to its category.');
  });

  it('keeps membership and global active status ahead of eligibility overrides', () => {
    const linkedOverride = { categoryId: 'category-v1', active: true, eligibleOverride: { ss1: true } };
    expect(isMusicChoirEligible({
      choirActive: false, categoryId: 'category-v1', serviceCode: 'ss1',
      policy: { eligible: false }, link: linkedOverride,
    })).toBe(false);
    expect(isMusicChoirEligible({
      choirActive: true, categoryId: 'category-v2', serviceCode: 'ss1',
      policy: { eligible: true }, link: linkedOverride,
    })).toBe(false);
    expect(isMusicChoirEligible({
      choirActive: true, categoryId: 'category-v1', serviceCode: 'ss1',
      policy: { eligible: false }, link: linkedOverride,
    })).toBe(true);
  });

  it('accepts typed, service-scoped overrides and rejects invalid values or periods', () => {
    expect(EligibleOverrideSchema.safeParse({ ss1: false }).success).toBe(true);
    expect(EligibleOverrideSchema.safeParse({ ss1: 'yes' }).success).toBe(false);
    expect(FrequencyOverrideSchema.safeParse({
      ss1: { frequencyTarget: 2, frequencyKind: 'MINIMUM', frequencyPeriod: 'QUARTER' },
    }).success).toBe(true);
    expect(FrequencyOverrideSchema.safeParse({ ss1: { frequencyKind: 'UNBOUNDED' } }).success).toBe(false);
    expect(FrequencyPeriodSchema.safeParse('WEEK').success).toBe(false);
  });
});
