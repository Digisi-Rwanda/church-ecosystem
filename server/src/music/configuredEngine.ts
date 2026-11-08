import type {
  CategoryServicePolicyView,
  ChoirCategoryLinkView,
  ChoirCategoryView,
  FrequencyPeriod,
  MusicChoirUnavailabilityView,
  MusicFixedAssignmentView,
  SchedulingServiceView,
} from '../scheduling/types.js';
import {
  EligibleOverrideSchema,
  FrequencyOverrideSchema,
  frequencyBucket,
  monthsInFrequencyBucket,
} from '../scheduling/musicConfigRules.js';
import type { MusicAssignment, MusicScheduleUnit, MusicServiceSlot } from './types.js';

type HistoricalSchedule = {
  services: MusicServiceSlot[];
  assignments: MusicAssignment[];
};

import { defaultMusicLineupLimits, type MusicLineupLimits } from '../scheduling/musicLineupLimits.js';

type PolicyOverride = {
  target: number;
  period: FrequencyPeriod;
  counting: 'ASSIGNMENTS' | 'DISTINCT_DATES';
  kind: 'MINIMUM' | 'TARGET' | 'MAXIMUM';
};

export type ConfiguredMusicRules = {
  lineupLimits?: MusicLineupLimits;
  services: SchedulingServiceView[];
  categories: ChoirCategoryView[];
  policies: CategoryServicePolicyView[];
  links: ChoirCategoryLinkView[];
  fixedAssignments: MusicFixedAssignmentView[];
  unavailability: MusicChoirUnavailabilityView[];
};

export type ConfiguredMusicResult = {
  ok: boolean;
  assignments: MusicAssignment[];
  warnings: string[];
  reason?: string;
};

const serviceCode = (slot: MusicServiceSlot) => slot.kind.toLowerCase();

/** Shared by generation and validation. Each occurrence can break a run, even if it has no choir. */
function lineupLimits(services: MusicServiceSlot[], rules: ConfiguredMusicRules, history: HistoricalSchedule[], current: MusicAssignment[] = []) {
  const { primaryPerDay, consecutivePerService } = rules.lineupLimits ?? defaultMusicLineupLimits;
  const calendar = new Map(history.flatMap((month) => month.services).map((service) => [service.id, service]));
  for (const service of services) calendar.set(service.id, service);
  const byDate = new Map<string, MusicServiceSlot[]>();
  const byCode = new Map<string, MusicServiceSlot[]>();
  const position = new Map<string, number>();
  const assigned = new Map<string, Set<string>>();
  const primaryIds = new Set(rules.categories.filter((category) => category.active && category.code.toUpperCase() === 'PRIMARY').map((category) => category.id));
  const primaryChoirs = new Set(rules.links.filter((link) => link.active && primaryIds.has(link.categoryId)).map((link) => link.choirId));
  for (const service of [...calendar.values()].sort((a, b) =>
    a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.id.localeCompare(b.id))) {
    if (service.musicRequired === false) continue;
    const dateSlots = byDate.get(service.date) ?? [];
    dateSlots.push(service);
    byDate.set(service.date, dateSlots);
    const code = serviceCode(service);
    const codeSlots = byCode.get(code) ?? [];
    position.set(service.id, codeSlots.length);
    codeSlots.push(service);
    byCode.set(code, codeSlots);
  }
  const record = (assignment: MusicAssignment) => {
    const lineup = assigned.get(assignment.serviceId) ?? new Set<string>();
    lineup.add(assignment.unitId);
    assigned.set(assignment.serviceId, lineup);
  };
  for (const month of history) for (const assignment of month.assignments) record(assignment);
  for (const assignment of current) record(assignment);
  const conflict = (unit: MusicScheduleUnit, service: MusicServiceSlot): string | undefined => {
    const booked = (slot: MusicServiceSlot | undefined) => !!slot && assigned.get(slot.id)?.has(unit.id) === true;
    if (primaryPerDay !== null && primaryChoirs.has(unit.id)) {
      const sameDay = byDate.get(service.date)?.filter((other) => other.id !== service.id && booked(other)).length ?? 0;
      if (sameDay >= primaryPerDay) {
        const limit = primaryPerDay === 1 ? 'only once' : `at most ${primaryPerDay} times`;
        return `${unit.name} is already scheduled on ${service.date}. A primary choir may serve ${limit} per day.`;
      }
    }
    const index = position.get(service.id);
    const slots = byCode.get(serviceCode(service));
    if (consecutivePerService === null || index === undefined || !slots) return;
    let consecutive = 1;
    for (let i = index - 1; consecutive <= consecutivePerService && booked(slots[i]); i--) consecutive++;
    for (let i = index + 1; consecutive <= consecutivePerService && booked(slots[i]); i++) consecutive++;
    if (consecutive > consecutivePerService) {
      const limit = consecutivePerService === 2 ? 'twice' : `${consecutivePerService} time(s)`;
      return `${unit.name} may serve at most ${limit} in a row on ${service.kind} (${service.date}).`;
    }
  };
  return { record, conflict };
}
const tieHash = (seed: number, serviceId: string, unitId: string) => {
  let value = seed >>> 0;
  for (const char of `${serviceId}|${unitId}`) {
    value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  return value;
};

function policyOverride(
  policy: CategoryServicePolicyView,
  link: ChoirCategoryLinkView,
  code: string,
): PolicyOverride | null {
  const parsed = FrequencyOverrideSchema.safeParse(link.frequencyOverride);
  if (!parsed.success) return null;
  const key = Object.keys(parsed.data).find((candidate) => candidate.toLowerCase() === code.toLowerCase());
  const override = key ? parsed.data[key] : undefined;
  if (!override) {
    if (policy.frequencyTarget === null || !policy.frequencyPeriod) return null;
    return {
      target: policy.frequencyTarget,
      period: policy.frequencyPeriod,
      counting: policy.frequencyCounting,
      kind: policy.frequencyKind,
    };
  }
  const target = override.frequencyTarget ?? policy.frequencyTarget;
  const period = override.frequencyPeriod ?? policy.frequencyPeriod;
  if (target === null || target === undefined || !period) return null;
  return {
    target,
    period,
    counting: override.frequencyCounting ?? policy.frequencyCounting,
    kind: override.frequencyKind ?? policy.frequencyKind,
  };
}

function countFor(
  unitId: string,
  code: string,
  period: FrequencyPeriod,
  periodKey: string,
  currentServices: MusicServiceSlot[],
  currentAssignments: MusicAssignment[],
  history: HistoricalSchedule[],
): { assignments: number; dates: Set<string> } {
  const slots = new Map<string, MusicServiceSlot>();
  const assignments: MusicAssignment[] = [];
  for (const month of history) {
    for (const service of month.services) slots.set(service.id, service);
    assignments.push(...month.assignments);
  }
  for (const service of currentServices) slots.set(service.id, service);
  assignments.push(...currentAssignments);

  const dates = new Set<string>();
  let total = 0;
  for (const assignment of assignments) {
    if (assignment.unitId !== unitId) continue;
    const service = slots.get(assignment.serviceId);
    if (!service || serviceCode(service) !== code.toLowerCase()) continue;
    if (frequencyBucket(service.periodKey, period) !== frequencyBucket(periodKey, period)) continue;
    total++;
    dates.add(service.date);
  }
  return { assignments: total, dates };
}

function frequencyCount(
  totals: { assignments: number; dates: Set<string> },
  counting: 'ASSIGNMENTS' | 'DISTINCT_DATES',
) {
  return counting === 'DISTINCT_DATES' ? totals.dates.size : totals.assignments;
}

function isUnavailable(
  choirId: string,
  service: MusicServiceSlot,
  rows: MusicChoirUnavailabilityView[],
): boolean {
  return rows.some((row) =>
    row.active &&
    row.choirId === choirId &&
    row.serviceDate <= service.date && (row.endDate ?? row.serviceDate) >= service.date &&
    (!row.serviceCode || row.serviceCode.toLowerCase() === serviceCode(service)),
  );
}

function fixedFor(rules: ConfiguredMusicRules, policyId: string, service: MusicServiceSlot) {
  const seen = new Set<string>();
  return rules.fixedAssignments.filter(row => row.categoryServicePolicyId === policyId
    && (!row.serviceDate || row.serviceDate === service.date)
    && (!row.serviceTime || row.serviceTime === service.time))
    .sort((a,b) => a.displayOrder - b.displayOrder || a.choirId.localeCompare(b.choirId))
    .filter(row => {if (seen.has(row.choirId)) return false;seen.add(row.choirId);return true;});
}

const fixedVacancyWarning = (service: MusicServiceSlot, choirId: string, units: readonly MusicScheduleUnit[]) =>
  `${service.label}: fixed slot for ${units.find(unit=>unit.id === choirId)?.name ?? 'the designated choir'} left empty because the choir cannot serve. You may add an eligible replacement.`;

function activeLinksByChoir(links: ChoirCategoryLinkView[]) {
  const result = new Map<string, ChoirCategoryLinkView[]>();
  for (const link of links.filter((item) => item.active)) {
    const rows = result.get(link.choirId) ?? [];
    rows.push(link);
    result.set(link.choirId, rows);
  }
  return result;
}

function slotForCode(rules: ConfiguredMusicRules, slot: MusicServiceSlot) {
  return rules.services.find((service) => service.code.toLowerCase() === serviceCode(slot));
}

function eligibleCandidates(input: {
  service: MusicServiceSlot;
  policy: CategoryServicePolicyView;
  rules: ConfiguredMusicRules;
  units: readonly MusicScheduleUnit[];
  linksByChoir: Map<string, ChoirCategoryLinkView[]>;
}): Array<{ unit: MusicScheduleUnit; link: ChoirCategoryLinkView }> {
  const code = serviceCode(input.service);
  const unitById = new Map(input.units.map((unit) => [unit.id, unit]));
  const candidates: Array<{ unit: MusicScheduleUnit; link: ChoirCategoryLinkView }> = [];
  for (const [choirId, links] of input.linksByChoir) {
    const unit = unitById.get(choirId);
    const link = links.find((item) => item.categoryId === input.policy.categoryId);
    if (!unit || unit.active === false || !link || links.length !== 1) continue;
    const overrides = EligibleOverrideSchema.safeParse(link.eligibleOverride);
    if (!overrides.success) continue;
    const overrideKey = Object.keys(overrides.data).find((key) => key.toLowerCase() === code);
    const eligible = overrideKey === undefined
      ? input.policy.eligible
      : overrides.data[overrideKey];
    if (!eligible || isUnavailable(choirId, input.service, input.rules.unavailability)) continue;
    candidates.push({ unit, link });
  }
  return candidates;
}

function failure(reason: string, warnings: string[] = []): ConfiguredMusicResult {
  return { ok: false, assignments: [], warnings, reason };
}

export function generateConfiguredMusicSchedule(input: {
  services: MusicServiceSlot[];
  units: readonly MusicScheduleUnit[];
  rules: ConfiguredMusicRules;
  history?: HistoricalSchedule[];
  seed?: number;
}): ConfiguredMusicResult {
  const warnings: string[] = [];
  const assignments: MusicAssignment[] = [];
  const seed = input.seed ?? 0;
  const linksByChoir = activeLinksByChoir(input.rules.links);
  const activeUnits = input.units.filter((unit) => unit.active !== false);
  const limits = lineupLimits(input.services, input.rules, input.history ?? []);

  for (const unit of activeUnits) {
    const links = linksByChoir.get(unit.id) ?? [];
    if (links.length !== 1) {
      if (input.rules.fixedAssignments.some(row => row.choirId === unit.id)) continue;
      return failure(`${unit.name} needs exactly one explicit choir-category link in this configuration before generation.`);
    }
  }
  for (const link of input.rules.links.filter((row) => row.active)) {
    if (!FrequencyOverrideSchema.safeParse(link.frequencyOverride).success ||
        !EligibleOverrideSchema.safeParse(link.eligibleOverride).success) {
      return failure(`A choir has an invalid eligibility or frequency exception. Review its settings before generation.`);
    }
  }

  const orderedServices = [...input.services].sort((a, b) =>
    a.date.localeCompare(b.date) || serviceCode(a).localeCompare(serviceCode(b)) ||
    (a.time ?? '').localeCompare(b.time ?? '') || a.id.localeCompare(b.id),
  );
  const processedPolicyKeys = new Set<string>();

  for (const service of orderedServices) {
    const definition = slotForCode(input.rules, service);
    if (!definition) return failure(`No service definition in this configuration matches ${service.kind}.`);
    if (!definition.musicRequired) continue;
    service.maxChoirs = definition.maxChoirs;

    const policies = input.rules.policies.filter((policy) =>
      policy.active && policy.serviceId === definition.id,
    );
    for (const category of input.rules.categories.filter((item) => item.active)) {
      const policy = policies.find((item) => item.categoryId === category.id);
      if (!policy) {
        return failure(`Add an active ${category.name} rule for ${definition.name} before generating this schedule.`);
      }
      const policyKey = `${policy.id}|${frequencyBucket(service.periodKey, policy.frequencyPeriod ?? 'MONTH')}`;
      processedPolicyKeys.add(policyKey);
      const candidates = eligibleCandidates({
        service, policy, rules: input.rules, units: input.units, linksByChoir,
      });
      const requiredAll = policy.requireAll ? candidates : [];
      let chosen: Array<{ unit: MusicScheduleUnit; link: ChoirCategoryLinkView }> = [];
      const scopedFixed = fixedFor(input.rules,policy.id,service);
      const fixedMode = policy.planningMode === 'FIXED' || scopedFixed.length > 0;

      if (!fixedMode && policy.planningMode === 'MANUAL') {
        warnings.push(`${service.label}: enter ${category.name} assignments manually.`);
      } else if (fixedMode) {
        if (!scopedFixed.length) warnings.push(`${service.label}: fixed ${category.name} slot left empty; no choir is designated for this occurrence.`);
        for (const row of scopedFixed) {
          const candidate = candidates.find((item) => item.unit.id === row.choirId);
          const setting = candidate ? policyOverride(policy,candidate.link,definition.code) : null;
          const atMaximum = setting?.kind === 'MAXIMUM' && frequencyCount(countFor(row.choirId,definition.code,setting.period,service.periodKey,input.services,assignments,input.history ?? []),setting.counting) >= setting.target;
          const conflict = candidate && limits.conflict(candidate.unit, service);
          if (!candidate || atMaximum || conflict) {
            warnings.push(fixedVacancyWarning(service, row.choirId, input.units));
            if (conflict) warnings.push(conflict);
            continue;
          }
          chosen.push(candidate);
        }
        if (policy.planningMode === 'ROTATION') {
          const vacancies = scopedFixed.length - chosen.length;
          const needed = policy.requireAll ? candidates.length : Math.max(chosen.length,(policy.minCount ?? 0) - vacancies);
          for (const candidate of candidates) {
            if (chosen.length >= needed) break;
            if (scopedFixed.some(row=>row.choirId === candidate.unit.id) || chosen.some(row=>row.unit.id === candidate.unit.id) || limits.conflict(candidate.unit, service)) continue;
            const setting = policyOverride(policy,candidate.link,definition.code);
            if (setting?.kind === 'MAXIMUM' && frequencyCount(countFor(candidate.unit.id,definition.code,setting.period,service.periodKey,input.services,assignments,input.history ?? []),setting.counting) >= setting.target) continue;
            chosen.push(candidate);
          }
        }
      } else {
        const maxCategory = policy.maxCount ?? Number.POSITIVE_INFINITY;
        const targetCount = Math.max(policy.minCount ?? 0, requiredAll.length);
        if (targetCount > candidates.length) {
          return failure(`${service.label}: ${category.name} requires ${targetCount} choirs, but only ${candidates.length} are eligible and available.`);
        }
        // Serve hard minimums with the fewest remaining opportunities first.
        const minimumSlack = (candidate: typeof candidates[number]) => {
          const setting = policyOverride(policy, candidate.link, definition.code);
          if (setting?.kind !== 'MINIMUM') return Number.POSITIVE_INFINITY;
          const count = frequencyCount(countFor(candidate.unit.id, definition.code, setting.period, service.periodKey, input.services, assignments, input.history ?? []), setting.counting);
          if (count >= setting.target) return Number.POSITIVE_INFINITY;
          const dates = new Set<string>();
          let opportunities = 0;
          for (const future of orderedServices) {
            if (future.date < service.date || serviceCode(future) !== serviceCode(service) ||
                frequencyBucket(future.periodKey, setting.period) !== frequencyBucket(service.periodKey, setting.period)) continue;
            if (!eligibleCandidates({ service: future, policy, rules: input.rules, units: input.units, linksByChoir }).some(row => row.unit.id === candidate.unit.id)) continue;
            if (setting.counting === 'DISTINCT_DATES' && dates.has(future.date)) continue;
            dates.add(future.date);
            opportunities++;
          }
          return opportunities - (setting.target - count);
        };
        const sortedCandidates = [...candidates].sort((a, b) => {
          const slackA = minimumSlack(a), slackB = minimumSlack(b);
          if (slackA !== slackB) return slackA < slackB ? -1 : 1;
          const aPolicy = policyOverride(policy, a.link, definition.code);
          const bPolicy = policyOverride(policy, b.link, definition.code);
          const count = (item: typeof a, setting: PolicyOverride | null) => frequencyCount(
            countFor(item.unit.id, definition.code, setting?.period ?? 'MONTH', service.periodKey, input.services, assignments, input.history ?? []),
            setting?.counting ?? 'ASSIGNMENTS',
          );
          const quotaA = aPolicy?.target ?? policy.frequencyTarget ?? 0;
          const quotaB = bPolicy?.target ?? policy.frequencyTarget ?? 0;
          const deficit = (quota: number, value: number) => Math.max(0, quota - value);
          const deficitDiff = deficit(quotaB, count(b, bPolicy)) - deficit(quotaA, count(a, aPolicy));
          if (deficitDiff) return deficitDiff;
          const assignmentsA = countFor(a.unit.id, definition.code, 'YEAR', service.periodKey, input.services, assignments, input.history ?? []).assignments;
          const assignmentsB = countFor(b.unit.id, definition.code, 'YEAR', service.periodKey, input.services, assignments, input.history ?? []).assignments;
          return assignmentsA - assignmentsB ||
            tieHash(seed, service.id, a.unit.id) - tieHash(seed, service.id, b.unit.id) ||
            a.unit.id.localeCompare(b.unit.id);
        });
        const selected = new Set<string>();
        const take = (candidate: typeof candidates[number]) => {
          if (selected.has(candidate.unit.id) || chosen.length >= maxCategory || limits.conflict(candidate.unit, service)) return false;
          const setting = policyOverride(policy, candidate.link, definition.code);
          if (setting?.kind === 'MAXIMUM') {
            const count = frequencyCount(countFor(candidate.unit.id, definition.code, setting.period, service.periodKey, input.services, assignments, input.history ?? []), setting.counting);
            if (count >= setting.target) return false;
          }
          chosen.push(candidate);
          selected.add(candidate.unit.id);
          return true;
        };
        for (const item of requiredAll) {
          if (!take(item)) return failure(limits.conflict(item.unit, service) ?? `${service.label}: the required ${category.name} choirs exceed the category limit.`);
        }
        for (const candidate of sortedCandidates) {
          if (chosen.length >= targetCount) break;
          take(candidate);
        }
        // Optional targets must leave room for other categories' hard requirements.
        const laterCategories = input.rules.categories.filter(row => row.active).slice(input.rules.categories.filter(row => row.active).findIndex(row => row.id === category.id) + 1);
        const reserved = laterCategories.reduce((total, other) => {
          const rule = policies.find(row => row.categoryId === other.id);
          if (!rule) return total;
          const all = rule.requireAll ? eligibleCandidates({ service, policy: rule, rules: input.rules, units: input.units, linksByChoir }).length : 0;
          const fixed = fixedFor(input.rules,rule.id,service).length;
          return total + Math.max(rule.minCount ?? 0, all, fixed);
        }, 0);
        const remainingCapacity = Math.min(maxCategory, definition.maxChoirs - reserved - assignments.filter((item) => item.serviceId === service.id).length);
        const preferred = sortedCandidates.filter((candidate) => {
          if (selected.has(candidate.unit.id)) return false;
          const setting = policyOverride(policy, candidate.link, definition.code);
          if (!setting || !['TARGET', 'MINIMUM'].includes(setting.kind)) return false;
          const count = frequencyCount(countFor(candidate.unit.id, definition.code, setting.period, service.periodKey, input.services, assignments, input.history ?? []), setting.counting);
          return count < setting.target;
        });
        for (const candidate of preferred) {
          if (chosen.length >= remainingCapacity) break;
          take(candidate);
        }
        if (chosen.length < (policy.minCount ?? 0)) {
          const conflict = candidates.map(({ unit }) => limits.conflict(unit, service)).find(Boolean);
          return failure(`${service.label}: ${category.name} needs at least ${policy.minCount} choirs, but there are not enough available slots or choirs.${conflict ? ` ${conflict}` : ''}`);
        }
      }

      const categoryMax = policy.maxCount ?? Number.POSITIVE_INFINITY;
      if (chosen.length > categoryMax) return failure(`${service.label}: the fixed ${category.name} arrangement exceeds its maximum of ${categoryMax}.`);
      if (!fixedMode && policy.planningMode !== 'MANUAL' && policy.requireAll && requiredAll.some((candidate) => !chosen.some((item) => item.unit.id === candidate.unit.id))) {
        return failure(`${service.label}: every eligible and available ${category.name} choir must be assigned.`);
      }
      for (const candidate of chosen) {
        if (assignments.some((item) => item.serviceId === service.id && item.unitId === candidate.unit.id)) {
          return failure(`${candidate.unit.name} cannot fill two categories on ${service.label}.`);
        }
        if (assignments.filter((item) => item.serviceId === service.id).length >= definition.maxChoirs) {
          return failure(`${service.label} exceeds its configured capacity of ${definition.maxChoirs} choirs.`);
        }
        const assignment: MusicAssignment = {
          id: `masg-${service.id}-${candidate.unit.id}`,
          serviceId: service.id,
          unitId: candidate.unit.id,
          source: 'ENGINE',
        };
        assignments.push(assignment);
        limits.record(assignment);
      }
    }
  }

  const validation = validateConfiguredMusicSchedule({
    services: input.services,
    assignments,
    units: input.units,
    rules: input.rules,
    history: input.history ?? [],
    allowManualIncomplete: true,
  });
  if (!validation.ok) return failure(validation.reason ?? 'The generated schedule violates Music configuration.', validation.warnings);
  return { ok: true, assignments, warnings: [...new Set([...warnings, ...validation.warnings])] };
}

export function validateConfiguredMusicSchedule(input: {
  services: MusicServiceSlot[];
  assignments: MusicAssignment[];
  units: readonly MusicScheduleUnit[];
  rules: ConfiguredMusicRules;
  history?: HistoricalSchedule[];
  allowManualIncomplete?: boolean;
  /** Edits check the newly added choir so older lineups can be repaired one change at a time. */
  lineupChange?: { serviceId: string; unitId?: string; removedUnitId?: string };
}): { ok: boolean; warnings: string[]; reason?: string; vacantFixedServiceIds?: string[] } {
  const warnings: string[] = [];
  const vacantFixedServiceIds = new Set<string>();
  const unitsById = new Map(input.units.map((unit) => [unit.id, unit]));
  const linksByChoir = activeLinksByChoir(input.rules.links);
  const servicesById = new Map(input.services.map((service) => [service.id, service]));
  const assignedByService = new Map<string, Set<string>>();
  const limits = lineupLimits(input.services, input.rules, input.history ?? [], input.assignments);

  for (const assignment of input.assignments) {
    if (input.lineupChange && assignment.serviceId !== input.lineupChange.serviceId) continue;
    const service = servicesById.get(assignment.serviceId);
    const unit = unitsById.get(assignment.unitId);
    if (!service || !unit) return { ok: false, warnings, reason: 'An assignment refers to a service or choir outside this schedule.' };
    if (unit.active === false) return { ok: false, warnings, reason: `${unit.name} is inactive and cannot be scheduled.` };
    const prior = assignedByService.get(service.id) ?? new Set<string>();
    if (prior.has(unit.id)) return { ok: false, warnings, reason: `${unit.name} can be assigned only once to ${service.label}.` };
    prior.add(unit.id);
    assignedByService.set(service.id, prior);
    const definition = slotForCode(input.rules, service);
    if (definition && !definition.musicRequired) return { ok: false, warnings, reason: `${service.label} does not accept Music assignments.` };
    const links = linksByChoir.get(unit.id) ?? [];
    if (!definition || links.length !== 1) return { ok: false, warnings, reason: `${unit.name} needs exactly one explicit category link before this assignment is valid.` };
    const link = links[0]!;
    const policy = input.rules.policies.find((row) => row.active && row.serviceId === definition.id && row.categoryId === link.categoryId);
    const category = input.rules.categories.find((row) => row.id === link.categoryId && row.active);
    if (!policy || !category) return { ok: false, warnings, reason: `${unit.name} has no active category rule for ${definition.name}.` };
    const overrides = EligibleOverrideSchema.safeParse(link.eligibleOverride);
    if (!overrides.success) return { ok: false, warnings, reason: 'A choir eligibility exception is invalid.' };
    const key = Object.keys(overrides.data).find((code) => code.toLowerCase() === definition.code.toLowerCase());
    if (key === undefined ? !policy.eligible : !overrides.data[key]) {
      return { ok: false, warnings, reason: `${unit.name} is not eligible for ${service.label}.` };
    }
    if (isUnavailable(unit.id, service, input.rules.unavailability)) {
      return { ok: false, warnings, reason: `${unit.name} is marked unavailable for ${service.label}.` };
    }
    if (!input.lineupChange || (input.lineupChange.serviceId === service.id && input.lineupChange.unitId === unit.id)) {
      const conflict = limits.conflict(unit, service);
      if (conflict) return { ok: false, warnings, reason: conflict };
    }
    // Eligible manual replacements are allowed; service-level checks retain designated
    // available choirs and limit replacements to vacant fixed slots.
  }

  for (const service of input.services) {
    if (input.lineupChange && service.id !== input.lineupChange.serviceId) continue;
    const definition = slotForCode(input.rules, service);
    if (!definition?.musicRequired) continue;
    const assigned = assignedByService.get(service.id) ?? new Set<string>();
    if (assigned.size > definition.maxChoirs) {
      return { ok: false, warnings, reason: `${service.label} has ${assigned.size} choirs; its configured maximum is ${definition.maxChoirs}.` };
    }
    for (const category of input.rules.categories.filter((row) => row.active)) {
      const policy = input.rules.policies.find((row) => row.active && row.serviceId === definition.id && row.categoryId === category.id);
      if (!policy) return { ok: false, warnings, reason: `Add an active ${category.name} rule for ${definition.name}.` };
      const categoryCandidates = eligibleCandidates({
        service, policy, rules: input.rules, units: input.units, linksByChoir,
      });
      const assignedCategoryIds = [...assigned].filter((unitId) => linksByChoir.get(unitId)?.[0]?.categoryId === category.id);
      const fixed = fixedFor(input.rules,policy.id,service);
      const fixedMode = policy.planningMode === 'FIXED' || fixed.length > 0;
      const availableFixed = fixed.filter(row => categoryCandidates.some(c => c.unit.id === row.choirId));
      if (!(input.allowManualIncomplete && policy.planningMode === 'MANUAL') &&
          policy.minCount !== null && assignedCategoryIds.length < policy.minCount) {
        if (!fixedMode) return { ok: false, warnings, reason: `${service.label}: ${category.name} needs at least ${policy.minCount} choirs; ${assignedCategoryIds.length} assigned.` };
      }
      if (policy.maxCount !== null && assignedCategoryIds.length > policy.maxCount) {
        return { ok: false, warnings, reason: `${service.label}: ${category.name} exceeds its maximum of ${policy.maxCount} choirs.` };
      }
      if (!fixedMode && !(input.allowManualIncomplete && policy.planningMode === 'MANUAL') &&
          policy.requireAll && categoryCandidates.some((candidate) => !assigned.has(candidate.unit.id))) {
        const missing = categoryCandidates.filter((candidate) => !assigned.has(candidate.unit.id)).map((candidate) => candidate.unit.name);
        return { ok: false, warnings, reason: `${service.label}: assign every eligible, available ${category.name} choir (${missing.join(', ')}).` };
      }
      if (fixedMode) {
        const fixedSlots = Math.max(fixed.length,policy.minCount ?? 0,1);
        if (assignedCategoryIds.length < fixedSlots) {
          vacantFixedServiceIds.add(service.id);
          if (!fixed.length) warnings.push(`${service.label}: a fixed ${category.name} slot is empty; an eligible replacement is optional.`);
        }
        for (const row of availableFixed.filter(row => !assigned.has(row.choirId))) {
          const candidate = categoryCandidates.find(c=>c.unit.id === row.choirId)!;
          const setting = policyOverride(policy,candidate.link,definition.code);
          const capped = setting?.kind === 'MAXIMUM' && frequencyCount(countFor(row.choirId,definition.code,setting.period,service.periodKey,input.services,input.assignments,input.history ?? []),setting.counting) >= setting.target;
          if (!capped && !limits.conflict(candidate.unit, service)) return {ok:false,warnings,reason:`${service.label}: keep the available designated choir ${candidate.unit.name}.`};
        }
        if (assignedCategoryIds.length > fixedSlots) return {ok:false,warnings,reason:`${service.label}: there are no additional vacant fixed slots for this category.`};
        for (const row of fixed.filter(row => !assigned.has(row.choirId))) warnings.push(assignedCategoryIds.length < fixedSlots
          ? fixedVacancyWarning(service,row.choirId,input.units)
          : `${service.label}: an eligible replacement is assigned for a designated choir that cannot serve.`);
      }
    }
  }

  const allSchedules = [...(input.history ?? []), { services: input.services, assignments: input.assignments }];
  const allServicesById = new Map(allSchedules.flatMap((schedule) => schedule.services.map((service) => [service.id, service] as const)));
  const assignments = allSchedules.flatMap((schedule) => schedule.assignments);
  const checkFrequency = (policy: CategoryServicePolicyView, unitId: string, setting: PolicyOverride) => {
    const matchingServices = input.services.filter((service) => serviceCode(service) === input.rules.services.find((item) => item.id === policy.serviceId)?.code.toLowerCase());
    const buckets = [...new Set(matchingServices.map((service) => frequencyBucket(service.periodKey, setting.period)))];
    for (const bucket of buckets) {
      const requiredMonths = monthsInFrequencyBucket(bucket, setting.period);
      const presentMonths = new Set(allSchedules.flatMap((schedule) => schedule.services.map((service) => service.periodKey)));
      if (requiredMonths.some((month) => !presentMonths.has(month))) {
        return `The schedule must cover the complete ${setting.period.toLowerCase().replace('_', '-')} period (${requiredMonths[0]} through ${requiredMonths.at(-1)}) to validate frequency rules.`;
      }
      const dates = new Set<string>();
      let count = 0;
      for (const assignment of assignments) {
        if (assignment.unitId !== unitId) continue;
        const service = allServicesById.get(assignment.serviceId);
        if (!service || serviceCode(service) !== input.rules.services.find((item) => item.id === policy.serviceId)?.code.toLowerCase()) continue;
        if (frequencyBucket(service.periodKey, setting.period) !== bucket) continue;
        count++;
        dates.add(service.date);
      }
      const actual = setting.counting === 'DISTINCT_DATES' ? dates.size : count;
      if (setting.kind === 'MINIMUM' && actual < setting.target) {
        const vacantFixed = matchingServices.some(service => frequencyBucket(service.periodKey,setting.period) === bucket && fixedFor(input.rules,policy.id,service).some(row=>row.choirId === unitId)
          && !eligibleCandidates({service,policy,rules:input.rules,units:input.units,linksByChoir})
            .some(candidate=>candidate.unit.id === unitId && !limits.conflict(candidate.unit, service)));
        if (vacantFixed) {warnings.push(`Frequency minimum for ${unitId} could not be met because a fixed slot is unavailable or ineligible.`);continue;}
        return `Frequency minimum for ${unitId} is ${setting.target} in ${bucket}; found ${actual}.`;
      }
      if (setting.kind === 'MAXIMUM' && actual > setting.target) {
        return `Frequency maximum for ${unitId} is ${setting.target} in ${bucket}; found ${actual}.`;
      }
      if (setting.kind === 'TARGET' && actual !== setting.target) {
        warnings.push(`Frequency target for ${unitId} is ${setting.target} in ${bucket}; found ${actual}.`);
      }
    }
    return null;
  };

  for (const link of input.rules.links.filter((row) => row.active)) {
    if (!EligibleOverrideSchema.safeParse(link.eligibleOverride).success ||
        !FrequencyOverrideSchema.safeParse(link.frequencyOverride).success) {
      return { ok: false, warnings, reason: 'A choir has an invalid eligibility or frequency exception. Review its settings before continuing.' };
    }
  }
  for (const policy of input.rules.policies.filter((row) => row.active)) {
    const code = input.rules.services.find((service) => service.id === policy.serviceId)?.code;
    if (!code) continue;
    if (input.lineupChange && code.toLowerCase() !== serviceCode(servicesById.get(input.lineupChange.serviceId)!)) continue;
    const links = input.rules.links.filter((link) => link.active && link.categoryId === policy.categoryId);
    for (const link of links) {
      if (input.lineupChange && link.choirId !== input.lineupChange.unitId && link.choirId !== input.lineupChange.removedUnitId) continue;
      const unit = unitsById.get(link.choirId);
      if (!unit || unit.active === false) continue;
      const override = policyOverride(policy, link, code);
      if (!override) continue;
      if (input.allowManualIncomplete && policy.planningMode === 'MANUAL' && override.kind === 'MINIMUM') continue;
      const error = checkFrequency(policy, unit.id, override);
      if (error) return { ok: false, warnings, reason: error };
    }
  }
  return { ok: true, warnings:[...new Set(warnings)], vacantFixedServiceIds:[...vacantFixedServiceIds] };
}
