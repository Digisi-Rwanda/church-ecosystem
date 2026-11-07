/**
 * Can this configuration generate a schedule?
 *
 * Pure, self-contained and synchronous: no database, no I/O. Callers hand it a snapshot
 * (live rows, or live rows with a pending edit applied) and get `{ ok, errors }` back.
 * It is used in two places:
 *   1. `saveConfigChange` runs it on (live config + pending edit) and rejects the save with 422.
 *   2. The generate routes may call it as a last guard before building a schedule.
 *
 * Every message names the offending service, category or choir, and the list is de-duplicated.
 * The Music variant reuses `validateMusicConfigSnapshot` as its first pass, then adds the checks
 * that otherwise only surface as a thrown error inside the engine at generate time
 * (see the "engine throw sites" notes on each block).
 */

import { SUPPORTED_PROTOCOL_KINDS } from '../protocol/engine.js';
import {
  isMusicChoirEligible, validateMusicConfigSnapshot,
  type MusicConfigRulesSnapshot, type MusicLinkRules, type MusicPolicyRules,
} from './musicConfigRules.js';

export interface GenerationValidation { ok: boolean; errors: string[] }

/** The service fields the calendar builder reads. Widened versus the Music rules snapshot. */
export interface GenerationService {
  id: string;
  code: string;
  name: string;
  active: boolean;
  musicRequired: boolean;
  protocolRequired?: boolean;
  maxChoirs: number;
  weekday: number | null;
  time?: string | null;
  recurrence: string;
  selectedDates: string[];
}

export interface MusicGenerationSnapshot extends Omit<MusicConfigRulesSnapshot, 'services' | 'categories' | 'choirs'> {
  services: GenerationService[];
  categories: Array<{ id: string; active: boolean; code: string; name: string }>;
  choirs: Array<{ id: string; active: boolean; name: string }>;
}

export interface ProtocolGenerationSnapshot {
  /** The shared calendar (sys-music services). */
  services: GenerationService[];
  rules: Array<{ id?: string; serviceId: string; active: boolean; required: boolean; defaultTeamSize: number }>;
  dutyPolicy: { preferTarget: number; softMax: number; hardMax: number } | null;
}

const label = (s: { name: string; code: string }) => `${s.name} (${s.code})`;
const RECURRENCES = ['WEEKLY', 'MONTHLY', 'SELECTED_DATES', 'CUSTOM'];

/** A real calendar date written YYYY-MM-DD (rejects 2026-02-30). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}

/** Calendar-field checks. Engine throw sites: buildConfiguredMusicCalendar (duplicate code, CUSTOM, WEEKLY). */
function calendarErrors(services: GenerationService[]): string[] {
  const errors: string[] = [];
  const active = services.filter((s) => s.active);
  const seen = new Map<string, GenerationService>();
  for (const s of active) {
    const key = s.code.toLowerCase();
    const first = seen.get(key);
    if (first) errors.push(`Two active services use the code ${s.code} (${first.name} and ${s.name}). Codes must be unique, ignoring capitalization.`);
    else seen.set(key, s);
  }
  for (const s of active) {
    if (!RECURRENCES.includes(s.recurrence)) {
      errors.push(`${label(s)} has an unknown recurrence “${s.recurrence}”.`);
      continue;
    }
    if (s.weekday !== null && !(Number.isInteger(s.weekday) && s.weekday >= 0 && s.weekday <= 6)) {
      errors.push(`${label(s)} has an invalid weekday.`);
    }
    if (s.time != null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) {
      errors.push(`${label(s)} has an invalid start time. Use HH:MM.`);
    }
    for (const date of s.selectedDates) {
      if (!isIsoDate(date)) errors.push(`${label(s)} lists “${date}”, which is not a valid date. Use YYYY-MM-DD.`);
    }
    const hasDates = s.selectedDates.length > 0;
    if (s.recurrence === 'WEEKLY' && s.weekday === null) {
      errors.push(`${label(s)} repeats weekly, so it needs a weekday.`);
    }
    if (s.recurrence === 'CUSTOM' && !hasDates) {
      errors.push(`${label(s)} uses custom dates, so it needs at least one date.`);
    }
    if (s.recurrence === 'SELECTED_DATES' && !hasDates) {
      // The engine would silently produce no services for this one.
      errors.push(`${label(s)} uses selected dates, so it needs at least one date.`);
    }
    // The engine special-cases code IGABURO (no weekday = last Saturday of the month).
    if (s.recurrence === 'MONTHLY' && !hasDates && s.weekday === null && s.code.toUpperCase() !== 'IGABURO') {
      // The engine would silently produce no services for this one.
      errors.push(`${label(s)} repeats monthly, so it needs a weekday or specific dates.`);
    }
  }
  return errors;
}

export function validateForGeneration(snapshot: MusicGenerationSnapshot): GenerationValidation {
  // First pass: the existing rules (policy values, overrides, fixed arrangements, capacity).
  const errors: string[] = [...validateMusicConfigSnapshot(snapshot as unknown as MusicConfigRulesSnapshot).errors];

  errors.push(...calendarErrors(snapshot.services));

  const activeChoirs = snapshot.choirs.filter((c) => c.active);
  const activeCategories = snapshot.categories.filter((c) => c.active);
  const categoryById = new Map(snapshot.categories.map((c) => [c.id, c]));
  const serviceById = new Map(snapshot.services.map((s) => [s.id, s]));
  const activeLinks = snapshot.links.filter((l) => l.active);
  const linksByChoir = new Map<string, MusicLinkRules[]>();
  for (const link of activeLinks) linksByChoir.set(link.choirId, [...(linksByChoir.get(link.choirId) ?? []), link]);
  const fixedChoirs = new Set(snapshot.fixedAssignments.map((f) => f.choirId));

  // Category codes are unique too (case-insensitive).
  const seenCategory = new Map<string, string>();
  for (const c of activeCategories) {
    const key = c.code.toLowerCase();
    const first = seenCategory.get(key);
    if (first) errors.push(`Two active categories use the code ${c.code} (${first} and ${c.name}).`);
    else seenCategory.set(key, c.name);
  }

  // Choir coverage. Engine throw site: configuredEngine "needs exactly one explicit choir-category link".
  for (const choir of activeChoirs) {
    const links = linksByChoir.get(choir.id) ?? [];
    if (links.length === 0 && !fixedChoirs.has(choir.id)) {
      errors.push(`${choir.name} is not linked to any category. Link it to exactly one category before generating.`);
    }
    for (const link of links) {
      const category = categoryById.get(link.categoryId);
      if (category && !category.active) errors.push(`${choir.name} is linked to ${category.name}, which is not active.`);
    }
  }

  // Category rule completeness. Engine throw site: configuredEngine "Add an active <category> rule for <service>".
  const activePolicies = snapshot.policies.filter((p) => p.active);
  for (const service of snapshot.services.filter((s) => s.active && s.musicRequired)) {
    for (const category of activeCategories) {
      const has = activePolicies.some((p) => p.serviceId === service.id && p.categoryId === category.id);
      if (!has) errors.push(`Add an active ${category.name} rule for ${service.name} (${service.code}).`);
    }
  }

  // Fixed designations must name a choir that is actually eligible, ignoring capitalization of exception codes.
  const policyById = new Map<string, MusicPolicyRules>(snapshot.policies.map((p) => [p.id, p]));
  for (const fixed of snapshot.fixedAssignments) {
    const policy = policyById.get(fixed.categoryServicePolicyId);
    const service = policy && serviceById.get(policy.serviceId);
    const choir = snapshot.choirs.find((c) => c.id === fixed.choirId);
    if (!policy || !service || !choir) continue; // dangling references are reported by the first pass
    const link = (linksByChoir.get(choir.id) ?? []).find((l) => l.categoryId === policy.categoryId) ?? null;
    if (!isMusicChoirEligible({ choirActive: choir.active, categoryId: policy.categoryId, serviceCode: service.code, policy, link })) {
      errors.push(`${choir.name} is designated for ${label(service)} but is not eligible for it.`);
    }
  }

  const unique = [...new Set(errors)];
  return { ok: unique.length === 0, errors: unique };
}

/**
 * Protocol variant. Same contract. `snapshot.services` is the shared calendar owned by Music.
 * Engine/route throw sites: UNSUPPORTED_SERVICE, PROTOCOL_RULE_MISSING, NO_PROTOCOL_CONFIG.
 */
export function validateProtocolForGeneration(snapshot: ProtocolGenerationSnapshot): GenerationValidation {
  const errors: string[] = [];
  const supported = SUPPORTED_PROTOCOL_KINDS as readonly string[];

  const policy = snapshot.dutyPolicy;
  if (!policy) {
    errors.push('Add the Protocol duty limits before building teams.');
  } else {
    for (const [name, value] of [['prefer target', policy.preferTarget], ['soft maximum', policy.softMax], ['hard maximum', policy.hardMax]] as const) {
      if (!Number.isInteger(value) || value <= 0) errors.push(`The Protocol duty ${name} must be a positive whole number.`);
    }
    if (policy.softMax < policy.preferTarget || policy.hardMax < policy.softMax) {
      errors.push('Protocol duty limits must satisfy prefer target ≤ soft maximum ≤ hard maximum.');
    }
  }

  const serviceById = new Map(snapshot.services.map((s) => [s.id, s]));
  const activeRules = snapshot.rules.filter((r) => r.active);

  const ruleCount = new Map<string, number>();
  for (const rule of activeRules) {
    const service = serviceById.get(rule.serviceId);
    if (!service) {
      errors.push('A Protocol team rule refers to a service that is no longer in the shared calendar.');
      continue;
    }
    ruleCount.set(rule.serviceId, (ruleCount.get(rule.serviceId) ?? 0) + 1);
    if (!Number.isInteger(rule.defaultTeamSize) || rule.defaultTeamSize <= 0) {
      errors.push(`The team size for ${label(service)} must be a positive whole number.`);
    }
  }
  for (const [serviceId, count] of ruleCount) {
    if (count > 1) errors.push(`${label(serviceById.get(serviceId)!)} has more than one Protocol team rule.`);
  }

  for (const service of snapshot.services.filter((s) => s.active && s.protocolRequired)) {
    if (!supported.includes(service.code.toUpperCase())) {
      errors.push(`Protocol is enabled for ${label(service)}, but the Protocol engine cannot staff that service code. Supported: ${supported.join(', ')}.`);
      continue;
    }
    if (!activeRules.some((r) => r.serviceId === service.id)) {
      errors.push(`Add Protocol team rules for ${label(service)}.`);
    }
  }

  const unique = [...new Set(errors)];
  return { ok: unique.length === 0, errors: unique };
}
