/**
 * THE one write path for scheduling configuration.
 *
 * Every mutating route in configRouter.ts calls `saveConfigChange`. Nothing else writes config rows
 * (choirRegisterSync only ADDS a missing choir link, see its header). The order is fixed:
 *
 *   1. tenant + SCHEDULING W check          -> 403
 *   2. edit-lock check (caller must hold it) -> 409 { error: 'LOCKED', holder }
 *   3. apply the change to an in-memory copy of the LIVE config (reference checks -> 400/404/409)
 *   4. validate the result with validateForGeneration / validateProtocolForGeneration -> 422 { errors }
 *   5. write rows + audit entry + refresh the lock, in one transaction
 *
 * Validation gates the SAVE. "Valid" means: the edit introduces no error that the live config did not
 * already have. When the live config is clean this is exactly "the result must be valid". When the live
 * config is already broken (for example data from before these checks existed) it still lets people repair it
 * one edit at a time instead of locking everyone out. TODO(confirm): the literal reading is "reject if the
 * result has any error"; the conservative-for-operations choice is taken here and noted in the handover.
 *
 * Batches: `change.ops` is applied atomically (all rows or none), and validated once at the end. That is what
 * makes multi-row edits possible, since a lone intermediate row can be invalid on its own.
 *
 * Implied rules: adding an active category or a Music-required service needs one rule per pair before the
 * calendar can generate. The save adds those rules itself, as ineligible defaults, inside the same
 * transaction, so a single "add category" is valid by construction. The leader then sets the real rules.
 */

import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { loadAccessData } from '../notifications/feed.js';
import { buildMusicCalendar } from '../music/engine.js';
import { checkEditLock, LOCK_TTL_MS, type LockHolder } from './editLock.js';
import { canWriteConfig } from './rules.js';
import { ConfigError, refuse } from './configError.js';
import { collapseRules, collapseChoirs, planRuleOp, type RuleOp, type RuleTables } from './ruleModel.js';
import { isMusicChoirEligible, validatePolicyValues } from './musicConfigRules.js';
import { toCategoryView, toDutyPolicyView, toLinkView, toPolicyView, toRuleView, toServiceView } from './store.js';
import { parseJson, stringifyJson } from './types.js';
import {
  validateForGeneration, validateProtocolForGeneration,
  type GenerationValidation,
} from './validateForGeneration.js';

export const MUSIC_SYSTEM = 'sys-music';
export const PROTOCOL_SYSTEM = 'sys-protocol';

/* ─── Public types ─── */

export type ConfigOp =
  | { op: 'service.create'; data: ServiceInput }
  | { op: 'service.update'; id: string; patch: Partial<ServiceInput> }
  | { op: 'service.retire'; id: string }
  | { op: 'category.create'; data: CategoryInput }
  | { op: 'category.update'; id: string; patch: Partial<CategoryInput> }
  | { op: 'policy.create'; data: PolicyInput }
  | { op: 'policy.update'; id: string; patch: Partial<PolicyInput> }
  | { op: 'link.create'; data: LinkInput }
  | { op: 'link.update'; id: string; patch: Partial<LinkInput> }
  | { op: 'fixed.create'; data: FixedInput }
  | { op: 'fixed.delete'; id: string }
  | { op: 'availability.add'; data: AvailabilityInput }
  | { op: 'availability.clear'; id: string }
  | { op: 'rule.create'; data: RuleInput }
  | { op: 'rule.update'; id: string; patch: Partial<RuleInput> }
  | { op: 'duty.create'; data: DutyInput }
  | { op: 'duty.update'; id: string; patch: Partial<DutyInput> }
  /** Rule layer (ruleModel.ts): expanded into the table ops above, then validated like any other edit. */
  | RuleOp;

export interface ServiceInput {
  code: string; name: string; kind?: string; weekday?: number | null; time?: string | null; recurrence?: string;
  selectedDates?: string[]; monthlyOccurrences?: number[]; active?: boolean; musicRequired?: boolean; protocolRequired?: boolean;
  maxChoirs?: number; displayOrder?: number;
}
export interface CategoryInput { code: string; name: string; description?: string; active?: boolean }
export interface PolicyInput {
  id?: string; // set only by the Rule layer, so a fixed row can point at a policy created in the same batch
  categoryId: string; serviceId: string; eligible?: boolean; active?: boolean; frequencyTarget?: number | null;
  frequencyCounting?: string; frequencyKind?: string; frequencyPeriod?: string | null; planningMode?: string;
  minCount?: number | null; maxCount?: number | null; requireAll?: boolean;
}
export interface LinkInput {
  choirId: string; categoryId: string; eligibleOverride?: Record<string, boolean>;
  frequencyOverride?: Record<string, FrequencyOverride>; active?: boolean;
}
type FrequencyOverride = {
  frequencyTarget?: number; frequencyCounting?: 'ASSIGNMENTS' | 'DISTINCT_DATES';
  frequencyKind?: 'MINIMUM' | 'TARGET' | 'MAXIMUM'; frequencyPeriod?: 'MONTH' | 'QUARTER' | 'HALF_YEAR' | 'YEAR';
};
export interface FixedInput {
  categoryServicePolicyId?: string; serviceId?: string; serviceDate?: string | null; serviceTime?: string | null;
  choirId: string; displayOrder?: number;
}
export interface AvailabilityInput {
  choirId: string; fromDate: string; toDate: string; serviceCode?: string | null; reason?: string | null;
}
export interface RuleInput {
  serviceId: string; active?: boolean; required?: boolean; defaultTeamSize?: number;
  teamSizeOverrides?: Record<string, number>; requireChoir?: boolean; requireWorship?: boolean; relaxableKinds?: string[];
}
export interface DutyInput {
  preferTarget?: number; softMax?: number; hardMax?: number; extraDutyPolicy?: 'ALLOW_WHEN_SHORT' | 'NEVER' | 'ALWAYS';
  duplicateSameDayAllowed?: boolean; musicCompatibilityRequired?: boolean; leadershipPriorities?: string[];
  exceptionsAllowed?: boolean;
}

export interface ConfigChange { ops: ConfigOp[] }

export interface ChangeResult {
  op: ConfigOp['op'] | 'policy.implied';
  status: 'CREATED' | 'UPDATED' | 'DELETED' | 'EXISTS';
  row: unknown;
}

export { ConfigError }; // moved to configError.ts so ruleModel.ts can share it; existing imports keep working

/* ─── Working state ─── */

type Row = Record<string, any>;
interface State {
  system: string;
  services: Row[]; categories: Row[]; policies: Row[]; links: Row[]; fixed: Row[]; choirs: Row[];
  rules: Row[]; duty: Row[]; unavailability: Row[];
}
interface Write { model: string; kind: 'create' | 'update' | 'delete'; id?: string; data?: Row }
interface Audit { action: string; detail: string; meta: object }

async function loadState(system: string): Promise<State> {
  if (system === MUSIC_SYSTEM) {
    const [services, categories, policies, links, fixed, choirs, unavailability] = await Promise.all([
      prisma.schedulingService.findMany({ where: { systemId: MUSIC_SYSTEM } }),
      prisma.choirCategory.findMany({ where: { systemId: MUSIC_SYSTEM } }),
      prisma.categoryServicePolicy.findMany({ where: { systemId: MUSIC_SYSTEM } }),
      prisma.choirCategoryLink.findMany({ where: { systemId: MUSIC_SYSTEM } }),
      prisma.musicFixedAssignment.findMany({ where: { systemId: MUSIC_SYSTEM } }),
      prisma.musicChoir.findMany(),
      prisma.musicChoirUnavailability.findMany({ where: { systemId: MUSIC_SYSTEM, active: true } }),
    ]);
    return { system, services, categories, policies, links, fixed, choirs, rules: [], duty: [], unavailability } as State;
  }
  const [services, rules, duty] = await Promise.all([
    prisma.schedulingService.findMany({ where: { systemId: MUSIC_SYSTEM } }),
    prisma.protocolServiceRule.findMany({ where: { systemId: PROTOCOL_SYSTEM } }),
    prisma.protocolDutyPolicy.findMany({ where: { systemId: PROTOCOL_SYSTEM } }),
  ]);
  return { system, services, categories: [], policies: [], links: [], fixed: [], choirs: [], rules, duty, unavailability: [] } as State;
}

const cloneState = (s: State): State => ({
  ...s,
  services: s.services.map((r) => ({ ...r })), categories: s.categories.map((r) => ({ ...r })),
  policies: s.policies.map((r) => ({ ...r })), links: s.links.map((r) => ({ ...r })),
  fixed: s.fixed.map((r) => ({ ...r })), choirs: s.choirs, rules: s.rules.map((r) => ({ ...r })),
  duty: s.duty.map((r) => ({ ...r })), unavailability: s.unavailability.map((r) => ({ ...r })),
});

export function validateState(s: State): GenerationValidation {
  const services = s.services.map(toServiceView);
  if (s.system === MUSIC_SYSTEM) {
    return validateForGeneration({
      services,
      categories: s.categories.map((c) => ({ id: c.id, active: c.active, code: c.code, name: c.name })),
      policies: s.policies.map(toPolicyView),
      links: s.links.map(toLinkView),
      choirs: s.choirs.map((c) => ({ id: c.id, active: c.active, name: c.name })),
      fixedAssignments: s.fixed.map((f) => ({ categoryServicePolicyId: f.categoryServicePolicyId, choirId: f.choirId, serviceDate: f.serviceDate, serviceTime: f.serviceTime })),
    });
  }
  const duty = s.duty[0] ? toDutyPolicyView(s.duty[0]) : null;
  return validateProtocolForGeneration({
    services,
    rules: s.rules.map(toRuleView),
    dutyPolicy: duty ? { preferTarget: duty.preferTarget, softMax: duty.softMax, hardMax: duty.hardMax } : null,
  });
}

/* ─── Field conversion (the same function builds the DB patch and updates the in-memory row) ─── */

const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const serviceFields = (p: Partial<ServiceInput>) => defined({
  code: p.code, name: p.name, kind: p.kind, weekday: p.weekday, time: p.time, recurrence: p.recurrence,
  selectedDatesJson: p.selectedDates === undefined ? undefined : stringifyJson(p.selectedDates),
  monthlyOccurrencesJson: p.monthlyOccurrences === undefined ? undefined : stringifyJson(p.monthlyOccurrences),
  active: p.active, musicRequired: p.musicRequired, protocolRequired: p.protocolRequired,
  maxChoirs: p.maxChoirs, displayOrder: p.displayOrder,
});
const categoryFields = (p: Partial<CategoryInput>) => defined({ code: p.code, name: p.name, description: p.description, active: p.active });
const policyFields = (p: Partial<PolicyInput>) => defined({
  id: p.id, categoryId: p.categoryId, serviceId: p.serviceId, eligible: p.eligible, active: p.active, frequencyTarget: p.frequencyTarget,
  frequencyCounting: p.frequencyCounting, frequencyKind: p.frequencyKind, frequencyPeriod: p.frequencyPeriod,
  planningMode: p.planningMode, minCount: p.minCount, maxCount: p.maxCount, requireAll: p.requireAll,
});
const linkFields = (p: Partial<LinkInput>) => defined({
  choirId: p.choirId, categoryId: p.categoryId, active: p.active,
  eligibleOverrideJson: p.eligibleOverride === undefined ? undefined : stringifyJson(p.eligibleOverride),
  frequencyOverrideJson: p.frequencyOverride === undefined ? undefined : stringifyJson(p.frequencyOverride),
});
const ruleFields = (p: Partial<RuleInput>) => defined({
  serviceId: p.serviceId, active: p.active, required: p.required, defaultTeamSize: p.defaultTeamSize,
  teamSizeOverridesJson: p.teamSizeOverrides === undefined ? undefined : stringifyJson(p.teamSizeOverrides),
  requireChoir: p.requireChoir, requireWorship: p.requireWorship,
  relaxableKindsJson: p.relaxableKinds === undefined ? undefined : JSON.stringify(p.relaxableKinds),
});
const dutyFields = (p: Partial<DutyInput>) => defined({
  preferTarget: p.preferTarget, softMax: p.softMax, hardMax: p.hardMax, extraDutyPolicy: p.extraDutyPolicy,
  duplicateSameDayAllowed: p.duplicateSameDayAllowed, musicCompatibilityRequired: p.musicCompatibilityRequired,
  leadershipPrioritiesJson: p.leadershipPriorities === undefined ? undefined : JSON.stringify(p.leadershipPriorities),
  exceptionsAllowed: p.exceptionsAllowed,
});

/* ─── Applying one op ─── */

interface Ctx { state: State; me: string; writes: Write[]; audits: Audit[]; results: ChangeResult[] }

function insert(ctx: Ctx, key: keyof State, model: string, row: Row) {
  (ctx.state[key] as Row[]).push(row);
  ctx.writes.push({ model, kind: 'create', data: row });
}
function modify(ctx: Ctx, model: string, row: Row, patch: Row) {
  Object.assign(row, patch);
  if (Object.keys(patch).length) ctx.writes.push({ model, kind: 'update', id: row.id, data: patch });
}
function remove(ctx: Ctx, key: keyof State, model: string, row: Row) {
  const list = ctx.state[key] as Row[];
  list.splice(list.indexOf(row), 1);
  ctx.writes.push({ model, kind: 'delete', id: row.id });
}
const stamp = (ctx: Ctx) => ({ id: randomUUID(), createdByPersonId: ctx.me, createdAt: new Date() });

/** Ineligible, empty rule for one category x service pair: valid on its own, edited by the leader afterwards. */
function defaultPolicy(ctx: Ctx, categoryId: string, serviceId: string): Row {
  return {
    ...stamp(ctx), systemId: MUSIC_SYSTEM, categoryId, serviceId, eligible: false, active: true,
    frequencyTarget: null, frequencyCounting: 'ASSIGNMENTS', frequencyKind: 'TARGET', frequencyPeriod: null,
    planningMode: 'ROTATION', minCount: null, maxCount: null, requireAll: false,
  };
}

/** Make sure every active category has a rule for every active Music-required service (implied rules). */
function fillImpliedPolicies(ctx: Ctx) {
  const s = ctx.state;
  if (s.system !== MUSIC_SYSTEM) return;
  for (const service of s.services.filter((r) => r.active && r.musicRequired)) {
    for (const category of s.categories.filter((r) => r.active)) {
      const rows = s.policies.filter((p) => p.serviceId === service.id && p.categoryId === category.id);
      if (rows.some((p) => p.active)) continue;
      if (rows[0]) { // reactivate the old rule rather than leave a hole or duplicate it
        modify(ctx, 'categoryServicePolicy', rows[0], { active: true });
      } else {
        const row = defaultPolicy(ctx, category.id, service.id);
        insert(ctx, 'policies', 'categoryServicePolicy', row);
        ctx.results.push({ op: 'policy.implied', status: 'CREATED', row: toPolicyView(row) });
      }
      ctx.audits.push({ action: 'POLICY_CREATED', detail: `Added a default rule for ${category.name} × ${service.name}`, meta: { implied: true, categoryId: category.id, serviceId: service.id } });
    }
  }
}

const byId = (rows: Row[], id: string) => rows.find((r) => r.id === id);
const activeLinkFor = (s: State, choirId: string) => s.links.filter((l) => l.active && l.choirId === choirId);

/** Port of the old validateLinkOverrides, now against the live in-memory config. Returns a message or null. */
function overrideProblem(s: State, categoryId: string, eligibleOverride: Record<string, boolean>, frequencyOverride: Record<string, FrequencyOverride>): string | null {
  const serviceByCode = new Map(s.services.map((r) => [String(r.code).toLowerCase(), r]));
  const policyByService = new Map(s.policies.filter((p) => p.active && p.categoryId === categoryId).map((p) => [p.serviceId, p]));
  for (const overrides of [eligibleOverride, frequencyOverride] as Array<Record<string, unknown>>) {
    const seen = new Set<string>();
    for (const code of Object.keys(overrides)) {
      const key = code.toLowerCase();
      if (seen.has(key)) return `The override for service ${code} is repeated with different capitalization.`;
      seen.add(key);
    }
  }
  for (const code of [...Object.keys(eligibleOverride), ...Object.keys(frequencyOverride)]) {
    const service = serviceByCode.get(code.toLowerCase());
    if (!service) return `The override refers to service ${code}, which is not in the configuration.`;
    if (!policyByService.get(service.id)) return `Add an active category rule for ${service.name} before adding a choir override.`;
  }
  for (const [code, override] of Object.entries(frequencyOverride)) {
    const service = serviceByCode.get(code.toLowerCase())!;
    const policy = policyByService.get(service.id)!;
    const target = override.frequencyTarget ?? policy.frequencyTarget;
    const period = override.frequencyPeriod ?? policy.frequencyPeriod;
    if (target === null || target === undefined) return `The frequency override for ${service.name} needs a positive frequency target.`;
    if (!period) return `Choose a period for the frequency override on ${service.name}.`;
    const errors = validatePolicyValues({
      eligible: policy.eligible, frequencyTarget: target,
      frequencyCounting: override.frequencyCounting ?? policy.frequencyCounting,
      frequencyKind: override.frequencyKind ?? policy.frequencyKind, frequencyPeriod: period,
      planningMode: policy.planningMode, minCount: policy.minCount, maxCount: policy.maxCount, requireAll: policy.requireAll,
    });
    if (errors.length) return errors[0]!;
  }
  return null;
}

/** The live rows as the plain snapshot the Rule layer reads (ruleModel.ts). */
export function tablesOf(s: State): RuleTables {
  return {
    services: s.services.map(toServiceView), categories: s.categories.map(toCategoryView),
    policies: s.policies.map(toPolicyView), links: s.links.map(toLinkView),
    fixed: s.fixed.map((f) => ({ id: f.id, categoryServicePolicyId: f.categoryServicePolicyId, choirId: f.choirId, serviceDate: f.serviceDate ?? null, serviceTime: f.serviceTime ?? null })),
    choirs: s.choirs.map((c) => ({ id: c.id, name: c.name, active: c.active })),
  };
}

const needSystem = (ctx: Ctx, system: string, what: string) => {
  if (ctx.state.system !== system) throw refuse(400, 'BAD_INPUT', `${what} belong to ${system}`);
};
const exists = (ctx: Ctx, op: ChangeResult['op'], row: Row, view: (r: Row) => unknown, action: string, detail: string, meta: object) => {
  ctx.results.push({ op, status: 'EXISTS', row: view(row) });
  ctx.audits.push({ action, detail, meta });
};

function applyOp(ctx: Ctx, change: ConfigOp) {
  const s = ctx.state;
  switch (change.op) {
    /* Services (the shared calendar, owned by Music) */
    case 'service.create': {
      needSystem(ctx, MUSIC_SYSTEM, 'Shared calendar services');
      const d = change.data;
      const same = s.services.find((r) => String(r.code).toLowerCase() === d.code.toLowerCase());
      if (same) return exists(ctx, change.op, same, toServiceView, 'SERVICE_EXISTS', `Service ${d.code} already exists`, { serviceId: same.id });
      const row = {
        ...stamp(ctx), systemId: MUSIC_SYSTEM, kind: 'SERVICE', weekday: null, time: null, recurrence: 'WEEKLY',
        selectedDatesJson: '[]', monthlyOccurrencesJson: '[]', active: true, musicRequired: false, protocolRequired: false, maxChoirs: 3,
        targetTeamSize: 10, displayOrder: 0, ...serviceFields(d),
      };
      insert(ctx, 'services', 'schedulingService', row);
      ctx.results.push({ op: change.op, status: 'CREATED', row: toServiceView(row) });
      ctx.audits.push({ action: 'SERVICE_CREATED', detail: `Created service “${d.name}” (${d.code})`, meta: { serviceId: row.id } });
      return;
    }
    case 'service.update': {
      needSystem(ctx, MUSIC_SYSTEM, 'Shared calendar services');
      const row = byId(s.services, change.id);
      if (!row) throw refuse(404, 'NOT_FOUND', 'Service not found');
      const p = change.patch;
      if (p.code && p.code.toLowerCase() !== String(row.code).toLowerCase() && s.services.some((r) => r.id !== row.id && String(r.code).toLowerCase() === p.code!.toLowerCase())) {
        throw refuse(409, 'DUPLICATE', 'That service code is already used');
      }
      modify(ctx, 'schedulingService', row, serviceFields(p));
      ctx.results.push({ op: change.op, status: 'UPDATED', row: toServiceView(row) });
      ctx.audits.push({ action: 'SERVICE_UPDATED', detail: `Updated service “${row.name}” (${row.code})`, meta: { serviceId: row.id } });
      return;
    }
    case 'service.retire': {
      needSystem(ctx, MUSIC_SYSTEM, 'Shared calendar services');
      const row = byId(s.services, change.id);
      if (!row) throw refuse(404, 'NOT_FOUND', 'Service not found');
      modify(ctx, 'schedulingService', row, { active: false });
      ctx.results.push({ op: change.op, status: 'UPDATED', row: toServiceView(row) });
      ctx.audits.push({ action: 'SERVICE_RETIRED', detail: `Retired service “${row.name}” (${row.code})`, meta: { serviceId: row.id } });
      return;
    }
    /* Categories */
    case 'category.create': {
      needSystem(ctx, MUSIC_SYSTEM, 'Choir categories');
      const d = change.data;
      const same = s.categories.find((r) => String(r.code).toLowerCase() === d.code.toLowerCase());
      if (same) return exists(ctx, change.op, same, toCategoryView, 'CATEGORY_EXISTS', `Category ${d.code} already exists`, { categoryId: same.id });
      const row = { ...stamp(ctx), systemId: MUSIC_SYSTEM, description: '', active: true, ...categoryFields(d) };
      insert(ctx, 'categories', 'choirCategory', row);
      ctx.results.push({ op: change.op, status: 'CREATED', row: toCategoryView(row) });
      ctx.audits.push({ action: 'CATEGORY_CREATED', detail: `Created category “${d.name}” (${d.code})`, meta: { categoryId: row.id } });
      return;
    }
    case 'category.update': {
      needSystem(ctx, MUSIC_SYSTEM, 'Choir categories');
      const row = byId(s.categories, change.id);
      if (!row) throw refuse(404, 'NOT_FOUND', 'Category not found');
      const p = change.patch;
      if (p.code && p.code.toLowerCase() !== String(row.code).toLowerCase() && s.categories.some((r) => r.id !== row.id && String(r.code).toLowerCase() === p.code!.toLowerCase())) {
        throw refuse(409, 'DUPLICATE', 'That category code is already used');
      }
      modify(ctx, 'choirCategory', row, categoryFields(p));
      ctx.results.push({ op: change.op, status: 'UPDATED', row: toCategoryView(row) });
      ctx.audits.push({ action: 'CATEGORY_UPDATED', detail: `Updated category “${row.name}” (${row.code})`, meta: { categoryId: row.id } });
      return;
    }
    /* Category x service policies */
    case 'policy.create': {
      needSystem(ctx, MUSIC_SYSTEM, 'Choir policies');
      const d = change.data;
      if (!s.categories.some((r) => r.id === d.categoryId && r.active)) throw refuse(400, 'CONFIG_REFERENCE', 'Choose an active choir category');
      if (!s.services.some((r) => r.id === d.serviceId && r.active)) throw refuse(400, 'CONFIG_REFERENCE', 'Choose an active service');
      const same = s.policies.find((p) => p.active && p.categoryId === d.categoryId && p.serviceId === d.serviceId);
      if (same) return exists(ctx, change.op, same, toPolicyView, 'POLICY_EXISTS', `Policy for ${d.categoryId} × ${d.serviceId} already exists`, { policyId: same.id });
      const row: Row = { ...defaultPolicy(ctx, d.categoryId, d.serviceId), eligible: true, ...policyFields(d) };
      insert(ctx, 'policies', 'categoryServicePolicy', row);
      ctx.results.push({ op: change.op, status: 'CREATED', row: toPolicyView(row) });
      ctx.audits.push({ action: 'POLICY_CREATED', detail: `Created policy ${d.categoryId} × ${d.serviceId}`, meta: { policyId: row.id } });
      return;
    }
    case 'policy.update': {
      needSystem(ctx, MUSIC_SYSTEM, 'Choir policies');
      const row = byId(s.policies, change.id);
      if (!row) throw refuse(404, 'NOT_FOUND', 'Policy not found');
      const categoryId = change.patch.categoryId ?? row.categoryId;
      const serviceId = change.patch.serviceId ?? row.serviceId;
      if (!s.categories.some((r) => r.id === categoryId && r.active)) throw refuse(400, 'CONFIG_REFERENCE', 'Choose an active choir category');
      if (!s.services.some((r) => r.id === serviceId)) throw refuse(400, 'CONFIG_REFERENCE', 'Choose a service in the calendar');
      const willBeActive = change.patch.active ?? row.active;
      if (willBeActive && s.policies.some((p) => p.id !== row.id && p.active && p.categoryId === categoryId && p.serviceId === serviceId)) {
        throw refuse(409, 'DUPLICATE', 'That category and service already have a rule');
      }
      modify(ctx, 'categoryServicePolicy', row, policyFields(change.patch));
      ctx.results.push({ op: change.op, status: 'UPDATED', row: toPolicyView(row) });
      ctx.audits.push({ action: 'POLICY_UPDATED', detail: `Updated policy for ${categoryId} × ${serviceId}`, meta: { policyId: row.id } });
      return;
    }
    /* Choir <-> category links */
    case 'link.create': {
      needSystem(ctx, MUSIC_SYSTEM, 'Choir category links');
      const d = change.data;
      if (!s.categories.some((r) => r.id === d.categoryId && r.active)) throw refuse(400, 'CONFIG_REFERENCE', 'Choose an active choir category');
      if (!s.choirs.some((c) => c.id === d.choirId && c.active)) throw refuse(400, 'CONFIG_REFERENCE', 'Choose an active choir');
      const problem = overrideProblem(s, d.categoryId, d.eligibleOverride ?? {}, d.frequencyOverride ?? {});
      if (problem) throw refuse(400, 'CONFIG_OVERRIDE', problem);
      const current = activeLinkFor(s, d.choirId)[0];
      if (current) {
        if (current.categoryId !== d.categoryId) throw refuse(409, 'DUPLICATE_MEMBERSHIP', 'Each choir can belong to only one category.');
        return exists(ctx, change.op, current, toLinkView, 'LINK_EXISTS', `Link for choir ${d.choirId} already exists`, { linkId: current.id });
      }
      const row = { ...stamp(ctx), systemId: MUSIC_SYSTEM, active: true, eligibleOverrideJson: '{}', frequencyOverrideJson: '{}', ...linkFields(d) };
      insert(ctx, 'links', 'choirCategoryLink', row);
      ctx.results.push({ op: change.op, status: 'CREATED', row: toLinkView(row) });
      ctx.audits.push({ action: 'LINK_CREATED', detail: `Linked choir ${d.choirId} to category ${d.categoryId}`, meta: { linkId: row.id } });
      return;
    }
    case 'link.update': {
      needSystem(ctx, MUSIC_SYSTEM, 'Choir category links');
      const row = byId(s.links, change.id);
      if (!row) throw refuse(404, 'NOT_FOUND', 'Choir category link not found');
      const categoryId = change.patch.categoryId ?? row.categoryId;
      const choirId = change.patch.choirId ?? row.choirId;
      if (!s.categories.some((r) => r.id === categoryId && r.active)) throw refuse(400, 'CONFIG_REFERENCE', 'Choose an active choir category');
      if (!s.choirs.some((c) => c.id === choirId && c.active)) throw refuse(400, 'CONFIG_REFERENCE', 'Choose an active choir');
      if ((change.patch.active ?? row.active) && s.links.some((l) => l.id !== row.id && l.active && l.choirId === choirId)) {
        throw refuse(409, 'DUPLICATE_MEMBERSHIP', 'Each choir can belong to only one category.');
      }
      const eligible = change.patch.eligibleOverride ?? parseJson(row.eligibleOverrideJson, {});
      const frequency = change.patch.frequencyOverride ?? parseJson(row.frequencyOverrideJson, {});
      const problem = overrideProblem(s, categoryId, eligible, frequency);
      if (problem) throw refuse(400, 'CONFIG_OVERRIDE', problem);
      modify(ctx, 'choirCategoryLink', row, linkFields(change.patch));
      ctx.results.push({ op: change.op, status: 'UPDATED', row: toLinkView(row) });
      ctx.audits.push({ action: 'LINK_UPDATED', detail: `Updated choir category link for ${choirId}`, meta: { linkId: row.id } });
      return;
    }
    /* Fixed designations */
    case 'fixed.create': {
      needSystem(ctx, MUSIC_SYSTEM, 'Fixed choir assignments');
      const b = change.data;
      const choirLink = activeLinkFor(s, b.choirId)[0];
      if (!b.categoryServicePolicyId && (!b.serviceId || !choirLink)) {
        throw refuse(400, 'CONFIG_REFERENCE', 'Choose a service and a choir linked to a category.');
      }
      const policy = s.policies.find((p) => p.active && (b.categoryServicePolicyId
        ? p.id === b.categoryServicePolicyId
        : p.serviceId === b.serviceId && p.categoryId === choirLink!.categoryId));
      if (!policy) throw refuse(400, 'CONFIG_REFERENCE', 'The selected service needs an active rule for this choir’s category.');
      const service = s.services.find((r) => r.id === policy.serviceId && r.active);
      const choir = s.choirs.find((c) => c.id === b.choirId && c.active);
      const link = s.links.find((l) => l.active && l.choirId === b.choirId && l.categoryId === policy.categoryId);
      if (!service || !choir || !link) throw refuse(400, 'CONFIG_REFERENCE', 'The designated choir must be active and linked to this rule’s category.');
      if (b.serviceTime && b.serviceTime !== service.time) throw refuse(400, 'CONFIG_REFERENCE', 'Choose the selected service’s configured start time.');
      if (b.serviceDate && !buildMusicCalendar(b.serviceDate.slice(0, 7), 'MONTH', [toServiceView(service)]).some((slot) => slot.date === b.serviceDate)) {
        throw refuse(400, 'CONFIG_REFERENCE', 'This service does not occur on that date. Add the date to the service calendar first.');
      }
      // Case-insensitive exception lookup (the old route compared exception codes case-sensitively).
      if (!isMusicChoirEligible({ choirActive: true, categoryId: policy.categoryId, serviceCode: service.code, policy: policy as { eligible: boolean }, link: toLinkView(link) })) {
        throw refuse(400, 'CONFIG_INELIGIBLE', 'This choir is not eligible for the selected service.');
      }
      const scopeKey = !b.serviceDate && !b.serviceTime ? 'ALL' : `${b.serviceDate ?? '*'}|${b.serviceTime ?? '*'}`;
      const same = s.fixed.find((f) => f.categoryServicePolicyId === policy.id && f.choirId === b.choirId && f.scopeKey === scopeKey);
      if (same) return exists(ctx, change.op, same, (r) => r, 'MUSIC_FIXED_ASSIGNMENT_EXISTS', 'Fixed designation already exists', { assignmentId: same.id });
      if (policy.maxCount !== null && !b.serviceDate && !b.serviceTime) {
        const count = s.fixed.filter((f) => f.categoryServicePolicyId === policy.id && !f.serviceDate && !f.serviceTime).length;
        if (count + 1 > policy.maxCount) throw refuse(409, 'SERVICE_LIMIT', 'This would exceed the category’s maximum choir count.');
      }
      const peers = s.policies.filter((p) => p.serviceId === policy.serviceId && p.id !== policy.id).map((p) => p.id);
      if (s.fixed.some((f) => f.choirId === b.choirId && peers.includes(f.categoryServicePolicyId))) {
        throw refuse(409, 'DUPLICATE_SERVICE_ASSIGNMENT', 'A choir cannot fill two categories on the same service.');
      }
      const row = {
        ...stamp(ctx), systemId: MUSIC_SYSTEM, categoryServicePolicyId: policy.id, choirId: b.choirId,
        displayOrder: b.displayOrder ?? 0, serviceDate: b.serviceDate ?? null, serviceTime: b.serviceTime ?? null, scopeKey,
      };
      insert(ctx, 'fixed', 'musicFixedAssignment', row);
      ctx.results.push({ op: change.op, status: 'CREATED', row });
      ctx.audits.push({ action: 'MUSIC_FIXED_ASSIGNMENT_CREATED', detail: `Designated a choir for ${service.name}`, meta: { assignmentId: row.id, policyId: policy.id, choirId: b.choirId } });
      return;
    }
    case 'fixed.delete': {
      needSystem(ctx, MUSIC_SYSTEM, 'Fixed choir assignments');
      const row = byId(s.fixed, change.id);
      if (!row) throw refuse(404, 'NOT_FOUND', 'Fixed choir assignment not found.');
      remove(ctx, 'fixed', 'musicFixedAssignment', row);
      ctx.results.push({ op: change.op, status: 'DELETED', row });
      ctx.audits.push({ action: 'MUSIC_FIXED_ASSIGNMENT_REMOVED', detail: 'Removed a fixed choir designation', meta: { assignmentId: row.id, choirId: row.choirId } });
      return;
    }
    /* Availability (live and unversioned before this change too; same semantics, now behind the one write path) */
    case 'availability.add': {
      needSystem(ctx, MUSIC_SYSTEM, 'Choir availability records');
      const b = change.data;
      if (b.toDate < b.fromDate) throw refuse(400, 'BAD_INPUT', 'Choose a valid From and To date; To cannot be before From.');
      if (!s.choirs.some((c) => c.id === b.choirId && c.active)) throw refuse(400, 'CONFIG_REFERENCE', 'Choose an active choir.');
      if (b.serviceCode && !s.services.some((r) => r.active && r.musicRequired && String(r.code).toLowerCase() === b.serviceCode!.toLowerCase())) {
        throw refuse(400, 'CONFIG_REFERENCE', 'Choose a service from the Music calendar.');
      }
      const clash = s.unavailability.some((r) => r.choirId === b.choirId && r.serviceDate <= b.toDate && (r.endDate ?? r.serviceDate) >= b.fromDate
        && (r.serviceCode === null || !b.serviceCode || String(r.serviceCode).toLowerCase() === b.serviceCode.toLowerCase()));
      if (clash) throw refuse(409, 'DUPLICATE_AVAILABILITY', 'This choir already has unavailability overlapping those dates.');
      const row = {
        id: randomUUID(), systemId: MUSIC_SYSTEM, choirId: b.choirId, serviceDate: b.fromDate, endDate: b.toDate,
        serviceCode: b.serviceCode?.toLowerCase() ?? null, reason: b.reason?.trim() || null, active: true,
        recordedByPersonId: ctx.me, recordedAt: new Date(), updatedAt: new Date(),
      };
      insert(ctx, 'unavailability', 'musicChoirUnavailability', row);
      ctx.results.push({ op: change.op, status: 'CREATED', row });
      ctx.audits.push({ action: 'MUSIC_UNAVAILABILITY_RECORDED', detail: `Recorded choir unavailability for ${b.fromDate}`, meta: { availabilityId: row.id, choirId: b.choirId, serviceDate: b.fromDate, serviceCode: row.serviceCode } });
      return;
    }
    case 'availability.clear': {
      needSystem(ctx, MUSIC_SYSTEM, 'Choir availability records');
      const row = byId(s.unavailability, change.id);
      if (!row) throw refuse(404, 'NOT_FOUND', 'Availability record not found.');
      modify(ctx, 'musicChoirUnavailability', row, { active: false });
      ctx.results.push({ op: change.op, status: 'UPDATED', row });
      ctx.audits.push({ action: 'MUSIC_UNAVAILABILITY_CLEARED', detail: `Cleared choir unavailability for ${row.serviceDate}`, meta: { availabilityId: row.id, choirId: row.choirId, serviceDate: row.serviceDate, serviceCode: row.serviceCode } });
      return;
    }
    /* Rules and choir categories: expanded into the ops above (the only code that knows the tables behind a Rule). */
    case 'musicRule.create': case 'musicRule.update': case 'musicRule.delete': case 'choir.setCategory': {
      needSystem(ctx, MUSIC_SYSTEM, 'Music rules');
      const plan = planRuleOp(tablesOf(s), change);
      for (const op of plan.ops) applyOp(ctx, op);
      const rules = plan.locate(collapseRules(tablesOf(s)));
      ctx.results.push({
        op: change.op, row: rules,
        status: change.op === 'musicRule.create' ? 'CREATED' : change.op === 'musicRule.delete' ? 'DELETED' : 'UPDATED',
      });
      return;
    }
    /* Protocol */
    case 'rule.create': {
      needSystem(ctx, PROTOCOL_SYSTEM, 'Protocol rules');
      const d = change.data;
      if (!s.services.some((r) => r.id === d.serviceId && r.active)) throw refuse(400, 'CONFIG_REFERENCE', 'Choose an active shared calendar service');
      const same = s.rules.find((r) => r.serviceId === d.serviceId);
      if (same) return exists(ctx, change.op, same, toRuleView, 'PROTOCOL_RULE_EXISTS', `Rule for ${d.serviceId} already exists`, { ruleId: same.id });
      const row = {
        ...stamp(ctx), systemId: PROTOCOL_SYSTEM, active: true, required: false, defaultTeamSize: 10,
        teamSizeOverridesJson: '{}', requireChoir: true, requireWorship: true, relaxableKindsJson: '[]', ...ruleFields(d),
      };
      insert(ctx, 'rules', 'protocolServiceRule', row);
      ctx.results.push({ op: change.op, status: 'CREATED', row: toRuleView(row) });
      ctx.audits.push({ action: 'PROTOCOL_RULE_CREATED', detail: `Created protocol rule for ${d.serviceId}`, meta: { ruleId: row.id } });
      return;
    }
    case 'rule.update': {
      needSystem(ctx, PROTOCOL_SYSTEM, 'Protocol rules');
      const row = byId(s.rules, change.id);
      if (!row) throw refuse(404, 'NOT_FOUND', 'Protocol rule not found');
      const serviceId = change.patch.serviceId ?? row.serviceId;
      if (!s.services.some((r) => r.id === serviceId && r.active)) throw refuse(400, 'CONFIG_REFERENCE', 'Choose an active shared calendar service');
      if (s.rules.some((r) => r.id !== row.id && r.serviceId === serviceId)) throw refuse(409, 'DUPLICATE', 'That service already has a Protocol rule');
      modify(ctx, 'protocolServiceRule', row, ruleFields(change.patch));
      ctx.results.push({ op: change.op, status: 'UPDATED', row: toRuleView(row) });
      ctx.audits.push({ action: 'PROTOCOL_RULE_UPDATED', detail: `Updated Protocol rule for ${serviceId}`, meta: { ruleId: row.id } });
      return;
    }
    case 'duty.create': {
      needSystem(ctx, PROTOCOL_SYSTEM, 'Protocol duty policy');
      const same = s.duty[0];
      if (same) return exists(ctx, change.op, same, toDutyPolicyView, 'DUTY_POLICY_EXISTS', 'Duty policy already exists', { policyId: same.id });
      const row = {
        ...stamp(ctx), systemId: PROTOCOL_SYSTEM, preferTarget: 3, softMax: 3, hardMax: 4, extraDutyPolicy: 'ALLOW_WHEN_SHORT',
        duplicateSameDayAllowed: false, musicCompatibilityRequired: true, leadershipPrioritiesJson: '[]', exceptionsAllowed: true,
        ...dutyFields(change.data),
      };
      insert(ctx, 'duty', 'protocolDutyPolicy', row);
      ctx.results.push({ op: change.op, status: 'CREATED', row: toDutyPolicyView(row) });
      ctx.audits.push({ action: 'DUTY_POLICY_CREATED', detail: 'Created protocol duty policy', meta: { policyId: row.id } });
      return;
    }
    case 'duty.update': {
      needSystem(ctx, PROTOCOL_SYSTEM, 'Protocol duty policy');
      const row = byId(s.duty, change.id);
      if (!row) throw refuse(404, 'NOT_FOUND', 'Protocol duty policy not found');
      modify(ctx, 'protocolDutyPolicy', row, dutyFields(change.patch));
      ctx.results.push({ op: change.op, status: 'UPDATED', row: toDutyPolicyView(row) });
      ctx.audits.push({ action: 'DUTY_POLICY_UPDATED', detail: 'Updated Protocol duty policy', meta: { policyId: row.id } });
      return;
    }
  }
}

/** Ops after which every active category x Music-required service pair must still have a rule. */
const IMPLIES_RULES = new Set<ConfigOp['op']>(['service.create', 'service.update', 'category.create', 'category.update']);

/** Ops that never touch the rules the validator reads. They skip step 4 (but not steps 1, 2 or 5). */
const NON_RULE_OPS = new Set<ConfigOp['op']>(['availability.add', 'availability.clear']);

/** Validate the live config as it stands (read-only; used by the page's status banner). */
export async function validateLiveConfig(systemId: string): Promise<GenerationValidation> {
  return validateState(await loadState(systemId));
}

/** Read model for GET /config/rules and /config/choirs. */
export async function readRuleModel() {
  const tables = tablesOf(await loadState(MUSIC_SYSTEM));
  const choirs = collapseChoirs(tables);
  return {
    rules: collapseRules(tables),
    choirs,
    warnings: choirs.filter((c) => c.active && !c.categoryId).map((c) => ({ code: 'CHOIR_UNASSIGNED', choirId: c.id, message: `${c.name} has no category yet. Assign one on the Choirs tab.` })),
  };
}

/* ─── The write path ─── */

export interface SaveOutcome { results: ChangeResult[]; lockExpiresAt: string }

export async function saveConfigChange(systemId: string, personId: string, change: ConfigChange): Promise<SaveOutcome> {
  // 1. Tenant + SCHEDULING W. Never trust a client-supplied systemId on its own.
  if (systemId !== MUSIC_SYSTEM && systemId !== PROTOCOL_SYSTEM) throw refuse(400, 'BAD_INPUT', 'Unsupported configuration system');
  const access = (await loadAccessData(personId)).data;
  if (!canWriteConfig(personId, systemId, access)) throw refuse(403, 'FORBIDDEN', 'You may not change scheduling configuration');
  if (!change.ops.length) throw refuse(400, 'BAD_INPUT', 'Nothing to save');

  // 2. Edit lock: the caller must hold a live one.
  const lock = await checkEditLock(systemId, personId);
  if (!lock.held) {
    const holder: LockHolder | null = lock.holder;
    throw new ConfigError(409, {
      error: 'LOCKED', code: 'LOCKED', holder,
      message: holder ? `${holder.name ?? 'Another person'} is currently editing configuration.` : 'Open the configuration page to take the edit lock before saving.',
    });
  }

  // 3. Apply to an in-memory copy of the live config.
  const live = await loadState(systemId);
  const working = cloneState(live);
  const ctx: Ctx = { state: working, me: personId, writes: [], audits: [], results: [] };
  for (const op of change.ops) applyOp(ctx, op);
  if (change.ops.some((op) => IMPLIES_RULES.has(op.op))) fillImpliedPolicies(ctx);

  // 4. Validation gates the save (see header for the "no new errors" rule).
  if (!change.ops.every((op) => NON_RULE_OPS.has(op.op)) && ctx.writes.length) {
    const before = new Set(validateState(live).errors);
    const after = validateState(working);
    const introduced = after.errors.filter((e) => !before.has(e));
    if (introduced.length) throw new ConfigError(422, { errors: introduced });
  }

  // 5. Write everything, audit it, and push the lock expiry out, atomically.
  const expiresAt = new Date(Date.now() + LOCK_TTL_MS);
  try {
    await prisma.$transaction(async (tx) => {
      for (const w of ctx.writes) {
        const model = (tx as any)[w.model];
        if (w.kind === 'create') await model.create({ data: w.data });
        else if (w.kind === 'update') await model.update({ where: { id: w.id }, data: w.data });
        else await model.delete({ where: { id: w.id } });
      }
      for (const a of ctx.audits) {
        await tx.auditEvent.create({ data: { at: new Date(), actorId: personId, systemId, action: a.action, resource: 'SCHEDULING', detail: a.detail, metaJson: JSON.stringify(a.meta) } });
      }
      await tx.configEditLock.updateMany({ where: { systemId, holderPersonId: personId }, data: { refreshedAt: new Date(), expiresAt } });
    });
  } catch (error) {
    // Two saves raced past the lock (expiry) or the partial unique indexes caught a duplicate.
    if (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'P2002') {
      throw refuse(409, 'DUPLICATE', 'That already exists. Reload the configuration and try again.');
    }
    throw error;
  }
  return { results: ctx.results, lockExpiresAt: expiresAt.toISOString() };
}
