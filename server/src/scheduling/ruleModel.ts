/**
 * The Rule layer: the ONLY place that knows how a user-facing Rule maps onto the scheduling tables.
 *
 *   "For [service(s)], [target] is scheduled [how]."
 *
 * The tables are unchanged and the engines still read them directly:
 *   CategoryServicePolicy            one row per (category, service)
 *   ChoirCategoryLink                choir -> category, plus eligibleOverride / frequencyOverride keyed by service code
 *   MusicFixedAssignment             (policy, choir[, date][, time]) designations
 *
 * Nothing here talks to the database. Both directions are pure functions of a snapshot of the tables
 * (`RuleTables`), so they are unit-tested without Prisma. `saveConfigChange` calls `planRuleOp` while it
 * applies a change to its in-memory copy of the live rows, then validates the result with the same
 * validateForGeneration as every other edit. A Rule that cannot generate is therefore refused exactly like
 * the equivalent table edit would have been.
 *
 * ── TABLES -> RULES (collapseRules) ───────────────────────────────────────────────────────────────────────
 * Only active policies of active, Music-required services are looked at.
 *
 *  1. IMPLIED DEFAULT = "no rule". A policy that is ineligible, ROTATION, with no frequency, no min/max,
 *     no requireAll, no fixed rows and no per-choir override for its service code is what the save adds
 *     automatically for every category x service pair. It is not shown.
 *  2. CATEGORY RULE. Any other policy renders as a category-targeted rule, EXCEPT a FIXED policy that has
 *     whole-service fixed rows (rule 3 covers it). Policies of one category whose values AND exceptions are
 *     identical are merged into ONE rule whose `scope` lists their services.
 *       arrangement = planningMode, min/max/requireAll/frequency = the policy columns,
 *       exceptions  = for every active link of the category: eligibleOverride[code] / frequencyOverride[code].
 *     A policy that is not eligible but is not an implied default (for example an exception re-admits a
 *     choir) shows `categoryEligible: false`.
 *  3. CHOIR RULE. Every WHOLE-SERVICE fixed row (no date, no time) renders as a choir-targeted FIXED rule.
 *     One rule per fixed choir; the services that choir is fixed on (with equal frequency) form its scope.
 *     A policy with 2 fixed choirs therefore renders as 2 choir rules that carry the same
 *     `sharedPolicyId` (the smallest backing policy id), so the UI may group them.
 *       - FIXED-mode policy: frequency = the policy's frequency (shared by every choir on that policy).
 *       - ROTATION/MANUAL policy that also has fixed rows: it ALSO renders its category rule (rule 2); the
 *         choir rule shows frequency null because the frequency belongs to the category rule.
 *  4. DATE-SPECIFIC fixed rows (serviceDate or serviceTime set) predate the Rule model and have no Rule
 *     shape. They render as read-only choir rules (`readOnly`, `dateScope`) so nothing is hidden. They can be
 *     deleted but not edited.
 *
 * IDs are not stored. They encode the backing rows, so GET -> PATCH/DELETE needs no extra table:
 *     cat~<policyId>~<policyId>...            category rule
 *     choir~<choirId>~<policyId>...           choir rule
 *     fixedrow~<fixedAssignmentId>            read-only date-specific designation
 * An id is valid for the snapshot it came from. Merging/splitting after an edit can change it; every write
 * response returns the current rule(s).
 *
 * ── RULES -> TABLES (planRuleOp) ──────────────────────────────────────────────────────────────────────────
 *  CATEGORY rule, per service in scope:
 *     CategoryServicePolicy(category, service)  <- eligible=true, planningMode=arrangement, min/max (ROTATION
 *       only), requireAll (ROTATION only), frequency* (existing row reused/reactivated, else created)
 *     exceptions: for each active link of the category, eligibleOverride[code] and frequencyOverride[code]
 *       are replaced by the rule's exception for that choir (or removed when it has none)
 *  CHOIR rule (FIXED only), per service in scope:
 *     CategoryServicePolicy(choir's category, service) <- if it is an implied default or already FIXED:
 *       eligible=true, planningMode=FIXED, frequency* ; if it is a rotation/manual rule it is left alone
 *     MusicFixedAssignment(policy, choir) <- one whole-service row
 *  DELETE category rule: each policy goes back to the implied default (and its exceptions are cleared), or, when
 *     it still has fixed rows, to FIXED with only the rotation settings cleared. A pair can never be deleted
 *     outright: every active category x service pair must keep a policy for the calendar to generate.
 *  DELETE choir rule: its fixed rows are deleted; a FIXED policy left with no fixed rows goes back to the
 *     implied default (the validator would otherwise refuse an empty fixed arrangement).
 *  UPDATE: remove the old rule's rows, apply the new rule. Rows that both sides touch are updated in place.
 *     A choir-rule PATCH only changes that choir's fixed rows; its frequency, if sent, is the policy's and is
 *     shared by the other choirs fixed on the same policy.
 *
 * Every refusal here is 422 { errors: string[] } (the validator's shape), 404 for an unknown rule, 409 for a
 * duplicate. The output is a list of ordinary ConfigOps, so reference checks, audit entries and
 * the one validation step are exactly the existing ones.
 */

import { randomUUID } from 'node:crypto';
import { ConfigError, invalid, refuse } from './configError.js';
import type { ConfigOp } from './saveConfigChange.js';
import type {
  CategoryServicePolicyView, ChoirCategoryLinkView, ChoirCategoryView, FrequencyCounting, FrequencyKind,
  FrequencyPeriod, SchedulingServiceView,
} from './types.js';

/* ─── Public shapes ─── */

export type Arrangement = 'FIXED' | 'ROTATION' | 'MANUAL';
export interface RuleFrequency { kind: FrequencyKind; target: number; period: FrequencyPeriod; counting: FrequencyCounting }
export interface RuleException { choirId: string; eligible?: boolean; frequency?: Partial<RuleFrequency> }
export type RuleTarget = { kind: 'category'; categoryId: string } | { kind: 'choir'; choirId: string };

export interface MusicRuleInput {
  scope: string[];
  target: RuleTarget;
  arrangement: Arrangement;
  minCount?: number | null;
  maxCount?: number | null;
  frequency?: RuleFrequency | null;
  requireAll?: boolean;
  exceptions?: RuleException[];
}

export interface MusicRule {
  id: string;
  scope: string[];
  target: RuleTarget;
  arrangement: Arrangement;
  minCount: number | null;
  maxCount: number | null;
  frequency: RuleFrequency | null;
  requireAll: boolean;
  exceptions: RuleException[];
  /** Choir rules only: the smallest id of the policies behind the rule. Choir rules on the same policy share it. */
  sharedPolicyId?: string;
  /** Category rules only; present (false) when the category row is ineligible but not an implied default. */
  categoryEligible?: boolean;
  /** Read-only legacy designation limited to a date and/or time. */
  dateScope?: { serviceDate: string | null; serviceTime: string | null };
  readOnly?: boolean;
}

export interface FixedRow { id: string; categoryServicePolicyId: string; choirId: string; serviceDate: string | null; serviceTime: string | null }
export interface RuleTables {
  services: SchedulingServiceView[];
  categories: ChoirCategoryView[];
  policies: CategoryServicePolicyView[];
  links: ChoirCategoryLinkView[];
  fixed: FixedRow[];
  choirs: Array<{ id: string; name: string; active: boolean }>;
}

export type RuleOp =
  | { op: 'musicRule.create'; data: MusicRuleInput }
  | { op: 'musicRule.update'; id: string; patch: Partial<MusicRuleInput> }
  | { op: 'musicRule.delete'; id: string }
  | { op: 'choir.setCategory'; choirId: string; categoryId: string | null };
type PrimitiveOp = Exclude<ConfigOp, RuleOp>;

export interface RulePlan {
  /** Ordinary table ops, in the order they must be applied. */
  ops: PrimitiveOp[];
  /** Picks the rule(s) the caller should be told about once the ops are applied. */
  locate: (rules: MusicRule[]) => MusicRule[];
}

/* ─── Small helpers ─── */

type Overrides = Record<string, unknown>;
const keyOf = (map: Overrides, code: string) => Object.keys(map).find((k) => k.toLowerCase() === code.toLowerCase());
const valueOf = (map: Overrides, code: string) => { const k = keyOf(map, code); return k === undefined ? undefined : map[k]; };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

const frequencyOf = (p: CategoryServicePolicyView): RuleFrequency | null =>
  p.frequencyTarget === null || p.frequencyTarget === undefined
    ? null
    : { kind: p.frequencyKind, target: p.frequencyTarget, period: p.frequencyPeriod as FrequencyPeriod, counting: p.frequencyCounting };

const toStoredFrequency = (f: Partial<RuleFrequency>) => Object.fromEntries(Object.entries({
  frequencyKind: f.kind, frequencyTarget: f.target, frequencyPeriod: f.period, frequencyCounting: f.counting,
}).filter(([, v]) => v !== undefined));
const fromStoredFrequency = (raw: Record<string, unknown>): Partial<RuleFrequency> => Object.fromEntries(Object.entries({
  kind: raw.frequencyKind, target: raw.frequencyTarget, period: raw.frequencyPeriod, counting: raw.frequencyCounting,
}).filter(([, v]) => v !== undefined)) as Partial<RuleFrequency>;

const DEFAULT_POLICY_PATCH = {
  eligible: false, planningMode: 'ROTATION', minCount: null, maxCount: null, requireAll: false,
  frequencyTarget: null, frequencyPeriod: null, frequencyKind: 'TARGET', frequencyCounting: 'ASSIGNMENTS',
} as const;

class Index {
  readonly service = new Map<string, SchedulingServiceView>();
  readonly category = new Map<string, ChoirCategoryView>();
  readonly choir = new Map<string, { id: string; name: string; active: boolean }>();
  readonly policy = new Map<string, CategoryServicePolicyView>();
  readonly fixedByPolicy = new Map<string, FixedRow[]>();
  constructor(readonly t: RuleTables) {
    for (const s of t.services) this.service.set(s.id, s);
    for (const c of t.categories) this.category.set(c.id, c);
    for (const c of t.choirs) this.choir.set(c.id, c);
    for (const p of t.policies) this.policy.set(p.id, p);
    for (const f of t.fixed) this.fixedByPolicy.set(f.categoryServicePolicyId, [...(this.fixedByPolicy.get(f.categoryServicePolicyId) ?? []), f]);
  }
  activeLinks(categoryId: string) { return this.t.links.filter((l) => l.active && l.categoryId === categoryId); }
  linkOfChoir(choirId: string) { return this.t.links.find((l) => l.active && l.choirId === choirId) ?? null; }
  fixedOf(policyId: string) { return this.fixedByPolicy.get(policyId) ?? []; }
  wholeFixedOf(policyId: string) { return this.fixedOf(policyId).filter((f) => !f.serviceDate && !f.serviceTime); }
  policyFor(categoryId: string, serviceId: string) {
    const rows = this.t.policies.filter((p) => p.categoryId === categoryId && p.serviceId === serviceId);
    return rows.find((p) => p.active) ?? rows[0] ?? null;
  }
  serviceName(id: string) { return this.service.get(id)?.name ?? 'that service'; }
  categoryName(id: string) { return this.category.get(id)?.name ?? 'that category'; }
  choirName(id: string) { return this.choir.get(id)?.name ?? 'that choir'; }
  serviceOrder(id: string) { const s = this.service.get(id); return [s?.displayOrder ?? 0, s?.name ?? ''] as const; }
}
const bySvc = (ix: Index) => (a: string, b: string) => {
  const [oa, na] = ix.serviceOrder(a), [ob, nb] = ix.serviceOrder(b);
  return oa - ob || na.localeCompare(nb);
};

function exceptionsOf(ix: Index, p: CategoryServicePolicyView, code: string): RuleException[] {
  const out: RuleException[] = [];
  for (const link of ix.activeLinks(p.categoryId)) {
    const eligible = valueOf(link.eligibleOverride, code);
    const freq = valueOf(link.frequencyOverride, code);
    if (typeof eligible !== 'boolean' && !freq) continue;
    const row: RuleException = { choirId: link.choirId };
    if (typeof eligible === 'boolean') row.eligible = eligible;
    if (freq && typeof freq === 'object') row.frequency = fromStoredFrequency(freq as Record<string, unknown>);
    out.push(row);
  }
  return out.sort((a, b) => a.choirId.localeCompare(b.choirId));
}

const isImpliedDefault = (ix: Index, p: CategoryServicePolicyView, code: string) =>
  !p.eligible && p.planningMode === 'ROTATION' && p.frequencyTarget === null && !p.frequencyPeriod
  && p.minCount === null && p.maxCount === null && !p.requireAll
  && ix.fixedOf(p.id).length === 0 && exceptionsOf(ix, p, code).length === 0;

/* ─── Tables -> Rules ─── */

export function collapseRules(t: RuleTables): MusicRule[] {
  const ix = new Index(t);
  const order = bySvc(ix);
  const categoryGroups = new Map<string, { base: Omit<MusicRule, 'id' | 'scope'>; policies: CategoryServicePolicyView[] }>();
  const choirGroups = new Map<string, { choirId: string; frequency: RuleFrequency | null; policies: CategoryServicePolicyView[] }>();
  const readOnly: MusicRule[] = [];

  for (const p of t.policies.filter((row) => row.active)) {
    const s = ix.service.get(p.serviceId);
    if (!s || !s.active || !s.musicRequired) continue;
    const whole = ix.wholeFixedOf(p.id);
    const fixedOnly = p.planningMode === 'FIXED' && whole.length > 0;

    if (!fixedOnly && !isImpliedDefault(ix, p, s.code)) {
      const base: Omit<MusicRule, 'id' | 'scope'> = {
        target: { kind: 'category', categoryId: p.categoryId },
        arrangement: p.planningMode as Arrangement,
        minCount: p.minCount, maxCount: p.maxCount, frequency: frequencyOf(p), requireAll: p.requireAll,
        exceptions: exceptionsOf(ix, p, s.code),
        ...(p.eligible ? {} : { categoryEligible: false }),
      };
      const key = JSON.stringify(base);
      const group = categoryGroups.get(key) ?? { base, policies: [] };
      group.policies.push(p);
      categoryGroups.set(key, group);
    }
    for (const f of whole) {
      const frequency = p.planningMode === 'FIXED' ? frequencyOf(p) : null;
      const key = `${f.choirId}|${JSON.stringify(frequency)}`;
      const group = choirGroups.get(key) ?? { choirId: f.choirId, frequency, policies: [] };
      group.policies.push(p);
      choirGroups.set(key, group);
    }
    for (const f of ix.fixedOf(p.id).filter((row) => row.serviceDate || row.serviceTime)) {
      readOnly.push({
        id: `fixedrow~${f.id}`, scope: [p.serviceId], target: { kind: 'choir', choirId: f.choirId }, arrangement: 'FIXED',
        minCount: null, maxCount: null, frequency: null, requireAll: false, exceptions: [],
        sharedPolicyId: p.id, dateScope: { serviceDate: f.serviceDate, serviceTime: f.serviceTime }, readOnly: true,
      });
    }
  }

  const categoryRules: MusicRule[] = [...categoryGroups.values()].map(({ base, policies }) => {
    const sorted = [...policies].sort((a, b) => order(a.serviceId, b.serviceId));
    return { ...base, id: `cat~${policies.map((p) => p.id).sort().join('~')}`, scope: sorted.map((p) => p.serviceId) };
  });
  const choirRules: MusicRule[] = [...choirGroups.values()].map(({ choirId, frequency, policies }) => {
    const sorted = [...policies].sort((a, b) => order(a.serviceId, b.serviceId));
    const ids = policies.map((p) => p.id).sort();
    return {
      id: `choir~${choirId}~${ids.join('~')}`, scope: sorted.map((p) => p.serviceId), target: { kind: 'choir', choirId },
      arrangement: 'FIXED', minCount: null, maxCount: null, frequency, requireAll: false, exceptions: [], sharedPolicyId: ids[0],
    } as MusicRule;
  });

  const label = (r: MusicRule) => r.target.kind === 'category' ? ix.categoryName(r.target.categoryId) : ix.choirName(r.target.choirId);
  const sortRules = (rows: MusicRule[]) => rows.sort((a, b) => label(a).localeCompare(label(b)) || order(a.scope[0] ?? '', b.scope[0] ?? ''));
  return [...sortRules(categoryRules), ...sortRules(choirRules), ...sortRules(readOnly)];
}

/** Active choirs with the one category they belong to (null = Unassigned). */
export function collapseChoirs(t: RuleTables): Array<{ id: string; name: string; active: boolean; categoryId: string | null }> {
  return t.choirs.map((c) => ({ id: c.id, name: c.name, active: c.active, categoryId: t.links.find((l) => l.active && l.choirId === c.id)?.categoryId ?? null }))
    .sort(byName);
}

/* ─── Rules -> Tables ─── */

interface Plan {
  newPolicies: Array<{ id: string; categoryId: string; serviceId: string; patch: Record<string, unknown> }>;
  policyPatch: Map<string, Record<string, unknown>>;
  fixedDelete: Set<string>;
  fixedAdd: Array<{ policyId: string; choirId: string }>;
  linkMaps: Map<string, { eligible: Overrides; frequency: Overrides }>;
  touched: Set<string>;
}
const newPlan = (): Plan => ({ newPolicies: [], policyPatch: new Map(), fixedDelete: new Set(), fixedAdd: [], linkMaps: new Map(), touched: new Set() });

function patchPolicy(plan: Plan, id: string, patch: Record<string, unknown>) {
  plan.policyPatch.set(id, { ...(plan.policyPatch.get(id) ?? {}), ...patch });
  plan.touched.add(id);
}
function ensurePolicy(plan: Plan, ix: Index, newId: () => string, categoryId: string, serviceId: string): string {
  const created = plan.newPolicies.find((n) => n.categoryId === categoryId && n.serviceId === serviceId);
  if (created) return created.id;
  const existing = ix.policyFor(categoryId, serviceId);
  if (existing) {
    if (!existing.active) patchPolicy(plan, existing.id, { active: true });
    plan.touched.add(existing.id);
    return existing.id;
  }
  const id = newId();
  plan.newPolicies.push({ id, categoryId, serviceId, patch: {} });
  plan.touched.add(id);
  return id;
}
function setPolicy(plan: Plan, id: string, patch: Record<string, unknown>) {
  const created = plan.newPolicies.find((n) => n.id === id);
  if (created) { Object.assign(created.patch, patch); return; }
  patchPolicy(plan, id, patch);
}
function linkMaps(plan: Plan, link: ChoirCategoryLinkView) {
  let maps = plan.linkMaps.get(link.id);
  if (!maps) {
    maps = { eligible: { ...link.eligibleOverride }, frequency: { ...link.frequencyOverride } };
    plan.linkMaps.set(link.id, maps);
  }
  return maps;
}
function clearCode(plan: Plan, ix: Index, categoryId: string, code: string) {
  for (const link of ix.activeLinks(categoryId)) {
    const maps = linkMaps(plan, link);
    for (const map of [maps.eligible, maps.frequency]) { const k = keyOf(map, code); if (k !== undefined) delete map[k]; }
  }
}
function setException(plan: Plan, link: ChoirCategoryLinkView, code: string, ex: RuleException) {
  const maps = linkMaps(plan, link);
  if (typeof ex.eligible === 'boolean') maps.eligible[keyOf(maps.eligible, code) ?? code] = ex.eligible;
  if (ex.frequency && Object.keys(ex.frequency).length) maps.frequency[keyOf(maps.frequency, code) ?? code] = toStoredFrequency(ex.frequency);
}

interface Normalized {
  scope: string[]; target: RuleTarget; arrangement: Arrangement; minCount: number | null; maxCount: number | null;
  frequency: RuleFrequency | null; requireAll: boolean; exceptions: RuleException[];
}

function normalize(ix: Index, input: MusicRuleInput): Normalized {
  const scope = [...new Set(input.scope)];
  if (!scope.length) throw invalid('Choose at least one service.');
  for (const id of scope) {
    const s = ix.service.get(id);
    if (!s) throw invalid('One of the chosen services is not in the calendar.');
    if (!s.active || !s.musicRequired) throw invalid(`${s.name} is not an active service that needs Music, so it cannot have a rule.`);
  }
  if (input.target.kind === 'category') {
    if (input.arrangement === 'FIXED') throw invalid('A Fixed rule names specific choirs. Choose “A specific choir”, or choose Rotation or Manual for a whole category.');
  } else {
    if (input.arrangement !== 'FIXED') throw invalid('A rule for a specific choir can only be Fixed. To rotate a choir, use its category and add an exception for the choir.');
    if (input.exceptions?.length) throw invalid('Per-choir exceptions only apply to a rule for a whole category.');
  }
  const rotation = input.arrangement === 'ROTATION';
  return {
    scope, target: input.target, arrangement: input.arrangement,
    minCount: rotation ? input.minCount ?? null : null, maxCount: rotation ? input.maxCount ?? null : null,
    frequency: input.frequency ?? null, requireAll: rotation ? !!input.requireAll : false,
    exceptions: (input.exceptions ?? []).filter((e) => typeof e.eligible === 'boolean' || (e.frequency && Object.keys(e.frequency).length)),
  };
}

const asInput = (r: MusicRule): MusicRuleInput => ({
  scope: r.scope, target: r.target, arrangement: r.arrangement, minCount: r.minCount, maxCount: r.maxCount,
  frequency: r.frequency, requireAll: r.requireAll, exceptions: r.exceptions,
});

/** Rows behind a rule, decoded from its id, restricted to rows that still exist. */
function backing(ix: Index, rule: MusicRule): { policies: CategoryServicePolicyView[] } {
  return { policies: rule.id.split('~').slice(rule.target.kind === 'choir' ? 2 : 1).map((id) => ix.policy.get(id)).filter((p): p is CategoryServicePolicyView => !!p) };
}

/** Give a rule's rows back. `keep` lists pairs the incoming rule will rewrite itself, so they are not reset first. */
function removeRule(plan: Plan, ix: Index, old: MusicRule, keep: Set<string>) {
  const { policies } = backing(ix, old);
  if (old.target.kind === 'category') {
    for (const p of policies) {
      if (keep.has(`${p.categoryId}|${p.serviceId}`)) continue;
      const code = ix.service.get(p.serviceId)?.code ?? '';
      const hasFixed = ix.fixedOf(p.id).length > 0;
      patchPolicy(plan, p.id, hasFixed
        ? { planningMode: 'FIXED', minCount: null, maxCount: null, requireAll: false, frequencyTarget: null, frequencyPeriod: null, frequencyKind: 'TARGET', frequencyCounting: 'ASSIGNMENTS' }
        : { ...DEFAULT_POLICY_PATCH });
      clearCode(plan, ix, p.categoryId, code);
    }
    return;
  }
  const choirId = old.target.choirId;
  for (const p of policies) {
    if (keep.has(`${choirId}|${p.serviceId}`)) continue;
    plan.touched.add(p.id);
    for (const f of ix.wholeFixedOf(p.id).filter((row) => row.choirId === choirId)) plan.fixedDelete.add(f.id);
  }
}

function applyRule(plan: Plan, ix: Index, newId: () => string, d: Normalized, replacing: MusicRule | null) {
  const own = new Set(replacing ? backing(ix, replacing).policies.map((p) => p.id) : []);
  if (d.target.kind === 'category') {
    const category = ix.category.get(d.target.categoryId);
    if (!category) throw invalid('Choose a choir category.');
    if (!category.active) throw invalid(`${category.name} is not active, so it cannot have rules. Activate the category first.`);
    for (const serviceId of d.scope) {
      const existing = ix.policyFor(category.id, serviceId);
      const code = ix.service.get(serviceId)!.code;
      if (existing && existing.active && !own.has(existing.id) && !isImpliedDefault(ix, existing, code)) {
        throw new ConfigError(409, { code: 'DUPLICATE', error: `${category.name} already has a rule for ${ix.serviceName(serviceId)}. Edit that rule instead.`, errors: [`${category.name} already has a rule for ${ix.serviceName(serviceId)}. Edit that rule instead.`] });
      }
      const id = ensurePolicy(plan, ix, newId, category.id, serviceId);
      const f = d.frequency;
      setPolicy(plan, id, {
        eligible: true, planningMode: d.arrangement, minCount: d.minCount, maxCount: d.maxCount, requireAll: d.requireAll,
        frequencyTarget: f?.target ?? null, frequencyKind: f?.kind ?? 'TARGET', frequencyPeriod: f?.period ?? null, frequencyCounting: f?.counting ?? 'ASSIGNMENTS',
      });
      // Exceptions are fully specified by the rule: wipe this code from every link of the category, then write them.
      clearCode(plan, ix, category.id, code);
    }
    for (const ex of d.exceptions) {
      const link = ix.activeLinks(category.id).find((l) => l.choirId === ex.choirId);
      if (!link) throw invalid(`${ix.choirName(ex.choirId)} is not in ${category.name}, so it cannot be an exception to this rule.`);
      for (const serviceId of d.scope) setException(plan, link, ix.service.get(serviceId)!.code, ex);
    }
    return;
  }
  const choir = ix.choir.get(d.target.choirId);
  if (!choir) throw invalid('Choose a choir.');
  if (!choir.active) throw invalid(`${choir.name} is not active, so it cannot be fixed on a service.`);
  const link = ix.linkOfChoir(choir.id);
  if (!link) throw invalid(`${choir.name} has no category yet. Choose one on the Choirs tab first.`);
  for (const serviceId of d.scope) {
    const code = ix.service.get(serviceId)!.code;
    if (valueOf(link.eligibleOverride, code) === false) {
      throw invalid(`${choir.name} is excluded from ${ix.serviceName(serviceId)} by an exception on its category. Remove that exception first.`);
    }
    const existing = ix.policyFor(link.categoryId, serviceId);
    const ownsIt = !!existing && own.has(existing.id);
    const id = ensurePolicy(plan, ix, newId, link.categoryId, serviceId);
    const asDefault = !existing || !existing.active || existing.planningMode === 'FIXED' || ownsIt || isImpliedDefault(ix, existing, code);
    if (asDefault) {
      const f = d.frequency;
      setPolicy(plan, id, {
        eligible: true, planningMode: 'FIXED', minCount: null, maxCount: null, requireAll: false,
        frequencyTarget: f?.target ?? null, frequencyKind: f?.kind ?? 'TARGET', frequencyPeriod: f?.period ?? null, frequencyCounting: f?.counting ?? 'ASSIGNMENTS',
      });
    } else if (d.frequency) {
      throw invalid(`${ix.serviceName(serviceId)} is rotated for ${ix.categoryName(link.categoryId)}. Set its frequency on the category rule, not on a fixed choir.`);
    }
    const have = existing ? ix.wholeFixedOf(existing.id).find((f) => f.choirId === choir.id) : undefined;
    if (!have || plan.fixedDelete.has(have.id)) plan.fixedAdd.push({ policyId: id, choirId: choir.id });
  }
}

/** A FIXED policy with no fixed rows left is refused by the validator: hand it back as the implied default. */
function finalize(plan: Plan, ix: Index) {
  for (const id of plan.touched) {
    const created = plan.newPolicies.find((n) => n.id === id);
    const policy = ix.policy.get(id);
    const mode = (created?.patch.planningMode ?? plan.policyPatch.get(id)?.planningMode ?? policy?.planningMode) as string | undefined;
    if (mode !== 'FIXED') continue;
    const kept = ix.fixedOf(id).filter((f) => !plan.fixedDelete.has(f.id)).length + plan.fixedAdd.filter((a) => a.policyId === id).length;
    if (kept > 0) continue;
    setPolicy(plan, id, { ...DEFAULT_POLICY_PATCH });
    if (policy) clearCode(plan, ix, policy.categoryId, ix.service.get(policy.serviceId)?.code ?? '');
  }
}

function emit(plan: Plan, ix: Index): PrimitiveOp[] {
  const ops: PrimitiveOp[] = [];
  for (const n of plan.newPolicies) ops.push({ op: 'policy.create', data: { id: n.id, categoryId: n.categoryId, serviceId: n.serviceId, ...n.patch } as never });
  for (const [id, patch] of plan.policyPatch) {
    const current = ix.policy.get(id);
    const changed = current ? Object.fromEntries(Object.entries(patch).filter(([k, v]) => !same((current as unknown as Record<string, unknown>)[k], v))) : patch;
    if (Object.keys(changed).length && !plan.newPolicies.some((n) => n.id === id)) ops.push({ op: 'policy.update', id, patch: changed as never });
  }
  for (const id of plan.fixedDelete) ops.push({ op: 'fixed.delete', id });
  for (const a of plan.fixedAdd) ops.push({ op: 'fixed.create', data: { categoryServicePolicyId: a.policyId, choirId: a.choirId } });
  for (const [linkId, maps] of plan.linkMaps) {
    const link = ix.t.links.find((l) => l.id === linkId)!;
    if (same(maps.eligible, link.eligibleOverride) && same(maps.frequency, link.frequencyOverride)) continue;
    ops.push({ op: 'link.update', id: linkId, patch: { eligibleOverride: maps.eligible as never, frequencyOverride: maps.frequency as never } });
  }
  return ops;
}

const pairKeys = (d: Normalized): Set<string> => {
  if (d.target.kind === 'category') return new Set(d.scope.map((s) => `${(d.target as { categoryId: string }).categoryId}|${s}`));
  return new Set(d.scope.map((s) => `${(d.target as { choirId: string }).choirId}|${s}`));
};

const locator = (target: RuleTarget, scope: string[]) => (rules: MusicRule[]) =>
  rules.filter((r) => same(r.target, target) && scope.every((s) => r.scope.includes(s)));

/* ─── Entry point ─── */

export function planRuleOp(t: RuleTables, change: RuleOp, newId: () => string = randomUUID): RulePlan {
  const ix = new Index(t);
  const find = (id: string): MusicRule => {
    const rule = collapseRules(t).find((r) => r.id === id);
    if (!rule) throw refuse(404, 'NOT_FOUND', 'Rule not found. It may have been changed; reload the rules.');
    return rule;
  };
  const plan = newPlan();

  switch (change.op) {
    case 'musicRule.create': {
      const d = normalize(ix, change.data);
      applyRule(plan, ix, newId, d, null);
      finalize(plan, ix);
      return { ops: emit(plan, ix), locate: locator(d.target, d.scope) };
    }
    case 'musicRule.update': {
      const old = find(change.id);
      if (old.readOnly) throw refuse(400, 'READ_ONLY', 'A designation limited to a date or time cannot be edited. Delete it and add a new rule.');
      const d = normalize(ix, { ...asInput(old), ...change.patch });
      removeRule(plan, ix, old, pairKeys(d));
      applyRule(plan, ix, newId, d, old);
      finalize(plan, ix);
      return { ops: emit(plan, ix), locate: locator(d.target, d.scope) };
    }
    case 'musicRule.delete': {
      const old = find(change.id);
      if (old.readOnly) {
        plan.fixedDelete.add(old.id.slice('fixedrow~'.length));
        plan.touched.add(old.sharedPolicyId!);
      } else removeRule(plan, ix, old, new Set());
      finalize(plan, ix);
      return { ops: emit(plan, ix), locate: () => [] };
    }
    case 'choir.setCategory': {
      const choir = ix.choir.get(change.choirId);
      if (!choir) throw refuse(404, 'NOT_FOUND', 'Choir not found');
      if (!change.categoryId) throw refuse(400, 'BAD_INPUT', 'Choose a category. To take a choir out of scheduling, make it inactive in the Choir register.');
      const category = ix.category.get(change.categoryId);
      if (!category || !category.active) throw invalid('Choose an active choir category.');
      const link = ix.linkOfChoir(choir.id);
      if (!link) return { ops: [{ op: 'link.create', data: { choirId: choir.id, categoryId: category.id } }], locate: () => [] };
      if (link.categoryId === category.id) return { ops: [], locate: () => [] };
      const fixed = t.fixed.some((f) => f.choirId === choir.id);
      if (fixed) throw new ConfigError(409, { code: 'CHOIR_HAS_FIXED_RULES', error: `${choir.name} is fixed on a service. Remove its fixed rules before moving it to another category.`, errors: [`${choir.name} is fixed on a service. Remove its fixed rules before moving it to another category.`] });
      // Exceptions belong to the category's rules, so they do not travel with the choir.
      return { ops: [{ op: 'link.update', id: link.id, patch: { categoryId: category.id, eligibleOverride: {}, frequencyOverride: {} } }], locate: () => [] };
    }
  }
}
