/**
 * Load the LIVE scheduling configuration for a system from the database.
 * The engines call this to get their rules instead of hard-coding them.
 *
 * There are no versions: whatever is saved is what the next generate call sees. Confirmed and published
 * schedules never call this to rebuild themselves; they are frozen copies (see the frozen-schedule guard in
 * routes/musicSchedule.ts and routes/protocol.ts).
 * Availability (unavailability) was always live and is read the same way as before.
 */
import { prisma } from '../lib/prisma.js';
import type { MusicHorizon } from '../music/types.js';
import {
  toServiceView,
  toCategoryView,
  toPolicyView,
  toLinkView,
  toRuleView,
  toDutyPolicyView,
} from './store.js';
import type {
  CategoryServicePolicyView,
  ChoirCategoryLinkView,
  FrequencyPeriod,
  ChoirCategoryView,
  MusicChoirUnavailabilityView,
  MusicFixedAssignmentView,
  ProtocolDutyPolicyView,
  ProtocolServiceRuleView,
  SchedulingServiceView,
} from './types.js';

import { defaultMusicLineupLimits, MUSIC_LINEUP_LIMITS_KEY, musicLineupLimitsSchema, type MusicLineupLimits } from './musicLineupLimits.js';
import { parseJson } from './types.js';

export const SYSTEM_MUSIC = 'sys-music';
export const SYSTEM_PROTOCOL = 'sys-protocol';

export async function loadMusicLineupLimits(): Promise<MusicLineupLimits> {
  const saved = await prisma.setting.findUnique({ where: { key: MUSIC_LINEUP_LIMITS_KEY } });
  const result = musicLineupLimitsSchema.safeParse(parseJson(saved?.valueJson ?? '', null));
  return result.success ? result.data : defaultMusicLineupLimits;
}

export type LoadedMusicConfig = {
  lineupLimits: MusicLineupLimits;
  services: SchedulingServiceView[];
  categories: ChoirCategoryView[];
  policies: CategoryServicePolicyView[];
  /** choirId -> categoryIds the choir belongs to */
  choirLinks: Map<string, string[]>;
  /** choirId -> service-code eligibility exceptions */
  choirEligibilityOverrides: Map<string, Record<string, unknown>>;
  links: ChoirCategoryLinkView[];
  fixedAssignments: MusicFixedAssignmentView[];
  unavailability: MusicChoirUnavailabilityView[];
};

export type LoadedProtocolConfig = {
  services: SchedulingServiceView[];
  rules: ProtocolServiceRuleView[];
  dutyPolicy: ProtocolDutyPolicyView | null;
};

/** The frequency period that a generation horizon implies. */
export const periodForHorizon = (horizon: MusicHorizon): FrequencyPeriod =>
  horizon === 'MONTH' ? 'MONTH' : horizon === 'QUARTER' ? 'QUARTER' : horizon === 'HALF' ? 'HALF_YEAR' : 'YEAR';

/**
 * Load everything the Music engine needs.
 * Frequency rules do not store a period. Pass the horizon the schedule is generated for and every rule
 * that has no period of its own is counted over that period: a month schedule counts per month, a
 * quarter schedule per quarter, and so on. A rule that does set its own period keeps it.
 */
export async function loadMusicConfig(horizon?: MusicHorizon): Promise<LoadedMusicConfig> {
  const live = { systemId: SYSTEM_MUSIC, active: true };
  const [services, categories, policies, links, fixedAssignments, unavailability, lineupLimits] = await Promise.all([
    prisma.schedulingService.findMany({ where: live }),
    prisma.choirCategory.findMany({ where: live }),
    prisma.categoryServicePolicy.findMany({ where: live }),
    prisma.choirCategoryLink.findMany({ where: live }),
    prisma.musicFixedAssignment.findMany({ where: { systemId: SYSTEM_MUSIC } }),
    prisma.musicChoirUnavailability.findMany({ where: { systemId: SYSTEM_MUSIC, active: true } }),
    loadMusicLineupLimits(),
  ]);
  const choirLinks = new Map<string, string[]>();
  const choirEligibilityOverrides = new Map<string, Record<string, unknown>>();
  for (const l of links) {
    const arr = choirLinks.get(l.choirId) ?? [];
    arr.push(l.categoryId);
    choirLinks.set(l.choirId, arr);
    choirEligibilityOverrides.set(l.choirId, toLinkView(l).eligibleOverride);
  }
  return {
    lineupLimits,
    services: services.map(toServiceView),
    categories: categories.map(toCategoryView),
    policies: policies.map(toPolicyView).map((p) =>
      horizon && p.frequencyTarget !== null && !p.frequencyPeriod ? { ...p, frequencyPeriod: periodForHorizon(horizon) } : p),
    choirLinks,
    choirEligibilityOverrides,
    links: links.map(toLinkView),
    fixedAssignments: fixedAssignments.map((row) => ({
      id: row.id,
      systemId: row.systemId,
      categoryServicePolicyId: row.categoryServicePolicyId,
      choirId: row.choirId,
      serviceDate: row.serviceDate,
      serviceTime: row.serviceTime,
      displayOrder: row.displayOrder,
      createdByPersonId: row.createdByPersonId,
      createdAt: row.createdAt.toISOString(),
    })),
    unavailability: unavailability.map((row) => ({
      id: row.id,
      systemId: row.systemId,
      choirId: row.choirId,
      serviceDate: row.serviceDate,
      serviceCode: row.serviceCode,
      endDate: row.endDate,
      reason: row.reason,
      active: row.active,
      recordedByPersonId: row.recordedByPersonId,
      recordedAt: row.recordedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
}

/** Load everything the Protocol engine needs. The calendar is the live Music calendar. */
export async function loadProtocolConfig(): Promise<LoadedProtocolConfig> {
  const [services, rules, dutyPolicy] = await Promise.all([
    prisma.schedulingService.findMany({ where: { systemId: SYSTEM_MUSIC, active: true } }),
    prisma.protocolServiceRule.findMany({ where: { systemId: SYSTEM_PROTOCOL, active: true } }),
    prisma.protocolDutyPolicy.findFirst({ where: { systemId: SYSTEM_PROTOCOL } }),
  ]);
  return {
    services: services.map(toServiceView),
    rules: rules.map(toRuleView),
    dutyPolicy: dutyPolicy ? toDutyPolicyView(dutyPolicy) : null,
  };
}

// ...unchanged: nothing else lived in this file.
