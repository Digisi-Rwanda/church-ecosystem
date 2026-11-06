# Four sections: Services, Choir categories, Choirs, Rules

Music setup now shows four tabs. A **Rule** is the only scheduling concept in them. The tables behind it (`CategoryServicePolicy`, `ChoirCategoryLink` overrides, `MusicFixedAssignment`) are unchanged and the engines read them as before.

**Tests:** the 12 server tests (10 Rule API, 2 frozen-month) pass, 7 pure UI-helper tests pass, 7 API-client tests pass. The front-end files type-check with `tsc --strict` against stubs for the modules I could not see (`kit`, `useLoad`, `LoadState`, i18n provider). **Not run:** Prisma-generated types, a real database, and the UI in a browser. I never saw your `kit.tsx` or CSS, so `SidePanel`, `ConfirmDialog` and the new `schedulingConfig.css` are written against the signatures visible in `MonthPlanPage.tsx`.

**One naming change to confirm.** `server/src/scheduling/rules.ts` already exists in your repo (it exports `canWriteConfig` / `canReadConfig`; `saveConfigChange.ts` and `configRouter.ts` import it). Overwriting it would break both, so the Rule layer is `server/src/scheduling/ruleModel.ts`. Say if you want it moved.

The previous session's config-versioning removal is in the tree this builds on (`saveConfigChange`, edit lock, frozen guards). Nothing from it was re-opened.

---

## 1. The expansion layer

### `server/src/scheduling/ruleModel.ts`
_Rule <-> tables, both directions, pure functions; the mapping is documented in the file header._

```ts
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
```

### `server/src/scheduling/configError.ts`
_ConfigError moved out of saveConfigChange so ruleModel and saveConfigChange share it without a runtime import cycle._

```ts
/**
 * The one error every scheduling-config refusal is thrown as. Lives in its own module so `ruleModel.ts`
 * (the Rule expansion layer) and `saveConfigChange.ts` can both use it without importing each other at runtime.
 * `saveConfigChange.ts` re-exports these, so existing imports keep working.
 */

/** Thrown for every refusal. The router turns it into the HTTP response unchanged. */
export class ConfigError extends Error {
  constructor(public readonly status: number, public readonly body: Record<string, unknown>) {
    super(String(body.error ?? body.message ?? (Array.isArray(body.errors) ? body.errors[0] : undefined) ?? 'Configuration change refused'));
  }
}

export const refuse = (status: number, code: string, error: string) => new ConfigError(status, { error, code });

/** A refusal in the validator's own shape: 422 { errors: string[] }. The Rule API uses it for every rule-level problem. */
export const invalid = (...errors: string[]) => new ConfigError(422, { errors });
```

## 2. The router

### `server/src/routes/configRules.ts`
_GET/POST/PATCH/DELETE /config/rules plus the Choirs-tab endpoints; every write is a ConfigOp handed to saveConfigChange._

```ts
/**
 * Rules as an API resource (Music only). The rest of the app speaks Rules; only `scheduling/ruleModel.ts`
 * knows which tables sit behind them.
 *
 *   GET    /api/scheduling/config/rules              every rule, expanded from the tables (+ warnings)
 *   POST   /api/scheduling/config/rules              create a rule
 *   PATCH  /api/scheduling/config/rules/:id          change a rule     body { patch }
 *   DELETE /api/scheduling/config/rules/:id          remove a rule (needs the edit lock, like every write)
 *   GET    /api/scheduling/config/choirs             choirs with their one category (null = Unassigned)
 *   PUT    /api/scheduling/config/choirs/:id/category   body { categoryId }
 *
 * EVERY write goes through `saveConfigChange`: SCHEDULING W check (403), edit lock (409 LOCKED), reference
 * checks, the full generation validator (422 { errors }), one transaction with audit entries. This file builds
 * a ConfigOp and maps the refusal to HTTP; it never touches a table.
 *
 * Mounted from scheduling/configRouter.ts (`configRouter.use(configRulesRouter)`), so the paths above sit
 * beside the other /config routes and share their auth.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthedRequest, pathParam } from '../middleware/http.js';
import { loadAccessData } from '../notifications/feed.js';
import { canReadConfig } from '../scheduling/rules.js';
import { FrequencyPeriodSchema } from '../scheduling/musicConfigRules.js';
import { ConfigError, MUSIC_SYSTEM, readRuleModel, saveConfigChange, type ConfigOp } from '../scheduling/saveConfigChange.js';

export const configRulesRouter = Router();

type Res = import('express').Response;
const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code, errors: [error] });
const Id = z.string().min(1);
const Count = z.number().int().nonnegative();

const Frequency = z.object({
  kind: z.enum(['MINIMUM', 'TARGET', 'MAXIMUM']),
  target: z.number().int().positive(),
  period: FrequencyPeriodSchema,
  counting: z.enum(['ASSIGNMENTS', 'DISTINCT_DATES']).default('ASSIGNMENTS'),
}).strict();

const Exception = z.object({
  choirId: Id,
  eligible: z.boolean().optional(),
  frequency: z.object({
    kind: z.enum(['MINIMUM', 'TARGET', 'MAXIMUM']).optional(),
    target: z.number().int().positive().optional(),
    period: FrequencyPeriodSchema.optional(),
    counting: z.enum(['ASSIGNMENTS', 'DISTINCT_DATES']).optional(),
  }).strict().optional(),
}).strict();

export const RuleSchema = z.object({
  scope: z.array(Id).min(1).max(40),
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('category'), categoryId: Id }).strict(),
    z.object({ kind: z.literal('choir'), choirId: Id }).strict(),
  ]),
  arrangement: z.enum(['FIXED', 'ROTATION', 'MANUAL']),
  minCount: Count.nullable().optional(),
  maxCount: Count.nullable().optional(),
  frequency: Frequency.nullable().optional(),
  requireAll: z.boolean().optional(),
  exceptions: z.array(Exception).max(200).optional(),
});

async function readGate(req: AuthedRequest, res: Res): Promise<boolean> {
  const me = req.auth!.personId;
  if (!canReadConfig(me, MUSIC_SYSTEM, (await loadAccessData(me)).data)) { fail(res, 404, 'NOT_FOUND', 'Not found'); return false; }
  return true;
}

async function save(req: AuthedRequest, res: Res, op: ConfigOp, created = false) {
  try {
    const { results } = await saveConfigChange(MUSIC_SYSTEM, req.auth!.personId, { ops: [op] });
    const main = results.find((r) => r.op === op.op);
    return res.status(created ? 201 : 200).json({ ok: true, status: main?.status, rules: Array.isArray(main?.row) ? main!.row : [] });
  } catch (error) {
    if (error instanceof ConfigError) return res.status(error.status).json(error.body);
    throw error;
  }
}

configRulesRouter.get('/config/rules', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await readGate(req, res))) return;
  const { rules, warnings } = await readRuleModel();
  res.json({ rules, warnings });
});

configRulesRouter.get('/config/choirs', requireAuth, async (req: AuthedRequest, res) => {
  if (!(await readGate(req, res))) return;
  res.json({ choirs: (await readRuleModel()).choirs });
});

configRulesRouter.post('/config/rules', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = RuleSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the rule fields');
  return save(req, res, { op: 'musicRule.create', data: parsed.data }, true);
});

configRulesRouter.patch('/config/rules/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = pathParam(req, 'id');
  const parsed = z.object({ patch: RuleSchema.partial() }).safeParse(req.body);
  if (!id || !parsed.success) return fail(res, 400, 'BAD_INPUT', 'Check the rule fields');
  return save(req, res, { op: 'musicRule.update', id, patch: parsed.data.patch });
});

configRulesRouter.delete('/config/rules/:id', requireAuth, async (req: AuthedRequest, res) => {
  const id = pathParam(req, 'id');
  if (!id) return fail(res, 400, 'BAD_INPUT', 'Invalid rule id');
  return save(req, res, { op: 'musicRule.delete', id });
});

configRulesRouter.put('/config/choirs/:id/category', requireAuth, async (req: AuthedRequest, res) => {
  const choirId = pathParam(req, 'id');
  const parsed = z.object({ categoryId: Id.nullable() }).safeParse(req.body);
  if (!choirId || !parsed.success) return fail(res, 400, 'BAD_INPUT', 'Choose a category');
  return save(req, res, { op: 'choir.setCategory', choirId, categoryId: parsed.data.categoryId });
});
```

### `server/src/scheduling/configRouter.ts (diff)`
_One line mounts the rules router beside the other /config routes._

```diff
--- a/server/src/scheduling/configRouter.ts
+++ b/server/src/scheduling/configRouter.ts
@@ -12,6 +12,8 @@
  *   POST   /api/scheduling/config/availability       DELETE .../:id        record / clear unavailability
  *   POST   /api/scheduling/config/protocol/rules     PATCH .../:id         Protocol team rules
  *   POST   /api/scheduling/config/protocol/policy    PATCH .../:id         Protocol duty policy
+ *   GET|POST|PATCH|DELETE /api/scheduling/config/rules                Rules (see routes/configRules.ts)
+ *   GET /config/choirs, PUT /config/choirs/:id/category               Choirs tab (same file)
  *   POST   /api/scheduling/config/lock               take the edit lock
  *   POST   /api/scheduling/config/lock/refresh       keep it alive
  *   DELETE /api/scheduling/config/lock               give it up
@@ -36,6 +38,7 @@
   EligibleOverrideSchema, FrequencyOverrideSchema, FrequencyPeriodSchema,
 } from './musicConfigRules.js';
 import { toCategoryView, toDutyPolicyView, toLinkView, toPolicyView, toRuleView, toServiceView } from './store.js';
+import { configRulesRouter } from '../routes/configRules.js';
 import { acquireEditLock, refreshEditLock, releaseEditLock } from './editLock.js';
 import {
   ConfigError, MUSIC_SYSTEM, PROTOCOL_SYSTEM, saveConfigChange, validateLiveConfig,
@@ -43,6 +46,7 @@
 } from './saveConfigChange.js';
 
 export const configRouter = Router();
+configRouter.use(configRulesRouter); // Rules + Choirs tab endpoints (routes/configRules.ts)
 
 type Res = import('express').Response;
 const fail = (res: Res, status: number, code: string, error: string) => res.status(status).json({ error, code });
```

## 3. `saveConfigChange` diff

### `server/src/scheduling/saveConfigChange.ts (diff)`
_New ops dispatch to the Rule layer; the validation call is untouched._

```diff
--- a/server/src/scheduling/saveConfigChange.ts
+++ b/server/src/scheduling/saveConfigChange.ts
@@ -30,6 +30,8 @@
 import { buildMusicCalendar } from '../music/engine.js';
 import { checkEditLock, LOCK_TTL_MS, type LockHolder } from './editLock.js';
 import { canWriteConfig } from './rules.js';
+import { ConfigError, refuse } from './configError.js';
+import { collapseRules, collapseChoirs, planRuleOp, type RuleOp, type RuleTables } from './ruleModel.js';
 import { isMusicChoirEligible, validatePolicyValues } from './musicConfigRules.js';
 import { toCategoryView, toDutyPolicyView, toLinkView, toPolicyView, toRuleView, toServiceView } from './store.js';
 import { parseJson, stringifyJson } from './types.js';
@@ -60,7 +62,9 @@
   | { op: 'rule.create'; data: RuleInput }
   | { op: 'rule.update'; id: string; patch: Partial<RuleInput> }
   | { op: 'duty.create'; data: DutyInput }
-  | { op: 'duty.update'; id: string; patch: Partial<DutyInput> };
+  | { op: 'duty.update'; id: string; patch: Partial<DutyInput> }
+  /** Rule layer (ruleModel.ts): expanded into the table ops above, then validated like any other edit. */
+  | RuleOp;
 
 export interface ServiceInput {
   code: string; name: string; kind?: string; weekday?: number | null; time?: string | null; recurrence?: string;
@@ -69,6 +73,7 @@
 }
 export interface CategoryInput { code: string; name: string; description?: string; active?: boolean }
 export interface PolicyInput {
+  id?: string; // set only by the Rule layer, so a fixed row can point at a policy created in the same batch
   categoryId: string; serviceId: string; eligible?: boolean; active?: boolean; frequencyTarget?: number | null;
   frequencyCounting?: string; frequencyKind?: string; frequencyPeriod?: string | null; planningMode?: string;
   minCount?: number | null; maxCount?: number | null; requireAll?: boolean;
@@ -106,13 +111,7 @@
   row: unknown;
 }
 
-/** Thrown for every refusal. The router turns it into the HTTP response unchanged. */
-export class ConfigError extends Error {
-  constructor(public readonly status: number, public readonly body: Record<string, unknown>) {
-    super(String(body.error ?? body.message ?? 'Configuration change refused'));
-  }
-}
-const refuse = (status: number, code: string, error: string) => new ConfigError(status, { error, code });
+export { ConfigError }; // moved to configError.ts so ruleModel.ts can share it; existing imports keep working
 
 /* ─── Working state ─── */
 
@@ -186,7 +185,7 @@
 });
 const categoryFields = (p: Partial<CategoryInput>) => defined({ code: p.code, name: p.name, description: p.description, active: p.active });
 const policyFields = (p: Partial<PolicyInput>) => defined({
-  categoryId: p.categoryId, serviceId: p.serviceId, eligible: p.eligible, active: p.active, frequencyTarget: p.frequencyTarget,
+  id: p.id, categoryId: p.categoryId, serviceId: p.serviceId, eligible: p.eligible, active: p.active, frequencyTarget: p.frequencyTarget,
   frequencyCounting: p.frequencyCounting, frequencyKind: p.frequencyKind, frequencyPeriod: p.frequencyPeriod,
   planningMode: p.planningMode, minCount: p.minCount, maxCount: p.maxCount, requireAll: p.requireAll,
 });
@@ -294,6 +293,16 @@
   return null;
 }
 
+/** The live rows as the plain snapshot the Rule layer reads (ruleModel.ts). */
+export function tablesOf(s: State): RuleTables {
+  return {
+    services: s.services.map(toServiceView), categories: s.categories.map(toCategoryView),
+    policies: s.policies.map(toPolicyView), links: s.links.map(toLinkView),
+    fixed: s.fixed.map((f) => ({ id: f.id, categoryServicePolicyId: f.categoryServicePolicyId, choirId: f.choirId, serviceDate: f.serviceDate ?? null, serviceTime: f.serviceTime ?? null })),
+    choirs: s.choirs.map((c) => ({ id: c.id, name: c.name, active: c.active })),
+  };
+}
+
 const needSystem = (ctx: Ctx, system: string, what: string) => {
   if (ctx.state.system !== system) throw refuse(400, 'BAD_INPUT', `${what} belong to ${system}`);
 };
@@ -522,6 +531,18 @@
       ctx.audits.push({ action: 'MUSIC_UNAVAILABILITY_CLEARED', detail: `Cleared choir unavailability for ${row.serviceDate}`, meta: { availabilityId: row.id, choirId: row.choirId, serviceDate: row.serviceDate, serviceCode: row.serviceCode } });
       return;
     }
+    /* Rules and choir categories: expanded into the ops above (the only code that knows the tables behind a Rule). */
+    case 'musicRule.create': case 'musicRule.update': case 'musicRule.delete': case 'choir.setCategory': {
+      needSystem(ctx, MUSIC_SYSTEM, 'Music rules');
+      const plan = planRuleOp(tablesOf(s), change);
+      for (const op of plan.ops) applyOp(ctx, op);
+      const rules = plan.locate(collapseRules(tablesOf(s)));
+      ctx.results.push({
+        op: change.op, row: rules,
+        status: change.op === 'musicRule.create' ? 'CREATED' : change.op === 'musicRule.delete' ? 'DELETED' : 'UPDATED',
+      });
+      return;
+    }
     /* Protocol */
     case 'rule.create': {
       needSystem(ctx, PROTOCOL_SYSTEM, 'Protocol rules');
@@ -587,6 +608,17 @@
   return validateState(await loadState(systemId));
 }
 
+/** Read model for GET /config/rules and /config/choirs. */
+export async function readRuleModel() {
+  const tables = tablesOf(await loadState(MUSIC_SYSTEM));
+  const choirs = collapseChoirs(tables);
+  return {
+    rules: collapseRules(tables),
+    choirs,
+    warnings: choirs.filter((c) => c.active && !c.categoryId).map((c) => ({ code: 'CHOIR_UNASSIGNED', choirId: c.id, message: `${c.name} has no category yet. Assign one on the Choirs tab.` })),
+  };
+}
+
 /* ─── The write path ─── */
 
 export interface SaveOutcome { results: ChangeResult[]; lockExpiresAt: string }
```

**On "snapshot builder change only":** `validateState` (the snapshot builder) and step 4 of `saveConfigChange` (the validation call) have **zero changed lines**. They did not need to change: a Rule op is expanded into ordinary table ops against the same in-memory copy of the live rows, so the snapshot the validator sees is already the post-expansion one. The diff above is only the op dispatch, a `tablesOf` read helper, an optional `id` on `PolicyInput` (so a fixed row can point at a policy created in the same batch), and the `ConfigError` move.

---

## 4. The UI

### `src/newdesign/SchedulingConfigEditors.tsx`
_Four Music editors (Services, Choir categories, Choirs, Rules + dialog) and the unchanged Protocol editors, in one file._

```tsx
/**
 * Scheduling configuration editors.
 *
 * Music setup is FOUR sections: Services, Choir categories, Choirs, Rules. A Rule is the only scheduling
 * concept a person sees ("For [services], [target] is scheduled [how]"). The tables behind it (policies, choir
 * links, overrides, fixed designations) are handled by the server; nothing here names them.
 * Protocol keeps its own two editors (team rules, duty limits).
 *
 * Configuration is live: every save applies at once and is picked up by the next generate call.
 */
import { useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { preserveRelaxableKinds, schedulingError } from './schedulingForms';
import { SchedulingSetupContext } from './SchedulingSetupContext';
import { ApiError } from '../api/client';
import {
  addMusicAvailability,
  createChoirCategory,
  createMusicRule,
  createProtocolDutyPolicy,
  createProtocolServiceRule,
  createSchedulingService,
  deleteMusicRule,
  fetchChoirCategories,
  fetchConfigChoirs,
  fetchMusicAvailability,
  fetchMusicRules,
  fetchProtocolDutyPolicy,
  fetchProtocolServiceRules,
  fetchSchedulingServices,
  removeMusicAvailability,
  retireSchedulingService,
  setChoirCategory,
  updateChoirCategory,
  updateMusicRule,
  updateProtocolDutyPolicy,
  updateProtocolServiceRule,
  updateSchedulingService,
  type ChoirCategoryApi,
  type MusicRuleApi,
  type MusicRuleInputApi,
  type PlanningMode,
  type ProtocolServiceRuleApi,
  type RuleFrequencyApi,
  type SchedulingServiceApi,
} from '../api/frontDoorApi';
import { useT } from '../i18n/I18nContext';
import { LoadState } from './LoadState';
import { useLoad } from './useLoad';
import {
  extraDutyPolicyName,
  formatFrequency,
  formatMinMax,
  recurrenceKey,
  ruleSentences,
  serviceKindKey,
  type RuleNames,
} from './config';
import { ConfirmDialog, EmptyState, SidePanel, StatusChip } from './kit';
import './schedulingConfig.css';

type Arrangement = PlanningMode;

/** canWrite means: the person may edit AND holds the edit lock (the page works that out). */
type Props = {
  systemId: string;
  canWrite: boolean;
};

type SaveState = {
  error: string;
  saved: boolean;
  working: boolean;
  run: (save: () => Promise<unknown>, reload: () => void) => Promise<boolean>;
  clear: () => void;
  fail: (reason: unknown) => void;
};

function useSaveState(): SaveState {
  const t = useT();
  const setup = useContext(SchedulingSetupContext);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [working, setWorking] = useState(false);
  return {
    error, saved, working,
    clear: () => { setError(""); setSaved(false); },
    fail: (reason) => setError(schedulingError(reason) ?? (reason instanceof Error && reason.message ? reason.message : t("door.config.err.input"))),
    run: async (save, reload) => {
      setError("");
      setSaved(false);
      setWorking(true);
      try {
        await save();
        setup.saved();
        reload();
        setSaved(true);
        return true;
      } catch (reason) {
        setError(schedulingError(reason) ?? (reason instanceof Error && reason.message ? reason.message : t("door.config.err.server")));
        return false;
      } finally {
        setWorking(false);
      }
    },
  };
}

function FormNotice({ state }: { state: SaveState }) {
  const t = useT();
  return (
    <>
      {state.error && <p className="door-error" role="alert">{state.error}</p>}
      {state.saved && <p className="muted" role="status">{t("door.config.saved")}</p>}
    </>
  );
}

function EditToggle({ onClick }: { onClick: () => void }) {
  const t = useT();
  return <button type="button" className="btn ghost sm" onClick={onClick}>{t("door.settings.edit")}</button>;
}

function AddToggle({ onClick }: { onClick: () => void }) {
  const t = useT();
  return <button type="button" className="btn sm" onClick={onClick}>{t("door.config.add")}</button>;
}

function SubmitButtons({ working, onCancel }: { editing: boolean; working: boolean; onCancel: () => void }) {
  const t = useT();
  return (
    <div className="door-row">
      <button type="submit" className="btn sm" disabled={working}>{t("door.settings.save")}</button>
      <button type="button" className="btn ghost sm" disabled={working} onClick={onCancel}>{t("door.settings.cancel")}</button>
    </div>
  );
}

function TextField({ label, name, value, required = false, type = "text", min, max, pattern }: {
  label: string; name: string; value?: string | number; required?: boolean; type?: string;
  min?: number; max?: number; pattern?: string;
}) {
  return (
    <label>{label}
      <input name={name} type={type} defaultValue={value ?? ""} required={required}
        min={min} max={max} pattern={pattern} />
    </label>
  );
}

function SelectField({ label, name, value, options, required = false }: {
  label: string; name: string; value?: string; options: Array<{ value: string; label: string }>; required?: boolean;
}) {
  return (
    <label>{label}
      <select name={name} defaultValue={value ?? options[0]?.value ?? ""} required={required}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function CheckField({ label, name, checked = false, value }: { label: string; name: string; checked?: boolean; value?: string }) {
  return <label><input name={name} type="checkbox" value={value} defaultChecked={checked} /> {label}</label>;
}

function readForm(form: HTMLFormElement): FormData {
  return new FormData(form);
}
const str = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const num = (data: FormData, key: string, emptyValue: number | null = null) => {
  const value = str(data, key);
  return value === "" ? emptyValue : Number(value);
};
const flag = (data: FormData, key: string) => data.has(key) && data.get(key) !== 'no';
function SaveForm({ title, state, children, onSubmit, editing, working, onCancel }: {
  title: string; state: SaveState; children: ReactNode; onSubmit: (data: FormData) => Promise<void>;
  editing: boolean; working: boolean; onCancel: () => void;
}) {
  const setup = useContext(SchedulingSetupContext);
  return (
    <form className="panel door-form" onSubmit={(event) => {
      event.preventDefault();
      void onSubmit(readForm(event.currentTarget)).catch(state.fail);
    }}>
      <h3>{title}</h3>
      {children}
      <SubmitButtons editing={editing} working={working} onCancel={() => { setup.saved(); onCancel(); }} />
    </form>
  );
}

function EmptyOrLocked({ canEdit, empty, emptyKey }: { canEdit: boolean; empty: boolean; emptyKey: Parameters<ReturnType<typeof useT>>[0] }) {
  const t = useT();
  if (!empty) return null;
  return <p className="muted">{canEdit ? t("door.config.emptyDraft") : t(emptyKey)}</p>;
}

function SectionNotice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  return <p className={`scheduling-config-notice${tone === "warn" ? " is-warning" : ""}`}>{children}</p>;
}

function TeamSizeOverridesField({ overrides }: { overrides: Record<string, number> }) {
  const t = useT();
  const [rows, setRows] = useState(() => Object.entries(overrides).map(([date, size]) => ({ date, size: String(size) })));
  return (
    <fieldset className="scheduling-config-overrides">
      <legend>{t("door.config.protocol.teamSizeOverrides")}</legend>
      <p className="muted">{t("door.config.protocol.teamSizeOverridesHelp")}</p>
      {rows.map((row, index) => (
        <div className="scheduling-config-override-row" key={`${row.date}-${index}`}>
          <label>{t("door.config.override.date")}
            <input name="overrideDate" type="date" defaultValue={row.date} />
          </label>
          <label>{t("door.config.override.size")}
            <input name="overrideSize" type="number" min={1} step={1} required defaultValue={row.size} />
          </label>
          <button type="button" className="btn ghost sm"
            aria-label={t("door.config.override.remove", { number: index + 1 })}
            onClick={() => setRows((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
            {t("door.config.override.removeAction")}
          </button>
        </div>
      ))}
      <button type="button" className="btn ghost sm"
        onClick={() => setRows((current) => [...current, { date: "", size: "10" }])}>
        {t("door.config.override.add")}
      </button>
    </fieldset>
  );
}

/* ───────────────────────── The four Music sections ───────────────────────── */

type Tn = ReturnType<typeof useT>;
const dayName = (t: Tn, weekday: number | null) => weekday === null || weekday === undefined ? '' : t(`door.caring.weekday.${weekday}` as Parameters<Tn>[0]);
/** "Sunday 1st · Sunday 08:00": the weekday goes in the label so two services with the same name stay apart. */
const serviceLabel = (t: Tn, s: SchedulingServiceApi) => [s.name, [dayName(t, s.weekday), s.time].filter(Boolean).join(' ')].filter(Boolean).join(' · ');

function useConfirmDelete() {
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  return { target, ask: (id: string, name: string) => setTarget({ id, name }), close: () => setTarget(null) };
}

/** Table cell input helpers for the inline editors. */
function useDraft<T extends object>(initial: T) {
  const setup = useContext(SchedulingSetupContext);
  const [draft, setDraft] = useState<T>(initial);
  return { draft, set: (patch: Partial<T>) => { setDraft((d) => ({ ...d, ...patch })); setup.changed(); } };
}

/* ── 1. Services ── */

type ServiceDraft = {
  name: string; code: string; weekday: string; time: string; recurrence: string; musicRequired: boolean; protocolRequired: boolean;
  active: boolean; kind: string; maxChoirs: string; displayOrder: string; selectedDates: string;
};
const serviceDraft = (s: SchedulingServiceApi | null): ServiceDraft => ({
  name: s?.name ?? '', code: s?.code ?? '', weekday: s?.weekday == null ? '' : String(s.weekday), time: s?.time ?? '',
  recurrence: s?.recurrence ?? 'WEEKLY', musicRequired: s?.musicRequired ?? true, protocolRequired: s?.protocolRequired ?? true,
  active: s?.active ?? true, kind: s?.kind ?? 'SERVICE', maxChoirs: String(s?.maxChoirs ?? 3), displayOrder: String(s?.displayOrder ?? 0),
  selectedDates: (s?.selectedDates ?? []).join('\n'),
});

function ServiceEditRow({ row, state, onDone, onSaved }: { row: SchedulingServiceApi | null; state: SaveState; onDone: () => void; onSaved: () => void }) {
  const t = useT();
  const setup = useContext(SchedulingSetupContext);
  const { draft, set } = useDraft(serviceDraft(row));
  const save = async () => {
    const patch = {
      code: draft.code.trim() || `SERVICE_${crypto.randomUUID().slice(0, 8)}`, name: draft.name.trim(), kind: draft.kind,
      weekday: draft.weekday === '' ? null : Number(draft.weekday), time: draft.time || null, recurrence: draft.recurrence,
      selectedDates: draft.selectedDates.split(/[\s,]+/).map((v) => v.trim()).filter(Boolean),
      active: draft.active, musicRequired: draft.musicRequired, protocolRequired: draft.protocolRequired,
      maxChoirs: Number(draft.maxChoirs || 3), displayOrder: Number(draft.displayOrder || 0),
    };
    const ok = await state.run(() => row ? updateSchedulingService(row.id, patch) : createSchedulingService({ ...patch, systemId: 'sys-music' }), onSaved);
    if (ok) onDone();
  };
  const field = (label: string) => ({ 'aria-label': label });
  return <>
    <tr className="is-editing">
      <td><input {...field(t('door.config.service.name'))} value={draft.name} required onChange={(e) => set({ name: e.target.value })} /></td>
      <td><input {...field(t('door.config.service.code'))} value={draft.code} pattern="[A-Za-z0-9_-]{1,40}" onChange={(e) => set({ code: e.target.value })} /></td>
      <td><select {...field(t('door.config.service.weekday'))} value={draft.weekday} onChange={(e) => set({ weekday: e.target.value })}>
        <option value="">{t('door.config.form.any')}</option>
        {Array.from({ length: 7 }, (_, day) => <option key={day} value={day}>{dayName(t, day)}</option>)}
      </select></td>
      <td><input {...field(t('door.config.service.time'))} type="time" value={draft.time} onChange={(e) => set({ time: e.target.value })} /></td>
      <td><select {...field(t('door.config.service.recurrence'))} value={draft.recurrence} onChange={(e) => set({ recurrence: e.target.value })}>
        {['WEEKLY', 'MONTHLY', 'SELECTED_DATES', 'CUSTOM'].map((r) => <option key={r} value={r}>{t(recurrenceKey(r as SchedulingServiceApi['recurrence']))}</option>)}
      </select></td>
      <td><input type="checkbox" {...field(t('door.config.service.music'))} checked={draft.musicRequired} onChange={(e) => set({ musicRequired: e.target.checked })} /></td>
      <td><input type="checkbox" {...field(t('door.config.service.protocol'))} checked={draft.protocolRequired} onChange={(e) => set({ protocolRequired: e.target.checked })} /></td>
      <td><input type="checkbox" {...field(t('door.config.service.active'))} checked={draft.active} onChange={(e) => set({ active: e.target.checked })} /></td>
      <td className="scheduling-table-actions">
        <button type="button" className="btn sm" disabled={state.working || !draft.name.trim()} onClick={() => void save()}>{t('door.settings.save')}</button>
        <button type="button" className="btn ghost sm" disabled={state.working} onClick={() => { setup.saved(); onDone(); }}>{t('door.settings.cancel')}</button>
      </td>
    </tr>
    <tr className="is-editing"><td colSpan={9}>
      <details className="scheduling-config-advanced" open={draft.recurrence === 'SELECTED_DATES' || draft.recurrence === 'CUSTOM' || !!draft.selectedDates}>
        <summary>{t('door.config.help.advancedService')}</summary>
        <div className="door-form">
          <label>{t('door.config.service.kind')}<select value={draft.kind} onChange={(e) => set({ kind: e.target.value })}>
            {['SERVICE', 'REHEARSAL', 'MEETING', 'OTHER'].map((k) => <option key={k} value={k}>{t(serviceKindKey(k as SchedulingServiceApi['kind']))}</option>)}
          </select></label>
          <label>{t('door.config.service.capacity')}<input type="number" min={0} value={draft.maxChoirs} onChange={(e) => set({ maxChoirs: e.target.value })} /></label>
          <label>{t('door.config.service.order')}<input type="number" min={0} value={draft.displayOrder} onChange={(e) => set({ displayOrder: e.target.value })} /></label>
          <label>{t('door.config.service.dates')}<textarea rows={3} value={draft.selectedDates} onChange={(e) => set({ selectedDates: e.target.value })} placeholder="2026-12-25" /></label>
        </div>
      </details>
    </td></tr>
  </>;
}

export function ServicesEditor({ systemId, canWrite }: Props) {
  const t = useT();
  const isMusic = systemId === 'sys-music';
  const editable = canWrite && isMusic;
  const list = useLoad(() => fetchSchedulingServices(systemId, false), `sched-config-services|${systemId}`);
  const state = useSaveState();
  const ask = useConfirmDelete();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const rows = list.data?.services ?? [];
  const yes = (v: boolean) => v ? t('door.config.form.yes') : t('door.config.form.no');
  return <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
    {!isMusic && <SectionNotice>{t('door.config.sharedCalendarReadOnly')}</SectionNotice>}
    <FormNotice state={state} />
    {editable && editing === null && <button type="button" className="btn sm" onClick={() => { state.clear(); setEditing('new'); }}>{t('door.config.add')}</button>}
    <table className="scheduling-table">
      <thead><tr>
        <th>{t('door.config.col.name')}</th><th>{t('door.config.col.code')}</th><th>{t('door.config.col.weekday')}</th><th>{t('door.config.col.time')}</th>
        <th>{t('door.config.col.recurrence')}</th><th>{t('door.config.col.music')}</th><th>{t('door.config.col.protocol')}</th><th>{t('door.config.col.active')}</th><th />
      </tr></thead>
      <tbody>
        {editing === 'new' && <ServiceEditRow row={null} state={state} onDone={() => setEditing(null)} onSaved={list.reload} />}
        {rows.map((s) => editing === s.id
          ? <ServiceEditRow key={s.id} row={s} state={state} onDone={() => setEditing(null)} onSaved={list.reload} />
          : <tr key={s.id} className={s.active ? undefined : 'is-inactive'}>
            <td>{s.name}</td><td>{s.code}</td><td>{dayName(t, s.weekday) || t('door.config.form.any')}</td><td>{s.time ?? '—'}</td>
            <td>{t(recurrenceKey(s.recurrence))}</td><td>{yes(s.musicRequired)}</td><td>{yes(s.protocolRequired)}</td>
            <td>{s.active ? t('door.config.service.active') : t('door.config.service.inactive')}</td>
            <td className="scheduling-table-actions">{editable && editing === null && <>
              <button type="button" className="btn ghost sm" onClick={() => { state.clear(); setEditing(s.id); }}>{t('door.settings.edit')}</button>
              {s.active && <button type="button" className="btn ghost sm" onClick={() => ask.ask(s.id, s.name)}>{t('door.config.delete')}</button>}
            </>}</td>
          </tr>)}
      </tbody>
    </table>
    {rows.length === 0 && editing === null && <p className="muted">{editable ? t('door.config.emptyDraft') : t('door.config.services.empty')}</p>}
    <ConfirmDialog open={!!ask.target} busy={state.working} title={t('door.config.deleteService.title', { name: ask.target?.name ?? '' })}
      body={t('door.config.deleteService.body')} confirmLabel={t('door.config.delete')}
      onCancel={ask.close} onConfirm={() => { const id = ask.target?.id; ask.close(); if (id) void state.run(() => retireSchedulingService(id), list.reload); }} />
  </LoadState>;
}

/* ── 2. Choir categories ── */

function CategoryEditRow({ row, state, onDone, onSaved }: { row: ChoirCategoryApi | null; state: SaveState; onDone: () => void; onSaved: () => void }) {
  const t = useT();
  const setup = useContext(SchedulingSetupContext);
  const { draft, set } = useDraft({ name: row?.name ?? '', code: row?.code ?? '', active: row?.active ?? true });
  const save = async () => {
    const patch = { name: draft.name.trim(), code: draft.code.trim() || draft.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 40), description: row?.description ?? '', active: draft.active };
    const ok = await state.run(() => row ? updateChoirCategory(row.id, patch) : createChoirCategory({ ...patch, systemId: 'sys-music' }), onSaved);
    if (ok) onDone();
  };
  return <tr className="is-editing">
    <td><input aria-label={t('door.config.category.name')} value={draft.name} onChange={(e) => set({ name: e.target.value })} /></td>
    <td><input aria-label={t('door.config.category.code')} value={draft.code} pattern="[A-Za-z0-9_-]{1,40}" onChange={(e) => set({ code: e.target.value })} /></td>
    <td><input type="checkbox" aria-label={t('door.config.service.active')} checked={draft.active} onChange={(e) => set({ active: e.target.checked })} /></td>
    <td className="scheduling-table-actions">
      <button type="button" className="btn sm" disabled={state.working || !draft.name.trim()} onClick={() => void save()}>{t('door.settings.save')}</button>
      <button type="button" className="btn ghost sm" disabled={state.working} onClick={() => { setup.saved(); onDone(); }}>{t('door.settings.cancel')}</button>
    </td>
  </tr>;
}

export function CategoriesEditor({ systemId, canWrite }: Props) {
  const t = useT();
  const editable = canWrite && systemId === 'sys-music';
  const list = useLoad(() => fetchChoirCategories(systemId, false), `sched-config-cats|${systemId}`);
  const state = useSaveState();
  const ask = useConfirmDelete();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const rows = list.data?.categories ?? [];
  return <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
    <FormNotice state={state} />
    {editable && editing === null && <button type="button" className="btn sm" onClick={() => { state.clear(); setEditing('new'); }}>{t('door.config.add')}</button>}
    <table className="scheduling-table">
      <thead><tr><th>{t('door.config.col.name')}</th><th>{t('door.config.col.code')}</th><th>{t('door.config.col.active')}</th><th /></tr></thead>
      <tbody>
        {editing === 'new' && <CategoryEditRow row={null} state={state} onDone={() => setEditing(null)} onSaved={list.reload} />}
        {rows.map((c) => editing === c.id
          ? <CategoryEditRow key={c.id} row={c} state={state} onDone={() => setEditing(null)} onSaved={list.reload} />
          : <tr key={c.id} className={c.active ? undefined : 'is-inactive'}>
            <td>{c.name}</td><td>{c.code}</td><td>{c.active ? t('door.config.service.active') : t('door.config.service.inactive')}</td>
            <td className="scheduling-table-actions">{editable && editing === null && <>
              <button type="button" className="btn ghost sm" onClick={() => { state.clear(); setEditing(c.id); }}>{t('door.settings.edit')}</button>
              {c.active && <button type="button" className="btn ghost sm" onClick={() => ask.ask(c.id, c.name)}>{t('door.config.delete')}</button>}
            </>}</td>
          </tr>)}
      </tbody>
    </table>
    {rows.length === 0 && editing === null && <p className="muted">{editable ? t('door.config.emptyDraft') : t('door.config.categories.empty')}</p>}
    <ConfirmDialog open={!!ask.target} busy={state.working} title={t('door.config.deleteCategory.title', { name: ask.target?.name ?? '' })}
      body={t('door.config.deleteCategory.body')} confirmLabel={t('door.config.delete')}
      onCancel={ask.close} onConfirm={() => { const id = ask.target?.id; ask.close(); if (id) void state.run(() => updateChoirCategory(id, { active: false }), list.reload); }} />
  </LoadState>;
}

/* ── 3. Choirs (one category per choir) ── */

export function ChoirsEditor({ systemId, canWrite }: Props) {
  const t = useT();
  const setup = useContext(SchedulingSetupContext);
  const editable = canWrite && systemId === 'sys-music';
  const choirs = useLoad(() => fetchConfigChoirs(), 'sched-config-choirs');
  const cats = useLoad(() => fetchChoirCategories(systemId, false), `sched-config-cats|${systemId}`);
  const state = useSaveState();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const categories = cats.data?.categories ?? [];
  const rows = choirs.data?.choirs ?? [];
  return <LoadState loading={choirs.loading || cats.loading} failed={choirs.failed || cats.failed} retry={() => { choirs.reload(); cats.reload(); }}>
    <FormNotice state={state} />
    <table className="scheduling-table">
      <thead><tr><th>{t('door.config.col.choir')}</th><th>{t('door.config.col.category')}</th><th>{t('door.config.col.active')}</th><th /></tr></thead>
      <tbody>
        {rows.map((c) => {
          const value = picked[c.id] ?? c.categoryId ?? '';
          const dirty = value !== (c.categoryId ?? '') && value !== '';
          return <tr key={c.id} className={c.active ? undefined : 'is-inactive'}>
            <td>{c.name}</td>
            <td>
              <select aria-label={t('door.config.col.category')} value={value} disabled={!editable || !c.active}
                onChange={(e) => { setPicked({ ...picked, [c.id]: e.target.value }); setup.changed(); }}>
                {!c.categoryId && <option value="">{t('door.config.choir.unassigned')}</option>}
                {categories.filter((k) => k.active || k.id === c.categoryId).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
              {!c.categoryId && c.active && <StatusChip tone="warn">{t('door.config.choir.unassigned')}</StatusChip>}
            </td>
            <td>{c.active ? t('door.config.service.active') : t('door.config.service.inactive')}</td>
            <td className="scheduling-table-actions">{editable && dirty && <>
              <button type="button" className="btn sm" disabled={state.working}
                onClick={() => void state.run(() => setChoirCategory(c.id, value), choirs.reload).then((ok) => { if (ok) setPicked(({ [c.id]: _gone, ...rest }) => rest); })}>{t('door.settings.save')}</button>
              <button type="button" className="btn ghost sm" disabled={state.working}
                onClick={() => { setPicked(({ [c.id]: _gone, ...rest }) => rest); setup.saved(); }}>{t('door.settings.cancel')}</button>
            </>}</td>
          </tr>;
        })}
      </tbody>
    </table>
    {rows.length === 0 && <p className="muted">{t('door.config.choirs.empty')}</p>}
    <p className="muted">{t('door.config.choirs.registerNote')}</p>
    <details className="scheduling-config-advanced"><summary>{t('door.config.availability.heading')}</summary>
      <ChoirAvailabilityEditor canWrite={editable} />
    </details>
  </LoadState>;
}

/* ── 4. Rules ── */

type FreqDraft = { on: boolean; kind: string; target: string; period: string; counting: string };
type ExDraft = { key: string; choirId: string; eligible: 'inherit' | 'yes' | 'no'; fOn: boolean; fKind: string; fTarget: string; fPeriod: string };
type RuleDraft = {
  scope: string[]; targetKind: 'category' | 'choir'; categoryId: string; choirId: string; arrangement: Arrangement;
  min: string; max: string; requireAll: boolean; freq: FreqDraft; exceptions: ExDraft[];
};
const emptyFreq: FreqDraft = { on: false, kind: 'MINIMUM', target: '1', period: 'MONTH', counting: 'ASSIGNMENTS' };
const blankRule = (): RuleDraft => ({ scope: [], targetKind: 'category', categoryId: '', choirId: '', arrangement: 'ROTATION', min: '', max: '', requireAll: false, freq: emptyFreq, exceptions: [] });
const ruleDraft = (r: MusicRuleApi): RuleDraft => ({
  scope: r.scope, targetKind: r.target.kind, categoryId: r.target.kind === 'category' ? r.target.categoryId : '', choirId: r.target.kind === 'choir' ? r.target.choirId : '',
  arrangement: r.arrangement, min: r.minCount === null ? '' : String(r.minCount), max: r.maxCount === null ? '' : String(r.maxCount), requireAll: r.requireAll,
  freq: r.frequency ? { on: true, kind: r.frequency.kind, target: String(r.frequency.target), period: r.frequency.period, counting: r.frequency.counting } : emptyFreq,
  exceptions: r.exceptions.map((e) => ({
    key: crypto.randomUUID(), choirId: e.choirId, eligible: e.eligible === undefined ? 'inherit' : e.eligible ? 'yes' : 'no',
    fOn: !!e.frequency, fKind: e.frequency?.kind ?? '', fTarget: e.frequency?.target ? String(e.frequency.target) : '', fPeriod: e.frequency?.period ?? '',
  })),
});
const toInput = (d: RuleDraft): MusicRuleInputApi => {
  const int = (v: string) => v.trim() === '' ? null : Number(v);
  return {
    scope: d.scope,
    target: d.targetKind === 'category' ? { kind: 'category', categoryId: d.categoryId } : { kind: 'choir', choirId: d.choirId },
    arrangement: d.arrangement,
    minCount: d.arrangement === 'ROTATION' ? int(d.min) : null, maxCount: d.arrangement === 'ROTATION' ? int(d.max) : null,
    requireAll: d.arrangement === 'ROTATION' && d.targetKind === 'category' ? d.requireAll : false,
    frequency: d.freq.on ? { kind: d.freq.kind as RuleFrequencyApi['kind'], target: Number(d.freq.target), period: d.freq.period as RuleFrequencyApi['period'], counting: d.freq.counting as RuleFrequencyApi['counting'] } : null,
    exceptions: d.targetKind === 'category' ? d.exceptions.filter((e) => e.choirId).map((e) => ({
      choirId: e.choirId,
      ...(e.eligible === 'inherit' ? {} : { eligible: e.eligible === 'yes' }),
      ...(e.fOn ? { frequency: { ...(e.fKind ? { kind: e.fKind as RuleFrequencyApi['kind'] } : {}), ...(e.fTarget ? { target: Number(e.fTarget) } : {}), ...(e.fPeriod ? { period: e.fPeriod as RuleFrequencyApi['period'] } : {}) } } : {}),
    })).filter((e) => e.eligible !== undefined || (e.frequency && Object.keys(e.frequency).length)) : [],
  };
};

/** Cheap client-side mirror of the server's value checks, so obvious slips are caught before the round trip. */
function localErrors(d: RuleDraft, t: Tn): Array<{ field: string; text: string }> {
  const out: Array<{ field: string; text: string }> = [];
  if (!d.scope.length) out.push({ field: 'rule-services', text: t('door.config.rule.err.services') });
  if (d.targetKind === 'category' && !d.categoryId) out.push({ field: 'rule-target', text: t('door.config.rule.err.category') });
  if (d.targetKind === 'choir' && !d.choirId) out.push({ field: 'rule-target', text: t('door.config.rule.err.choir') });
  const min = d.min.trim() === '' ? null : Number(d.min), max = d.max.trim() === '' ? null : Number(d.max);
  if ((min !== null && (!Number.isInteger(min) || min < 0)) || (max !== null && (!Number.isInteger(max) || max < 0))) out.push({ field: 'rule-min', text: t('door.config.rule.err.counts') });
  else if (min !== null && max !== null && min > max) out.push({ field: 'rule-min', text: t('door.config.rule.err.minMax') });
  if (d.freq.on && (!Number.isInteger(Number(d.freq.target)) || Number(d.freq.target) <= 0)) out.push({ field: 'rule-frequency', text: t('door.config.rule.err.frequency') });
  return out;
}

/** Where a server error belongs. Services-tab problems (weekday, recurrence, dates...) leave the dialog; the rest focus a field. */
function locateError(message: string): { field: string; tab?: 'services' | 'categories' | 'choirs' } | null {
  const m = message.toLowerCase();
  if (/weekday|recurrence|repeats|start time|selected dates|custom dates|capacity|two active services/.test(m)) return { field: 'services-tab', tab: 'services' };
  if (/not linked to any category|has no category|not in /.test(m)) return { field: 'choirs-tab', tab: 'choirs' };
  if (/frequency/.test(m)) return { field: 'rule-frequency' };
  if (/exception/.test(m)) return { field: 'rule-exceptions' };
  if (/minimum|maximum|choir count|choirs from|eligible linked/.test(m)) return { field: 'rule-min' };
  if (/categor/.test(m)) return { field: 'rule-target' };
  if (/service|sunday|saturday|monday|tuesday|wednesday|thursday|friday/.test(m)) return { field: 'rule-services' };
  return null;
}

function RuleDialog({ rule, services, categories, choirs, onClose, onSaved, goTo }: {
  rule: MusicRuleApi | null; services: SchedulingServiceApi[]; categories: ChoirCategoryApi[];
  choirs: Array<{ id: string; name: string; active: boolean; categoryId: string | null }>;
  onClose: () => void; onSaved: () => void; goTo: (tab: string) => void;
}) {
  const t = useT();
  const setup = useContext(SchedulingSetupContext);
  const { draft, set } = useDraft<RuleDraft>(rule ? ruleDraft(rule) : blankRule());
  const [errors, setErrors] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [freqOpen, setFreqOpen] = useState(draft.freq.on);
  const [exOpen, setExOpen] = useState(draft.exceptions.length > 0);
  const local = localErrors(draft, t);
  const usable = services.filter((s) => s.active && s.musicRequired);
  const catChoirs = choirs.filter((c) => c.active && c.categoryId === draft.categoryId);
  const choirsByCategory = categories.map((k) => ({ k, rows: choirs.filter((c) => c.active && c.categoryId === k.id) })).filter((g) => g.rows.length);
  const isRotation = draft.arrangement === 'ROTATION';
  const setTargetKind = (kind: 'category' | 'choir') => set({ targetKind: kind, arrangement: kind === 'choir' ? 'FIXED' : draft.arrangement === 'FIXED' ? 'ROTATION' : draft.arrangement });
  const focusField = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());
  const jump = (message: string) => {
    const where = locateError(message);
    if (!where) return;
    if (where.tab) { setup.saved(); onClose(); goTo(where.tab); requestAnimationFrame(() => focusField(where.field)); return; }
    if (where.field === 'rule-frequency') setFreqOpen(true);
    if (where.field === 'rule-exceptions') setExOpen(true);
    focusField(where.field);
  };
  const save = async () => {
    if (local.length || working) return;
    setWorking(true); setErrors([]);
    try {
      const input = toInput(draft);
      await (rule ? updateMusicRule(rule.id, input) : createMusicRule(input));
      setup.saved(); onSaved(); onClose();
    } catch (reason) {
      const body = reason instanceof ApiError ? reason.body as { errors?: string[]; message?: string; error?: string } | undefined : undefined;
      setErrors(body?.errors?.length ? body.errors : [body?.message ?? body?.error ?? (reason instanceof Error ? reason.message : t('door.config.err.server'))]);
    } finally { setWorking(false); }
  };
  const freqPreview = draft.freq.on ? formatFrequency({ kind: draft.freq.kind as RuleFrequencyApi['kind'], target: Number(draft.freq.target) || 0, period: draft.freq.period as RuleFrequencyApi['period'], counting: draft.freq.counting as RuleFrequencyApi['counting'] }, t) : '—';
  return <SidePanel open title={rule ? t('door.config.rule.edit') : t('door.config.rule.add')} onClose={() => { setup.saved(); onClose(); }}
    onSave={() => void save()} saveLabel={t('door.settings.save')} saving={working}>
    <div className="pt-edit scheduling-rule-dialog">
      {errors.length > 0 && <div className="door-error" role="alert">
        <strong>{t('door.config.rule.err.heading')}</strong>
        <ul>{errors.map((message) => { const can = !!locateError(message); return <li key={message}>{message} {can && <button type="button" className="btn ghost sm" onClick={() => jump(message)}>{t('door.config.rule.err.jump')}</button>}</li>; })}</ul>
      </div>}
      {local.length > 0 && <ul className="muted" aria-live="polite">{local.map((e) => <li key={e.text}><button type="button" className="btn ghost sm" onClick={() => focusField(e.field)}>{e.text}</button></li>)}</ul>}

      <fieldset id="rule-services" tabIndex={-1}><legend>{t('door.config.rule.services')}</legend>
        {usable.map((s) => <label key={s.id}><input type="checkbox" checked={draft.scope.includes(s.id)}
          onChange={(e) => set({ scope: e.target.checked ? [...draft.scope, s.id] : draft.scope.filter((id) => id !== s.id) })} /> {serviceLabel(t, s)}</label>)}
        {usable.length === 0 && <p className="muted">{t('door.config.services.empty')}</p>}
      </fieldset>

      <fieldset id="rule-target" tabIndex={-1}><legend>{t('door.config.rule.target')}</legend>
        <label><input type="radio" name="rule-target-kind" checked={draft.targetKind === 'category'} onChange={() => setTargetKind('category')} /> {t('door.config.rule.target.category')}</label>
        {draft.targetKind === 'category' && <select aria-label={t('door.config.rule.target.category')} value={draft.categoryId} onChange={(e) => set({ categoryId: e.target.value, exceptions: [] })}>
          <option value="">{t('door.gov.meeting.choose')}</option>
          {categories.filter((k) => k.active).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>}
        <label><input type="radio" name="rule-target-kind" checked={draft.targetKind === 'choir'} onChange={() => setTargetKind('choir')} /> {t('door.config.rule.target.choir')}</label>
        {draft.targetKind === 'choir' && <select aria-label={t('door.config.rule.target.choir')} value={draft.choirId} onChange={(e) => set({ choirId: e.target.value })}>
          <option value="">{t('door.gov.meeting.choose')}</option>
          {choirsByCategory.map(({ k, rows }) => <optgroup key={k.id} label={k.name}>{rows.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}
        </select>}
      </fieldset>

      <fieldset><legend>{t('door.config.rule.arrangement')}</legend>
        <div className="scheduling-segmented" role="group" aria-label={t('door.config.rule.arrangement')}>
          {(['FIXED', 'ROTATION', 'MANUAL'] as const).map((a) => {
            const blocked = draft.targetKind === 'choir' ? a !== 'FIXED' : a === 'FIXED';
            return <button key={a} type="button" className={'btn sm' + (draft.arrangement === a ? '' : ' ghost')} aria-pressed={draft.arrangement === a} disabled={blocked}
              title={blocked ? t(draft.targetKind === 'choir' ? 'door.config.rule.hint.choirFixed' : 'door.config.rule.hint.categoryNotFixed') : undefined}
              onClick={() => set({ arrangement: a })}>{t(`door.config.rule.arrangement.${a}` as Parameters<Tn>[0])}</button>;
          })}
        </div>
        <p className="muted">{t(`door.config.rule.arrangementHelp.${draft.arrangement}` as Parameters<Tn>[0])}</p>
      </fieldset>

      {isRotation && <fieldset><legend>{t('door.config.rule.counts')}</legend>
        <label>{t('door.config.rule.min')}<input id="rule-min" type="number" min={0} value={draft.min} onChange={(e) => set({ min: e.target.value })} /></label>
        <label>{t('door.config.rule.max')}<input id="rule-max" type="number" min={0} value={draft.max} onChange={(e) => set({ max: e.target.value })} /></label>
        {draft.targetKind === 'category' && <label><input type="checkbox" checked={draft.requireAll} onChange={(e) => set({ requireAll: e.target.checked })} /> {t('door.config.rule.requireAll')}</label>}
      </fieldset>}

      <details id="rule-frequency" className="scheduling-config-advanced" open={freqOpen} onToggle={(e) => setFreqOpen((e.target as HTMLDetailsElement).open)} tabIndex={-1}>
        <summary>{t('door.config.rule.frequency')}</summary>
        <label><input type="checkbox" checked={draft.freq.on} onChange={(e) => set({ freq: { ...draft.freq, on: e.target.checked } })} /> {t('door.config.rule.frequency.on')}</label>
        {draft.freq.on && <div className="door-form">
          <label>{t('door.config.policy.kind')}<select value={draft.freq.kind} onChange={(e) => set({ freq: { ...draft.freq, kind: e.target.value } })}>
            {['MINIMUM', 'TARGET', 'MAXIMUM'].map((k) => <option key={k} value={k}>{t(`door.config.frequencyChoice.${k}` as Parameters<Tn>[0])}</option>)}</select></label>
          <label>{t('door.config.rule.frequency.target')}<input type="number" min={1} value={draft.freq.target} onChange={(e) => set({ freq: { ...draft.freq, target: e.target.value } })} /></label>
          <label>{t('door.config.policy.period')}<select value={draft.freq.period} onChange={(e) => set({ freq: { ...draft.freq, period: e.target.value } })}>
            {['MONTH', 'QUARTER', 'HALF_YEAR', 'YEAR'].map((p) => <option key={p} value={p}>{t(`door.config.period.${p}` as Parameters<Tn>[0])}</option>)}</select></label>
          <label>{t('door.config.rule.frequency.counting')}<select value={draft.freq.counting} onChange={(e) => set({ freq: { ...draft.freq, counting: e.target.value } })}>
            {['ASSIGNMENTS', 'DISTINCT_DATES'].map((c) => <option key={c} value={c}>{t(`door.config.counting.${c}` as Parameters<Tn>[0])}</option>)}</select></label>
        </div>}
        <p className="muted" aria-live="polite">{t('door.config.rule.frequency.preview', { value: freqPreview })}</p>
      </details>

      {draft.targetKind === 'category' && <details id="rule-exceptions" className="scheduling-config-advanced" open={exOpen} onToggle={(e) => setExOpen((e.target as HTMLDetailsElement).open)} tabIndex={-1}>
        <summary>{t('door.config.rule.exceptions')}</summary>
        <p className="muted">{t('door.config.rule.exceptions.help')}</p>
        {draft.exceptions.map((ex, index) => {
          const patch = (p: Partial<ExDraft>) => set({ exceptions: draft.exceptions.map((row, i) => i === index ? { ...row, ...p } : row) });
          return <div key={ex.key} className="scheduling-config-override-row">
            <select aria-label={t('door.config.col.choir')} value={ex.choirId} onChange={(e) => patch({ choirId: e.target.value })}>
              <option value="">{t('door.gov.meeting.choose')}</option>
              {catChoirs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select aria-label={t('door.config.rule.exception.eligible')} value={ex.eligible} onChange={(e) => patch({ eligible: e.target.value as ExDraft['eligible'] })}>
              <option value="inherit">{t('door.config.inherit')}</option><option value="yes">{t('door.config.rule.exception.takesPart')}</option><option value="no">{t('door.config.rule.exception.sitsOut')}</option>
            </select>
            <label><input type="checkbox" checked={ex.fOn} onChange={(e) => patch({ fOn: e.target.checked })} /> {t('door.config.rule.exception.ownFrequency')}</label>
            {ex.fOn && <>
              <input type="number" min={1} aria-label={t('door.config.rule.frequency.target')} value={ex.fTarget} onChange={(e) => patch({ fTarget: e.target.value })} />
              <select aria-label={t('door.config.policy.period')} value={ex.fPeriod} onChange={(e) => patch({ fPeriod: e.target.value })}>
                <option value="">{t('door.config.inherit')}</option>
                {['MONTH', 'QUARTER', 'HALF_YEAR', 'YEAR'].map((p) => <option key={p} value={p}>{t(`door.config.period.${p}` as Parameters<Tn>[0])}</option>)}</select>
            </>}
            <button type="button" className="btn ghost sm" onClick={() => set({ exceptions: draft.exceptions.filter((_, i) => i !== index) })}>{t('door.config.override.removeAction')}</button>
          </div>;
        })}
        <button type="button" className="btn ghost sm" disabled={!draft.categoryId} onClick={() => set({ exceptions: [...draft.exceptions, { key: crypto.randomUUID(), choirId: '', eligible: 'inherit', fOn: false, fKind: '', fTarget: '', fPeriod: '' }] })}>{t('door.config.rule.exception.add')}</button>
      </details>}
    </div>
  </SidePanel>;
}

export function RulesEditor({ systemId, canWrite, goTo }: Props & { goTo: (tab: string) => void }) {
  const t = useT();
  const editable = canWrite && systemId === 'sys-music';
  const rules = useLoad(() => fetchMusicRules(), 'sched-config-rules');
  const services = useLoad(() => fetchSchedulingServices(systemId, false), `sched-config-services|${systemId}`);
  const cats = useLoad(() => fetchChoirCategories(systemId, false), `sched-config-cats|${systemId}`);
  const choirs = useLoad(() => fetchConfigChoirs(), 'sched-config-choirs');
  const state = useSaveState();
  const [dialog, setDialog] = useState<MusicRuleApi | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<MusicRuleApi | null>(null);
  const [showEx, setShowEx] = useState<MusicRuleApi | null>(null);
  const exRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = exRef.current; if (!d) return; if (showEx && !d.open) d.showModal(); if (!showEx && d.open) d.close(); }, [showEx]);
  const rows = rules.data?.rules ?? [];
  const sv = services.data?.services ?? [], ck = cats.data?.categories ?? [], ch = choirs.data?.choirs ?? [];
  const reload = () => { rules.reload(); choirs.reload(); };
  const names: RuleNames = {
    service: (id) => { const s = sv.find((x) => x.id === id); return s ? serviceLabel(t, s) : t('door.config.nameUnavailable.service'); },
    category: (id) => ck.find((x) => x.id === id)?.name ?? t('door.config.nameUnavailable.category'),
    choir: (id) => ch.find((x) => x.id === id)?.name ?? t('door.config.nameUnavailable.choir'),
    serviceShort: (id) => sv.find((x) => x.id === id)?.name ?? t('door.config.nameUnavailable.service'),
  };
  const target = (r: MusicRuleApi) => r.target.kind === 'category' ? t('door.config.rule.allOf', { name: names.category(r.target.categoryId) }) : names.choir(r.target.choirId);
  const groupCount = new Map<string, number>();
  for (const r of rows) if (r.sharedPolicyId && r.target.kind === 'choir') groupCount.set(r.sharedPolicyId, (groupCount.get(r.sharedPolicyId) ?? 0) + 1);
  const sentences = ruleSentences(rows, names, t);
  return <LoadState loading={rules.loading || services.loading || cats.loading || choirs.loading}
    failed={rules.failed || services.failed || cats.failed || choirs.failed} retry={() => { rules.reload(); services.reload(); cats.reload(); choirs.reload(); }}>
    <FormNotice state={state} />
    {(rules.data?.warnings ?? []).map((w) => <SectionNotice key={w.choirId} tone="warn">{w.message}{' '}<button type="button" className="btn ghost sm" onClick={() => goTo('choirs')}>{t('door.config.rule.warning.fix')}</button></SectionNotice>)}
    <p className="scheduling-rules-preview" aria-label={t('door.config.rules.previewLabel')}>{sentences.length ? sentences.join(' ') : t('door.config.rules.previewEmpty')}</p>
    {editable && <button type="button" className="btn sm" onClick={() => { state.clear(); setDialog('new'); }}>{t('door.config.rule.add')}</button>}
    <table className="scheduling-table">
      <thead><tr>
        <th>{t('door.config.rule.services')}</th><th>{t('door.config.rule.target')}</th><th>{t('door.config.rule.arrangement')}</th>
        <th>{t('door.config.col.minMax')}</th><th>{t('door.config.rule.frequency')}</th><th>{t('door.config.rule.exceptions')}</th><th />
      </tr></thead>
      <tbody>
        {rows.map((r) => <tr key={r.id} data-shared={r.sharedPolicyId && (groupCount.get(r.sharedPolicyId) ?? 0) > 1 ? r.sharedPolicyId : undefined}>
          <td>{r.scope.map((id) => <StatusChip key={id} tone="neutral">{names.service(id)}</StatusChip>)}</td>
          <td>{target(r)}{r.categoryEligible === false && <StatusChip tone="warn">{t('door.config.rule.categorySitsOut')}</StatusChip>}{r.dateScope && <span className="muted"> · {[r.dateScope.serviceDate, r.dateScope.serviceTime].filter(Boolean).join(' ')}</span>}</td>
          <td>{t(`door.config.rule.arrangement.${r.arrangement}` as Parameters<Tn>[0])}</td>
          <td>{formatMinMax(r)}</td>
          <td>{formatFrequency(r.frequency, t)}</td>
          <td>{r.exceptions.length ? <button type="button" className="btn ghost sm" onClick={() => setShowEx(r)}>{t('door.config.rule.exceptions.count', { count: r.exceptions.length })}</button> : '—'}</td>
          <td className="scheduling-table-actions">{editable && <>
            {!r.readOnly && <button type="button" className="btn ghost sm" onClick={() => { state.clear(); setDialog(r); }}>{t('door.settings.edit')}</button>}
            <button type="button" className="btn ghost sm" onClick={() => setToDelete(r)}>{t('door.config.delete')}</button>
          </>}</td>
        </tr>)}
      </tbody>
    </table>
    {rows.length === 0 && <p className="muted">{editable ? t('door.config.rules.emptyEditable') : t('door.config.rules.empty')}</p>}
    {dialog && <RuleDialog key={dialog === 'new' ? 'new' : dialog.id} rule={dialog === 'new' ? null : dialog} services={sv} categories={ck} choirs={ch}
      onClose={() => setDialog(null)} onSaved={reload} goTo={goTo} />}
    <ConfirmDialog open={!!toDelete} busy={state.working} title={t('door.config.rule.delete.title')} body={t('door.config.rule.delete.body')} confirmLabel={t('door.config.delete')}
      onCancel={() => setToDelete(null)} onConfirm={() => { const r = toDelete; setToDelete(null); if (r) void state.run(() => deleteMusicRule(r.id), reload); }} />
    <dialog ref={exRef} className="scheduling-exceptions-dialog" onClose={() => setShowEx(null)}>
      {showEx && <>
        <h3>{t('door.config.rule.exceptions')}</h3>
        <p className="muted">{target(showEx)}</p>
        <ul className="door-list">{showEx.exceptions.map((e) => <li key={e.choirId}><strong>{names.choir(e.choirId)}</strong>: {[
          e.eligible === undefined ? null : t(e.eligible ? 'door.config.rule.exception.takesPart' : 'door.config.rule.exception.sitsOut'),
          e.frequency ? formatFrequency(e.frequency as RuleFrequencyApi, t) : null,
        ].filter(Boolean).join(' · ')}</li>)}</ul>
        <form method="dialog"><button className="btn sm">{t('door.config.close')}</button></form>
      </>}
    </dialog>
  </LoadState>;
}

/* ── Choir availability (away dates). Not a rule, so it lives under the Choirs tab. ── */

function ChoirAvailabilityEditor({ canWrite }: { canWrite: boolean }) {
  const t = useT();
  const setup = useContext(SchedulingSetupContext);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const choirs = useLoad(() => fetchConfigChoirs(), 'sched-config-choirs');
  const services = useLoad(() => fetchSchedulingServices('sys-music', true), 'sched-config-services-active');
  const away = useLoad(() => fetchMusicAvailability(), 'sched-config-away');
  const name = (id: string) => choirs.data?.choirs.find((c) => c.id === id)?.name ?? id;
  const run = async (job: () => Promise<unknown>) => {
    if (busy) return; setError(''); setBusy(true);
    try { await job(); setup.saved(); away.reload(); } catch (reason) { setError(schedulingError(reason) ?? t('door.config.err.server')); } finally { setBusy(false); }
  };
  return <LoadState loading={choirs.loading || services.loading || away.loading} failed={choirs.failed || services.failed || away.failed} retry={() => { choirs.reload(); services.reload(); away.reload(); }}>
    {error && <p className="door-error" role="alert">{error}</p>}
    <ul className="door-notices">{(away.data?.availability ?? []).map((row) => <li className="panel door-notice" key={row.id}><div className="door-notice-main">
      <strong>{name(row.choirId)}</strong><p>{row.serviceDate}{row.endDate && row.endDate !== row.serviceDate ? ` → ${row.endDate}` : ''}{row.reason ? ` · ${row.reason}` : ''}</p>
      {canWrite && <button className="btn ghost sm" disabled={busy} onClick={() => void run(() => removeMusicAvailability(row.id))}>{t('door.config.delete')}</button>}
    </div></li>)}</ul>
    {!away.data?.availability.length && <EmptyState title={t('door.config.availability.empty')} />}
    {canWrite && <form className="panel door-form" onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget, data = new FormData(form);
      void run(() => addMusicAvailability({ choirId: String(data.get('choirId')), fromDate: String(data.get('fromDate')), toDate: String(data.get('toDate')), serviceCode: String(data.get('serviceCode') || '') || null, reason: String(data.get('reason') || '') || null })).then(() => form.reset());
    }}>
      <label>{t('door.config.link.choir')}<select name="choirId" required><option value="">{t('door.gov.meeting.choose')}</option>{(choirs.data?.choirs ?? []).filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>{t('door.config.unavailability.from')}<input type="date" name="fromDate" required /></label>
      <label>{t('door.config.unavailability.to')}<input type="date" name="toDate" required /></label>
      <label>{t('door.config.availability.service')}<select name="serviceCode"><option value="">{t('door.config.availability.allServices')}</option>{(services.data?.services ?? []).filter((s) => s.musicRequired).map((s) => <option key={s.id} value={s.code}>{s.name}</option>)}</select></label>
      <label>{t('door.config.availability.reason')}<input name="reason" maxLength={500} /></label>
      <button type="submit" disabled={busy} className="btn">{t('door.settings.save')}</button>
    </form>}
  </LoadState>;
}

/* ───────────────────────── Protocol ───────────────────────── */

export function ProtocolRulesEditor({ systemId, canWrite }: Props) {
  const t = useT();
  const editable = canWrite && systemId === "sys-protocol";
  const list = useLoad(() => fetchProtocolServiceRules(systemId), `sched-config-protocol|${systemId}`);
  const services = useLoad(() => fetchSchedulingServices("sys-protocol"), "sched-config-protocol-services");
  const state = useSaveState();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProtocolServiceRuleApi | null>(null);
  const rows = list.data?.rules ?? [];
  const cancel = () => { setEditing(null); setFormOpen(false); state.clear(); };
  const submit = async (data: FormData) => {
    const dates = data.getAll("overrideDate").map((value) => String(value).trim());
    const sizes = data.getAll("overrideSize").map((value) => String(value).trim());
    const teamSizeOverrides: Record<string, number> = {};
    for (let index = 0; index < Math.max(dates.length, sizes.length); index += 1) {
      const date = dates[index] ?? "";
      const sizeText = sizes[index] ?? "";
      if (!date && !sizeText) continue;
      const size = Number(sizeText);
      if (!date || !Number.isInteger(size) || size <= 0 || teamSizeOverrides[date] !== undefined) {
        state.clear();
        throw new Error(t("door.config.err.teamOverrides"));
      }
      teamSizeOverrides[date] = size;
    }
    const patch = {
      serviceId: str(data, "serviceId"), active: flag(data, "active"),
      required: flag(data, "required"), defaultTeamSize: num(data, "defaultTeamSize", 10),
      teamSizeOverrides, requireChoir: flag(data, "requireChoir"),
      requireWorship: flag(data, "requireWorship"),
      relaxableKinds: preserveRelaxableKinds(editing?.relaxableKinds ?? [], data.getAll("relaxableKind").map(String)),
    };
    const ok = await state.run(
      () => editing ? updateProtocolServiceRule(editing.id, patch)
        : createProtocolServiceRule({ ...patch, systemId: "sys-protocol" }),
      list.reload,
    );
    if (ok) cancel();
  };
  return (
    <LoadState loading={list.loading || services.loading} failed={list.failed || services.failed}
      retry={() => { list.reload(); services.reload(); }}>
      <SectionNotice>{t("door.config.protocol.behaviorNotice")}</SectionNotice>
      {editable && !formOpen && <AddToggle onClick={() => { setEditing(null); setFormOpen(true); state.clear(); }} />}
      <FormNotice state={state} />
      <EmptyOrLocked canEdit={editable} empty={rows.length === 0} emptyKey="door.config.protocol.empty" />
      <ul className="door-notices">{rows.map((row) => {
        const service = services.data?.services.find((item) => item.id === row.serviceId || item.code === row.serviceCode);
        return <li key={row.id} className="panel door-notice">
        <div className="door-notice-main">
          <div className="scheduling-config-version-heading">
            <strong>{service?.name ?? t("door.config.nameUnavailable.service")}</strong>
            <StatusChip tone={row.active ? "success" : "neutral"}>
              {row.active ? t("door.config.service.active") : t("door.config.service.inactive")}
            </StatusChip>
          </div>
          <p className="muted">{t("door.config.protocol.targetSummary", { count: row.defaultTeamSize, overrides: Object.keys(row.teamSizeOverrides).length })}</p>
          {editable && <EditToggle onClick={() => { setEditing(row); setFormOpen(true); state.clear(); }} />}
        </div>
      </li>;
      })}</ul>
      {editable && formOpen && <SaveForm key={editing?.id ?? "new"} title={editing ? t("door.config.editRule") : t("door.config.addRule")}
        state={state} editing={!!editing} working={state.working} onCancel={cancel} onSubmit={submit}>
        <SelectField label={t("door.config.tab.services")} name="serviceId" value={editing?.serviceId} required
          options={(services.data?.services ?? []).filter((row) => row.active).map((row) => ({ value: row.id, label: row.name }))} />
        <TextField label={t("door.config.protocol.defaultTeamSize")} name="defaultTeamSize" type="number" min={1} value={editing?.defaultTeamSize ?? 10} required />
        <CheckField label={t("door.config.protocol.required")} name="required" checked={editing?.required ?? true} />
        <TeamSizeOverridesField overrides={editing?.teamSizeOverrides ?? {}} />
        <CheckField label={t("door.config.service.active")} name="active" checked={editing?.active ?? true} />
        <CheckField label={t("door.config.protocol.requireChoir")} name="requireChoir" checked={editing?.requireChoir ?? true} />
        <CheckField label={t("door.config.protocol.requireWorship")} name="requireWorship" checked={editing?.requireWorship ?? true} />
        <fieldset className="scheduling-config-overrides">
          <legend>{t("door.config.protocol.relaxable")}</legend>
          {(["SS1", "SS2", "TUESDAY", "IGABURO"] as const).map((kind) => (
            <CheckField key={kind} label={t(`door.config.serviceCode.${kind}` as Parameters<typeof t>[0])}
              name="relaxableKind" value={kind} checked={editing?.relaxableKinds.some((value) => value.toUpperCase() === kind) ?? false} />
          ))}
        </fieldset>
      </SaveForm>}
    </LoadState>
  );
}

export function ProtocolDutyEditor({ systemId, canWrite }: Props) {
  const t = useT();
  const editable = canWrite && systemId === "sys-protocol";
  const policy = useLoad(() => fetchProtocolDutyPolicy(systemId), `sched-config-duty|${systemId}`);
  const state = useSaveState();
  const row = policy.data?.policy ?? null;
  const submit = async (data: FormData) => {
    const patch = {
      preferTarget: num(data, "preferTarget", 3), softMax: num(data, "softMax", 3), hardMax: num(data, "hardMax", 4),
      extraDutyPolicy: str(data, "extraDutyPolicy"),
      duplicateSameDayAllowed: flag(data, "duplicateSameDayAllowed"),
      musicCompatibilityRequired: flag(data, "musicCompatibilityRequired"),
      leadershipPriorities: row?.leadershipPriorities ?? [],
      exceptionsAllowed: row?.exceptionsAllowed ?? true,
    };
    if (patch.softMax! < patch.preferTarget! || patch.hardMax! < patch.softMax!) {
      state.clear();
      throw new Error(t("door.config.err.minMaxDuty"));
    }
    await state.run(
      () => row
        ? updateProtocolDutyPolicy(row.id, patch)
        : createProtocolDutyPolicy({ ...patch, systemId: "sys-protocol" }),
      policy.reload,
    );
  };
  return (
    <LoadState loading={policy.loading} failed={policy.failed} retry={policy.reload}>
      <FormNotice state={state} />
      <SectionNotice tone="warn">{t("door.config.duty.behaviorNotice")}</SectionNotice>
      {row && <div className="panel">
        <h4>{t("door.config.duty.usedHeading")}</h4>
        <ul className="door-list">
          <li><strong>{t("door.config.duty.preferTarget")}:</strong> {row.preferTarget}</li>
          <li><strong>{t("door.config.duty.softMax")}:</strong> {row.softMax}</li>
          <li><strong>{t("door.config.duty.hardMax")}:</strong> {row.hardMax}</li>
        </ul>
        <p className="scheduling-config-notice">{t("door.config.duty.usedNotice")}</p>
        <h4>{t("door.config.duty.notUsedHeading")}</h4>
        <ul className="door-list">
          <li><strong>{t("door.config.duty.extra")}:</strong> {extraDutyPolicyName(row.extraDutyPolicy, t)}</li>
          <li><strong>{t("door.config.duty.duplicate")}:</strong> {row.duplicateSameDayAllowed ? t("door.config.form.yes") : t("door.config.form.no")}</li>
          <li><strong>{t("door.config.duty.music")}:</strong> {row.musicCompatibilityRequired ? t("door.config.form.yes") : t("door.config.form.no")}</li>
          <li><strong>{t("door.config.duty.leadership")}:</strong> {row.leadershipPriorities.length ? row.leadershipPriorities.join(", ") : t("door.config.form.none")}</li>
          <li><strong>{t("door.config.duty.exceptions")}:</strong> {row.exceptionsAllowed ? t("door.config.form.yes") : t("door.config.form.no")}</li>
        </ul>
        <p className="scheduling-config-notice is-warning">{t("door.config.duty.notUsedNotice")}</p>
      </div>}
      {!row && <EmptyOrLocked canEdit={editable} empty emptyKey="door.config.duty.empty" />}
      {editable && <SaveForm key={row?.id ?? "new"} title={row ? t("door.config.editDuty") : t("door.config.addDuty")} state={state}
        editing={false} working={state.working} onCancel={() => state.clear()} onSubmit={submit}>
        <SelectField label={t("door.config.duty.extra")} name="extraDutyPolicy" value={row?.extraDutyPolicy ?? "ALLOW_WHEN_SHORT"} options={["ALLOW_WHEN_SHORT", "NEVER", "ALWAYS"].map(value => ({value, label: extraDutyPolicyName(value as "ALLOW_WHEN_SHORT", t)}))} />
        <CheckField label={t("door.config.duty.duplicate")} name="duplicateSameDayAllowed" checked={row?.duplicateSameDayAllowed ?? false} />
        <CheckField label={t("door.config.duty.music")} name="musicCompatibilityRequired" checked={row?.musicCompatibilityRequired ?? true} />
        <TextField label={t("door.config.duty.preferTarget")} name="preferTarget" type="number" min={1} value={row?.preferTarget ?? 3} required />
        <TextField label={t("door.config.duty.softMax")} name="softMax" type="number" min={1} value={row?.softMax ?? 3} required />
        <TextField label={t("door.config.duty.hardMax")} name="hardMax" type="number" min={1} value={row?.hardMax ?? 4} required />
      </SaveForm>}
    </LoadState>
  );
}
```

**Why one file, not several.** The four editors share the same save/notice/draft plumbing (`useSaveState`, `useDraft`, `SchedulingSetupContext`) and the Protocol editors already live here. Splitting would mean exporting those internals. The Rule dialog (about 190 lines) is the one piece that would justify its own file if it grows; say if you want it split now.

### `src/newdesign/schedulingConfig.css`
_Table, segmented control and dialog styling. New file; adjust to your tokens._

```css
/* Scheduling configuration tables and the rule dialog. Plain structure; colours come from the app's tokens. */
.scheduling-table { width: 100%; border-collapse: collapse; margin-block: 0.75rem; }
.scheduling-table th, .scheduling-table td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--border, #ddd); vertical-align: top; }
.scheduling-table th { font-weight: 600; white-space: nowrap; }
.scheduling-table tr.is-inactive td { opacity: 0.55; }
.scheduling-table tr.is-editing td { background: var(--surface-2, rgba(0, 0, 0, 0.03)); }
.scheduling-table input:not([type='checkbox']), .scheduling-table select { width: 100%; min-width: 5rem; }
.scheduling-table-actions { white-space: nowrap; text-align: right; }
.scheduling-table tr[data-shared] td:first-child { box-shadow: inset 3px 0 0 var(--accent, #6b7cff); }
.scheduling-rules-preview { margin-block: 0.5rem; line-height: 1.5; }
.scheduling-segmented { display: inline-flex; gap: 0.25rem; }
.scheduling-rule-dialog fieldset { border: 0; padding: 0; margin: 0 0 1rem; display: grid; gap: 0.35rem; }
.scheduling-rule-dialog legend { font-weight: 600; margin-bottom: 0.25rem; }
.scheduling-exceptions-dialog { max-width: 28rem; }
@media (max-width: 720px) { .scheduling-table { display: block; overflow-x: auto; } }
```

### `src/newdesign/DoorSchedulingConfigPage.tsx (diff)`
_Wizard and step navigation out; four plain tabs; old bookmarks redirected._

```diff
--- a/src/newdesign/DoorSchedulingConfigPage.tsx
+++ b/src/newdesign/DoorSchedulingConfigPage.tsx
@@ -1,4 +1,3 @@
-import { MusicParticipationEditor } from "./MusicParticipationEditor";
 import { Link, UNSAFE_DataRouterContext, useBlocker, useParams, useSearchParams } from "react-router-dom";
 import { useContext, useEffect, useRef, useState } from "react";
 import { SchedulingSetupContext } from './SchedulingSetupContext';
@@ -14,19 +13,20 @@
 import { ConfirmDialog, PageHeader, StatusChip } from "./kit";
 import {
   CategoriesEditor,
-  LinksEditor,
-  PoliciesEditor,
+  ChoirsEditor,
   ProtocolDutyEditor,
   ProtocolRulesEditor,
+  RulesEditor,
   ServicesEditor,
 } from "./SchedulingConfigEditors";
 import {
   configTabsForSystem,
   configTabKey,
-  MUSIC_SETUP_STEPS, musicSetupStep,
+  normalizeConfigTab,
 } from "./config";
 
 /**
+ * Music setup is four tabs (Services, Choir categories, Choirs, Rules); Protocol shows Services, Team rules, Duty.
  * Configuration is LIVE: every save applies at once and is picked up by the next generate call.
  * There are no drafts, versions or activation. Because nothing isolates an edit, the server lets one
  * person edit at a time (see server/src/scheduling/editLock.ts). This page takes that lock on mount,
@@ -55,7 +55,6 @@
   const [searchParams, setSearchParams] = useSearchParams();
   const hasDataRouter = !!useContext(UNSAFE_DataRouterContext);
   const tabs = configTabsForSystem(systemId);
-  const isMusic = systemId === 'sys-music';
   const [unsaved, setUnsaved] = useState(false);
   const [navigationError, setNavigationError] = useState('');
   const [lock, setLock] = useState<LockState>('pending');
@@ -66,10 +65,7 @@
   // Editors only get canWrite when the person may edit AND holds the lock.
   const canWrite = mayEdit && lock === 'held';
   const validation = useLoad(() => fetchConfigValidation(systemId), `sched-config-validation|${systemId}`);
-  const requestedTab = searchParams.get("tab");
-  const tab = tabs.find((candidate) => candidate === requestedTab) ?? "services";
-  const step = musicSetupStep(tab);
-  const stepKeys = ['services', 'choirs', 'rules'] as const;
+  const tab = normalizeConfigTab(searchParams.get("tab"), tabs);
 
   // Lock lifecycle: acquire on mount, heartbeat while open, release on unmount or pagehide.
   const holding = useRef(false);
@@ -130,6 +126,7 @@
       return next;
     });
   };
+  const goTo = (next: string) => selectTab(next);
   const systemName = systemId === "sys-music" ? t("door.config.system.music")
     : systemId === "sys-protocol" ? t("door.config.system.protocol")
       : t("door.config.system.unknown");
@@ -151,49 +148,31 @@
         <strong>{t('door.config.validation.heading')}</strong>
         <ul className="door-list">{validation.data.errors.map((message) => <li key={message}>{message}</li>)}</ul>
       </div>}
-      {isMusic ? <nav className="scheduling-steps" aria-label={t('door.config.setup.steps')}>
-        {MUSIC_SETUP_STEPS.map((key, index) => <button key={key} type="button" className={'btn ' + (index === step ? '' : 'ghost')}
-          aria-current={index === step ? 'step' : undefined} onClick={() => selectTab(key)}>
-          <span>{index + 1}</span> {t(`door.config.step.${stepKeys[index]}`)}
-        </button>)}
-      </nav> : <nav className="door-menu" aria-label={t("door.config.tabs")}>
+      <nav className="door-menu" aria-label={t("door.config.tabs")}>
         {tabs.map((key) => (
           <button key={key} type="button" className={"door-menu-link" + (tab === key ? " active" : "")}
             aria-current={tab === key ? "page" : undefined} onClick={() => selectTab(key)}>
             {t(configTabKey(key))}
           </button>
         ))}
-      </nav>}
+      </nav>
       {navigationError && <p className="door-error" role="alert">{navigationError}</p>}
       <header className="scheduling-config-section">
-        <h3>{isMusic ? t(`door.config.setup.question.${stepKeys[step]}`) : t(configTabKey(tab))}</h3>
-        {isMusic ? <p>{t('door.config.setup.progress', { step: step + 1 })}</p> : <p className="muted">{t(tabCopyKey)}</p>}
+        <h3>{t(configTabKey(tab))}</h3>
+        <p className="muted">{t(tabCopyKey)}</p>
       </header>
       <LoadState loading={lock === 'pending' && mayEdit} failed={false} retry={() => {}}>
         <SchedulingSetupContext.Provider value={{ saved: () => { setUnsaved(false); setNavigationError(''); validation.reload(); }, changed: () => setUnsaved(true) }}>
           <div onChangeCapture={() => setUnsaved(true)}>
             {tab === "services" && <ServicesEditor systemId={systemId} canWrite={canWrite} />}
-            {isMusic && step === 1 && <>
-              <LinksEditor systemId={systemId} canWrite={canWrite} />
-              <details open={tab === 'categories'} className="scheduling-config-advanced"><summary>{t('door.config.setup.categories')}</summary>
-                <CategoriesEditor systemId={systemId} canWrite={canWrite} />
-              </details>
-            </>}
-            {isMusic && step === 2 && <>
-              <PoliciesEditor systemId={systemId} canWrite={canWrite} />
-              {(['fixed', 'availability'] as const).map(mode => <details key={mode} className="scheduling-config-advanced" open={tab === mode}>
-                <summary>{t(configTabKey(mode))}</summary><MusicParticipationEditor key={mode} mode={mode} canWrite={canWrite} />
-              </details>)}
-            </>}
+            {tab === "categories" && <CategoriesEditor systemId={systemId} canWrite={canWrite} />}
+            {tab === "choirs" && <ChoirsEditor systemId={systemId} canWrite={canWrite} />}
+            {tab === "rules" && <RulesEditor systemId={systemId} canWrite={canWrite} goTo={goTo} />}
             {tab === "protocol" && <ProtocolRulesEditor systemId={systemId} canWrite={canWrite} />}
             {tab === "duty" && <ProtocolDutyEditor systemId={systemId} canWrite={canWrite} />}
           </div>
         </SchedulingSetupContext.Provider>
       </LoadState>
-      {isMusic && <div className="door-row scheduling-step-actions">
-        {step > 0 && <button type="button" className="btn ghost" onClick={() => selectTab(MUSIC_SETUP_STEPS[step - 1])}>{t('door.config.setup.back')}</button>}
-        {step < MUSIC_SETUP_STEPS.length - 1 && <button type="button" className="btn" onClick={() => selectTab(MUSIC_SETUP_STEPS[step + 1])}>{t('door.config.setup.continue')}</button>}
-      </div>}
       {hasDataRouter && <LeaveGuard when={unsaved} />}
     </section>
   );
```

### `src/newdesign/config.ts (diff)`
_Tabs, redirect map, and the text helpers (frequency string, min/max, one sentence per rule)._

```diff
--- a/src/newdesign/config.ts
+++ b/src/newdesign/config.ts
@@ -11,7 +11,9 @@
   ChoirCategoryLinkApi,
   PlanningMode,
   ProtocolDutyPolicyApi,
+  MusicRuleApi,
   ProtocolServiceRuleApi,
+  RuleFrequencyApi,
   Recurrence,
   SchedulingServiceApi,
 } from '../api/frontDoorApi';
@@ -30,14 +32,12 @@
   'door.caring.weekday.6',
 ] as const satisfies readonly MessageKey[];
 
-/** The seven tabs of the configuration page, in the order they appear. */
+/** The tabs of the configuration page. Music shows the first four, in this order; Protocol shows services, protocol, duty. */
 export const CONFIG_TABS = [
   'services',
   'categories',
-  'policies',
-  'links',
-  'fixed',
-  'availability',
+  'choirs',
+  'rules',
   'protocol',
   'duty',
 ] as const;
@@ -52,13 +52,12 @@
 
 export const configTabKey = (tab: ConfigTab): MessageKey => `door.config.tab.${tab}`;
 
-/** Music setup is three tabs: Services, Choirs, Rules. There is no review or activation step. */
-export const MUSIC_SETUP_STEPS = ['services','links','policies'] as const;
-export function musicSetupStep(tab: string): number {
-  if (tab === 'categories' || tab === 'links') return 1;
-  if (tab === 'policies' || tab === 'fixed' || tab === 'availability') return 2;
-  return 0;
-}
+/** Old bookmarks (?tab=links, policies, fixed, availability, review, versions) land on the tab that now owns the content. */
+export const normalizeConfigTab = (raw: string | null, tabs: readonly ConfigTab[]): ConfigTab => {
+  const moved: Record<string, ConfigTab> = { links: 'choirs', availability: 'choirs', policies: 'rules', fixed: 'rules' };
+  const wanted = (raw && moved[raw]) || raw;
+  return tabs.find((tab) => tab === wanted) ?? tabs[0] ?? 'services';
+};
 
 /** A weekday 0-6 (Sunday-first) as a translated name. */
 export const weekdayName = (t: TFn, weekday: number | null): string => {
@@ -148,3 +147,49 @@
 /** The human name of an extra-duty policy. */
 export const extraDutyPolicyName = (p: ProtocolDutyPolicyApi['extraDutyPolicy'], t: TFn): string =>
   t(extraDutyPolicyKey(p));
+
+/* ─── Rules, in words ─── */
+
+const FREQUENCY_SYMBOL = { MINIMUM: '≥', TARGET: '=', MAXIMUM: '≤' } as const;
+
+/** "≥ 2 / month", "= 1 / quarter", "≤ 3 / year", or "—". Accepts the partial frequency of an exception. */
+export const formatFrequency = (f: Partial<RuleFrequencyApi> | null | undefined, t: TFn): string => {
+  if (!f || (f.target === undefined && f.kind === undefined && f.period === undefined)) return '—';
+  const per = f.period ? ` / ${t(`door.config.rules.per.${f.period}` as MessageKey)}` : '';
+  const dates = f.counting === 'DISTINCT_DATES' ? ` (${t('door.config.rules.perDates')})` : '';
+  return `${f.kind ? FREQUENCY_SYMBOL[f.kind] + ' ' : ''}${f.target ?? ''}${per}${dates}`.trim();
+};
+
+/** "0–1", "2–∞", or blank when the rule has no counts (Fixed and Manual rules, or a rotation with neither set). */
+export const formatMinMax = (r: Pick<MusicRuleApi, 'minCount' | 'maxCount'>): string =>
+  r.minCount === null && r.maxCount === null ? '' : `${r.minCount ?? 0}–${r.maxCount ?? '∞'}`;
+
+export interface RuleNames {
+  /** Weekday-qualified label, for pickers and chips. */
+  service: (id: string) => string;
+  /** Plain service name, for sentences. */
+  serviceShort: (id: string) => string;
+  category: (id: string) => string;
+  choir: (id: string) => string;
+}
+
+const list = (items: string[]) => {
+  try { return new Intl.ListFormat(undefined, { style: 'long', type: 'conjunction' }).format(items); } catch { return items.join(', '); }
+};
+
+/** One English sentence per rule, assembled from the rule's fields and translated phrase templates. */
+export const ruleSentences = (rules: MusicRuleApi[], names: RuleNames, t: TFn): string[] =>
+  rules.map((r) => {
+    const extra: string[] = [];
+    if (r.minCount !== null && r.maxCount !== null) extra.push(t('door.config.rules.count', { min: r.minCount, max: r.maxCount }));
+    else if (r.minCount !== null) extra.push(t('door.config.rules.countMin', { min: r.minCount }));
+    else if (r.maxCount !== null) extra.push(t('door.config.rules.countMax', { max: r.maxCount }));
+    if (r.requireAll) extra.push(t('door.config.rules.everyChoir'));
+    if (r.frequency) extra.push(formatFrequency(r.frequency, t));
+    return t('door.config.rules.sentence', {
+      target: r.target.kind === 'category' ? names.category(r.target.categoryId) : names.choir(r.target.choirId),
+      how: t(`door.config.rules.how.${r.arrangement}` as MessageKey),
+      services: list(r.scope.map(names.serviceShort)),
+      extra: extra.map((part) => `, ${part}`).join(''),
+    });
+  });
```

### `src/newdesign/schedulingForms.ts (diff)`
_Exception-form helper removed; errors are de-duplicated._

```diff
--- a/src/newdesign/schedulingForms.ts
+++ b/src/newdesign/schedulingForms.ts
@@ -1,32 +1,9 @@
 import { ApiError } from '../api/client';
-import type { ChoirCategoryLinkApi } from '../api/frontDoorApi';
 export function schedulingError(reason: unknown): string | null {
   if (!(reason instanceof ApiError) || reason.status < 400 || reason.status >= 500) return null;
   const body = reason.body as { error?: string; message?: string; errors?: string[]; holder?: { name?: string | null }; issues?: Array<string | { message?: string }> } | undefined;
   // 422 from saveConfigChange carries `errors: string[]`; 409 LOCKED / SCHEDULE_FROZEN carry `message`.
   const parts = [body?.message ?? body?.error, ...(body?.errors ?? []), ...(body?.issues ?? []).map(row => typeof row === 'string' ? row : row.message)];
-  return parts.filter(Boolean).join(' · ') || null;
-}
-export function musicExceptions(data: FormData, previous?: ChoirCategoryLinkApi | null) {
-  const eligibleOverride = { ...previous?.eligibleOverride };
-  const frequencyOverride = { ...previous?.frequencyOverride };
-  for (const value of data.getAll('exceptionCode')) {
-    const code = String(value);
-    const key = (map: Record<string, unknown>) => Object.keys(map).find(k => k.toLowerCase() === code.toLowerCase()) ?? code;
-    const eligibleKey = key(eligibleOverride), frequencyKey = key(frequencyOverride);
-    const eligible = data.get('eligible:' + code);
-    if (eligible === 'inherit') delete eligibleOverride[eligibleKey];
-    else if (eligible === 'yes' || eligible === 'no') eligibleOverride[eligibleKey] = eligible === 'yes';
-    const stored = frequencyOverride[frequencyKey];
-    const next: Record<string, unknown> = { ...(stored && typeof stored === 'object' ? stored : {}) };
-    for (const [field, property] of [['target','frequencyTarget'],['kind','frequencyKind'],['period','frequencyPeriod']] as const) {
-      const value = data.get(field + ':' + code);
-      if (value === '') delete next[property];
-      else if (value !== null) next[property] = field === 'target' ? Number(value) : String(value);
-    }
-    if (Object.keys(next).length) frequencyOverride[frequencyKey] = next;
-    else delete frequencyOverride[frequencyKey];
-  }
-  return { eligibleOverride, frequencyOverride };
+  return [...new Set(parts.filter(Boolean))].join(' · ') || null;
 }
 export const preserveRelaxableKinds = (prior: string[], selected: string[]) => [...prior.filter(k => !['SS1', 'SS2', 'TUESDAY', 'IGABURO'].includes(k.toUpperCase())), ...selected];
```

### `src/api/frontDoorApi.ts (diff)`
_Rule and choir calls added; table-level clients marked @deprecated, not removed._

```diff
--- a/src/api/frontDoorApi.ts
+++ b/src/api/frontDoorApi.ts
@@ -2143,6 +2143,7 @@
 export type Recurrence = 'WEEKLY' | 'MONTHLY' | 'SELECTED_DATES' | 'CUSTOM';
 export type FrequencyCounting = 'ASSIGNMENTS' | 'DISTINCT_DATES';
 export type FrequencyKind = 'MINIMUM' | 'TARGET' | 'MAXIMUM';
+export type FrequencyPeriod = 'MONTH' | 'QUARTER' | 'HALF_YEAR' | 'YEAR';
 export type PlanningMode = 'ROTATION' | 'FIXED' | 'MANUAL';
 
 const SC = '/api/scheduling/config';
@@ -2157,7 +2158,9 @@
   scGet('/services', systemId, activeOnly ? { active: 'true' } : {});
 export const fetchChoirCategories = (systemId: string, activeOnly = false): Promise<{ categories: ChoirCategoryApi[] }> =>
   scGet('/categories', systemId, activeOnly ? { active: 'true' } : {});
+/** @deprecated the Rules tab replaces policy editing; kept for the schedule page's read-only rule context. */
 export const fetchCategoryServicePolicies = (systemId: string): Promise<{ policies: CategoryServicePolicyApi[] }> => scGet('/policies', systemId);
+/** @deprecated use fetchConfigChoirs (a choir has one category; "links" are an implementation term). */
 export const fetchChoirCategoryLinks = (systemId: string): Promise<{ links: ChoirCategoryLinkApi[] }> => scGet('/links', systemId);
 export const fetchProtocolServiceRules = (systemId: string): Promise<{ rules: ProtocolServiceRuleApi[] }> => scGet('/protocol/rules', systemId);
 export const fetchProtocolDutyPolicy = (systemId: string): Promise<{ policy: ProtocolDutyPolicyApi | null }> => scGet('/protocol/policy', systemId);
@@ -2166,7 +2169,9 @@
 
 export const createSchedulingService = (body: object) => scPost('/services', body);
 export const createChoirCategory = (body: object) => scPost('/categories', body);
+/** @deprecated not used by the UI any more; Rules write these tables server-side. */
 export const createCategoryServicePolicy = (body: object) => scPost('/policies', body);
+/** @deprecated not used by the UI any more; Rules write these tables server-side. */
 export const createChoirCategoryLink = (body: object) => scPost('/links', body);
 export const createProtocolServiceRule = (body: object) => scPost('/protocol/rules', body);
 export const createProtocolDutyPolicy = (body: object) => scPost('/protocol/policy', body);
@@ -2174,8 +2179,10 @@
   apiFetch(`${SC}/services/${encodeURIComponent(id)}`, { method: 'PATCH', body: { patch } });
 export const updateChoirCategory = (id: string, patch: object) =>
   apiFetch(`${SC}/categories/${encodeURIComponent(id)}`, { method: 'PATCH', body: { patch } });
+/** @deprecated not used by the UI any more; Rules write these tables server-side. */
 export const updateCategoryServicePolicy = (id: string, patch: object) =>
   apiFetch(`${SC}/policies/${encodeURIComponent(id)}`, { method: 'PATCH', body: { patch } });
+/** @deprecated not used by the UI any more; Rules write these tables server-side. */
 export const updateChoirCategoryLink = (id: string, patch: object) =>
   apiFetch(`${SC}/links/${encodeURIComponent(id)}`, { method: 'PATCH', body: { patch } });
 export const updateProtocolServiceRule = (id: string, patch: object) =>
@@ -2184,6 +2191,27 @@
   apiFetch(`${SC}/protocol/policy/${encodeURIComponent(id)}`, { method: 'PATCH', body: { patch } });
 export const retireSchedulingService = (id: string) => apiFetch(`${SC}/services/${encodeURIComponent(id)}/retire`, { method: 'POST', body: {} });
 
+/* ─── Rules: the only scheduling concept the Music setup screens speak. The tables behind them stay server-side. ─── */
+export type RuleFrequencyApi = { kind: FrequencyKind; target: number; period: FrequencyPeriod; counting: FrequencyCounting };
+export type RuleExceptionApi = { choirId: string; eligible?: boolean; frequency?: Partial<RuleFrequencyApi> };
+export type RuleTargetApi = { kind: 'category'; categoryId: string } | { kind: 'choir'; choirId: string };
+export type MusicRuleInputApi = {
+  scope: string[]; target: RuleTargetApi; arrangement: PlanningMode; minCount?: number | null; maxCount?: number | null;
+  frequency?: RuleFrequencyApi | null; requireAll?: boolean; exceptions?: RuleExceptionApi[];
+};
+export type MusicRuleApi = Required<Pick<MusicRuleInputApi, 'scope' | 'target' | 'arrangement'>> & {
+  id: string; minCount: number | null; maxCount: number | null; frequency: RuleFrequencyApi | null; requireAll: boolean; exceptions: RuleExceptionApi[];
+  /** Choir rules on the same underlying policy share it, so the table can group them. */
+  sharedPolicyId?: string; categoryEligible?: boolean; dateScope?: { serviceDate: string | null; serviceTime: string | null }; readOnly?: boolean;
+};
+export type ConfigChoirApi = { id: string; name: string; active: boolean; categoryId: string | null };
+export const fetchMusicRules = () => scGet<{ rules: MusicRuleApi[]; warnings: Array<{ code: string; choirId: string; message: string }> }>('/rules', 'sys-music');
+export const fetchConfigChoirs = () => scGet<{ choirs: ConfigChoirApi[] }>('/choirs', 'sys-music');
+export const createMusicRule = (body: MusicRuleInputApi) => scPost('/rules', body);
+export const updateMusicRule = (id: string, patch: Partial<MusicRuleInputApi>) => apiFetch(`${SC}/rules/${encodeURIComponent(id)}`, { method: 'PATCH', body: { patch } });
+export const deleteMusicRule = (id: string) => apiFetch(`${SC}/rules/${encodeURIComponent(id)}`, { method: 'DELETE' });
+export const setChoirCategory = (choirId: string, categoryId: string) => apiFetch(`${SC}/choirs/${encodeURIComponent(choirId)}/category`, { method: 'PUT', body: { categoryId } });
+
 /** The person holding a system's configuration edit lock. */
 export type ConfigLockHolder = { personId: string; name: string | null; since: string; expiresAt: string };
 /** Take the edit lock. Rejects with ApiError 409 and body.holder when someone else is editing. */
@@ -2193,8 +2221,11 @@
 
 export type MusicFixedAssignmentApi = { id: string; choirId: string; categoryServicePolicyId: string; serviceDate?:string|null; serviceTime?:string|null };
 export type MusicAvailabilityApi = { id: string; choirId: string; serviceDate: string; endDate?:string|null; serviceCode: string | null; reason: string | null };
+/** @deprecated not used by the UI any more; Rules write these tables server-side. */
 export const fetchMusicFixedAssignments = () => scGet<{ assignments: MusicFixedAssignmentApi[] }>('/fixed-assignments', 'sys-music');
+/** @deprecated not used by the UI any more; Rules write these tables server-side. */
 export const addMusicFixedAssignment = (body: object) => scPost('/fixed-assignments', { ...body, systemId: 'sys-music' });
+/** @deprecated not used by the UI any more; Rules write these tables server-side. */
 export const removeMusicFixedAssignment = (id: string) => apiFetch(SC + '/fixed-assignments/' + encodeURIComponent(id), { method: 'DELETE' });
 export const fetchMusicAvailability = (date = '') => scGet<{ availability: MusicAvailabilityApi[] }>('/availability', 'sys-music', date ? { serviceDate: date } : {});
 export const addMusicAvailability = (body: object) => scPost('/availability', { ...body, systemId: 'sys-music' });
```

**Deleted:** `src/newdesign/MusicParticipationEditor.tsx`. Its *fixed* mode is now the Rules tab. Its *availability* mode (choir away dates) is not a rule, so deleting it outright would have lost a feature. That form now lives in a collapsed "Choir away dates" section under the Choirs tab (`ChoirAvailabilityEditor` inside the editors file). Four tabs stay four. `// TODO(confirm)`: if you would rather drop away dates from this screen, remove that section.

**Generation copy.** The Music generate panel already shows "Configuration is applied at generate time. Confirmed and published schedules are frozen and will not be rebuilt." (`door.scheduling.generateNote`, added last session). The Protocol generate screen is not in my staged files, so it does not have it yet. `// TODO(confirm)`: send me `ProtocolPage` (or whichever file hosts its generate button) and I will add the same line.

---

## 5. Tests

### `server/src/scheduling/configRules.test.ts`
_Rule API: 422 parity with the table edit, round trips, lock, audit. In-memory Prisma stand-in; swap for your fakePrisma if you have one._

```ts
/**
 * Rule API tests. They drive `saveConfigChange` (the single write path every /config/rules route calls) against
 * an in-memory stand-in for Prisma, so no database is needed.
 * TODO(confirm): if the repo already has a shared `fakePrisma`, swap `fake` below for it; only the delegates
 * named in `MODELS` are used.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  tables: {} as Record<string, any[]>,
  audits: [] as any[],
  lock: { held: true, holder: null as null | { personId: string; name: string | null; since: string; expiresAt: string } },
}));

vi.mock('../lib/prisma.js', () => {
  const match = (row: any, where: any = {}) => Object.entries(where).every(([k, v]) => v === undefined || (typeof v === 'object' && v !== null ? true : row[k] === v));
  const delegate = (name: string) => ({
    findMany: async ({ where }: any = {}) => h.tables[name].filter((r) => match(r, where)).map((r) => ({ ...r })),
    create: async ({ data }: any) => { h.tables[name].push({ ...data }); return data; },
    update: async ({ where, data }: any) => { Object.assign(h.tables[name].find((r) => r.id === where.id), data); },
    delete: async ({ where }: any) => { h.tables[name].splice(h.tables[name].findIndex((r) => r.id === where.id), 1); },
    updateMany: async () => ({ count: 1 }),
  });
  const models = ['schedulingService', 'choirCategory', 'categoryServicePolicy', 'choirCategoryLink', 'musicFixedAssignment', 'musicChoir', 'musicChoirUnavailability', 'configEditLock'];
  const prisma: any = Object.fromEntries(models.map((m) => [m, delegate(m)]));
  prisma.auditEvent = { create: async ({ data }: any) => { h.audits.push(data); } };
  prisma.$transaction = async (fn: any) => {
    const snapshot = JSON.stringify(h.tables), auditCount = h.audits.length;
    try { return await fn(prisma); } catch (error) {
      h.tables = JSON.parse(snapshot, (_k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT.*Z$/.test(v) ? new Date(v) : v));
      h.audits.length = auditCount; throw error;
    }
  };
  return { prisma };
});
vi.mock('../notifications/feed.js', () => ({ loadAccessData: async () => ({ data: {} }) }));
vi.mock('./rules.js', () => ({ canWriteConfig: () => true, canReadConfig: () => true }));
vi.mock('./editLock.js', () => ({ LOCK_TTL_MS: 900_000, checkEditLock: async () => h.lock }));
vi.mock('../music/engine.js', () => ({ buildMusicCalendar: () => [] }));

import { ConfigError, readRuleModel, saveConfigChange, type ConfigOp } from './saveConfigChange.js';

const NOW = new Date('2026-01-01T00:00:00Z');
const stamp = { createdByPersonId: 'p-admin', createdAt: NOW, systemId: 'sys-music' };
const service = (id: string, code: string, name: string, weekday: number, order: number) => ({
  ...stamp, id, code, name, kind: 'SERVICE', weekday, time: null, recurrence: 'WEEKLY', selectedDatesJson: '[]', active: true,
  musicRequired: true, protocolRequired: true, maxChoirs: 3, targetTeamSize: 10, displayOrder: order,
});
const category = (id: string, code: string, name: string, active = true) => ({ ...stamp, id, code, name, description: '', active });
const policy = (id: string, categoryId: string, serviceId: string) => ({
  ...stamp, id, categoryId, serviceId, active: true, eligible: false, frequencyTarget: null, frequencyCounting: 'ASSIGNMENTS',
  frequencyKind: 'TARGET', frequencyPeriod: null, planningMode: 'ROTATION', minCount: null, maxCount: null, requireAll: false,
});
const link = (id: string, choirId: string, categoryId: string) => ({ ...stamp, id, choirId, categoryId, active: true, eligibleOverrideJson: '{}', frequencyOverrideJson: '{}' });

function seed(opts: { primaryActive?: boolean } = {}) {
  h.audits.length = 0;
  h.lock.held = true; h.lock.holder = null;
  h.tables = {
    schedulingService: [service('s1', 'SS1', 'Sunday 1st', 0, 1), service('s2', 'SS2', 'Sunday 2nd', 0, 2)],
    choirCategory: [category('worship', 'WORSHIP', 'Worship'), category('primary', 'PRIMARY', 'Primary', opts.primaryActive ?? true)],
    choirCategoryLink: [link('l1', 'w1', 'worship'), link('l2', 'w2', 'worship'), link('l3', 'p1', 'primary'), link('l4', 'p2', 'primary'), link('l5', 'p3', 'primary')],
    categoryServicePolicy: [policy('pw1', 'worship', 's1'), policy('pw2', 'worship', 's2'), policy('pp1', 'primary', 's1'), policy('pp2', 'primary', 's2')],
    musicFixedAssignment: [],
    musicChoir: ['w1', 'w2', 'p1', 'p2', 'p3'].map((id) => ({ id, name: id.toUpperCase(), active: true })),
    musicChoirUnavailability: [],
    configEditLock: [],
  };
}
const save = (...ops: ConfigOp[]) => saveConfigChange('sys-music', 'p-admin', { ops });
const refused = async (promise: Promise<unknown>) => { try { await promise; } catch (e) { if (e instanceof ConfigError) return e; throw e; } throw new Error('expected a refusal'); };
const fixedRows = () => h.tables.musicFixedAssignment.map((f) => `${f.choirId}@${f.categoryServicePolicyId}`).sort();

beforeEach(() => seed());

describe('POST /config/rules runs the full validator', () => {
  it('an inactive category is refused with 422 and the specific error', async () => {
    seed({ primaryActive: false });
    const error = await refused(save({ op: 'musicRule.create', data: { scope: ['s1'], target: { kind: 'category', categoryId: 'primary' }, arrangement: 'ROTATION' } }));
    expect(error.status).toBe(422);
    expect(error.body.errors).toEqual(['Primary is not active, so it cannot have rules. Activate the category first.']);
    expect(h.audits).toHaveLength(0);
  });

  it('a rule the generator would reject gets the same 422 error list the table edit gets', async () => {
    // Primary has 3 linked choirs; asking for at least 4 per Sunday cannot be met.
    const viaRule = await refused(save({ op: 'musicRule.create', data: { scope: ['s1'], target: { kind: 'category', categoryId: 'primary' }, arrangement: 'ROTATION', minCount: 4, maxCount: 4 } }));
    seed();
    const viaTable = await refused(save({ op: 'policy.update', id: 'pp1', patch: { eligible: true, planningMode: 'ROTATION', minCount: 4, maxCount: 4 } }));
    expect(viaRule.status).toBe(422);
    expect(viaRule.body.errors).toEqual(viaTable.body.errors);
    expect(viaRule.body.errors).toContain('The minimum for SS1 is greater than the number of eligible linked choirs.');
  });
});

describe('round trips', () => {
  const fixedRule = (choirId: string, scope: string[]): ConfigOp => ({ op: 'musicRule.create', data: { scope, target: { kind: 'choir', choirId }, arrangement: 'FIXED' } });

  it('a policy with 2 fixed choirs is 2 choir rules sharing sharedPolicyId; PATCH touches only that choir', async () => {
    await save(fixedRule('w1', ['s1']));
    await save(fixedRule('w2', ['s1']));
    let { rules } = await readRuleModel();
    const choirRules = rules.filter((r) => r.target.kind === 'choir');
    expect(choirRules).toHaveLength(2);
    expect(choirRules[0]!.sharedPolicyId).toBe(choirRules[1]!.sharedPolicyId);
    expect(rules.filter((r) => r.target.kind === 'category')).toHaveLength(0); // FIXED policy: choir rules only
    expect(fixedRows()).toEqual(['w1@pw1', 'w2@pw1']);

    const w1Row = h.tables.musicFixedAssignment.find((f) => f.choirId === 'w1')!;
    const w2 = choirRules.find((r) => r.target.kind === 'choir' && r.target.choirId === 'w2')!;
    await save({ op: 'musicRule.update', id: w2.id, patch: { scope: ['s1', 's2'] } });

    expect(fixedRows()).toEqual(['w1@pw1', 'w2@pw1', 'w2@pw2']);
    expect(h.tables.musicFixedAssignment.find((f) => f.choirId === 'w1')).toEqual(w1Row); // w1's row is the same row
    ({ rules } = await readRuleModel());
    const after = rules.filter((r) => r.target.kind === 'choir');
    expect(after.find((r) => r.target.kind === 'choir' && r.target.choirId === 'w1')!.scope).toEqual(['s1']);
    expect(after.find((r) => r.target.kind === 'choir' && r.target.choirId === 'w2')!.scope).toEqual(['s1', 's2']);
  });

  it('deleting the last fixed choir returns the policy to "no rule"', async () => {
    await save(fixedRule('w1', ['s1']));
    const [rule] = (await readRuleModel()).rules;
    await save({ op: 'musicRule.delete', id: rule!.id });
    expect(fixedRows()).toEqual([]);
    expect((await readRuleModel()).rules).toEqual([]);
    const row = h.tables.categoryServicePolicy.find((p) => p.id === 'pw1')!;
    expect(row).toMatchObject({ eligible: false, planningMode: 'ROTATION' });
  });

  it('a category rule with 2 exceptions comes back intact, and one rule covers both services', async () => {
    const exceptions = [
      { choirId: 'p1', eligible: false },
      { choirId: 'p2', frequency: { target: 1 } },
    ];
    await save({ op: 'musicRule.create', data: {
      scope: ['s1', 's2'], target: { kind: 'category', categoryId: 'primary' }, arrangement: 'ROTATION',
      minCount: 0, maxCount: 1, frequency: { kind: 'MINIMUM', target: 2, period: 'MONTH', counting: 'ASSIGNMENTS' }, exceptions,
    } });
    const { rules } = await readRuleModel();
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      scope: ['s1', 's2'], arrangement: 'ROTATION', minCount: 0, maxCount: 1,
      frequency: { kind: 'MINIMUM', target: 2, period: 'MONTH', counting: 'ASSIGNMENTS' },
    });
    expect(rules[0]!.exceptions).toEqual(exceptions);
    // and the engine still reads the old tables
    expect(JSON.parse(h.tables.choirCategoryLink.find((l) => l.id === 'l3')!.eligibleOverrideJson)).toEqual({ SS1: false, SS2: false });
  });

  it('implied default policies are not shown as rules', async () => {
    expect((await readRuleModel()).rules).toEqual([]);
  });
});

describe('guards', () => {
  it('a save without the edit lock is 409 LOCKED, writes nothing and audits nothing', async () => {
    h.lock.held = false;
    h.lock.holder = { personId: 'p-other', name: 'Alice', since: NOW.toISOString(), expiresAt: NOW.toISOString() };
    const before = JSON.stringify(h.tables);
    const error = await refused(save({ op: 'musicRule.create', data: { scope: ['s1'], target: { kind: 'category', categoryId: 'primary' }, arrangement: 'ROTATION' } }));
    expect(error.status).toBe(409);
    expect(error.body).toMatchObject({ error: 'LOCKED', code: 'LOCKED' });
    expect((error.body.holder as { name: string }).name).toBe('Alice');
    expect(JSON.stringify(h.tables)).toBe(before);
    expect(h.audits).toHaveLength(0);
  });

  it('DELETE also needs the lock', async () => {
    await save({ op: 'musicRule.create', data: { scope: ['s1'], target: { kind: 'category', categoryId: 'primary' }, arrangement: 'MANUAL' } });
    const [rule] = (await readRuleModel()).rules;
    h.lock.held = false;
    const error = await refused(save({ op: 'musicRule.delete', id: rule!.id }));
    expect(error.status).toBe(409);
  });

  it('a choir moves category and drops its exceptions; a fixed choir cannot move', async () => {
    await save({ op: 'choir.setCategory', choirId: 'p3', categoryId: 'worship' });
    expect(h.tables.choirCategoryLink.find((l) => l.choirId === 'p3')!.categoryId).toBe('worship');
    await save({ op: 'musicRule.create', data: { scope: ['s1'], target: { kind: 'choir', choirId: 'w1' }, arrangement: 'FIXED' } });
    const error = await refused(save({ op: 'choir.setCategory', choirId: 'w1', categoryId: 'primary' }));
    expect(error.status).toBe(409);
    expect(error.body.code).toBe('CHOIR_HAS_FIXED_RULES');
  });

  it('audit entries are the existing table-level actions', async () => {
    await save({ op: 'musicRule.create', data: { scope: ['s1'], target: { kind: 'category', categoryId: 'primary' }, arrangement: 'ROTATION' } });
    expect(h.audits.map((a) => a.action)).toEqual(['POLICY_UPDATED']);
    expect(h.audits[0]).toMatchObject({ resource: 'SCHEDULING', systemId: 'sys-music' });
  });
});
```

### `server/src/routes/musicSchedule.frozen.test.ts`
_Generate over a CONFIRMED or PUBLISHED month is 409 SCHEDULE_FROZEN and builds nothing._

```ts
/**
 * The invariant that makes live configuration safe: a confirmed or published month is frozen.
 * Generating over it is refused with 409 SCHEDULE_FROZEN and nothing is built or written.
 *
 * The router runs for real on a throwaway express app; every collaborator is mocked, so no database is needed.
 * TODO(confirm): adapt the mocks to the repo's own test helpers if it has them.
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  months: [] as Array<{ periodKey: string; state: string }>,
  built: 0,
}));

vi.mock('../lib/prisma.js', () => ({ prisma: new Proxy({}, { get: () => new Proxy({}, { get: () => async () => [] }) }) }));
vi.mock('../middleware/http.js', () => ({ requireAuth: (req: any, _res: any, next: any) => { req.auth = { personId: 'p-admin' }; next(); } }));
vi.mock('../notifications/feed.js', () => ({ loadAccessData: async () => ({ data: {} }) }));
vi.mock('../lib/notify.js', () => ({ notifySafely: async () => {} }));
vi.mock('../music/rules.js', () => ({ MUSIC: 'sys-music', canReadPlan: () => true, canWritePlan: () => true, isMonth: (v: string) => /^\d{4}-\d\d$/.test(v) }));
vi.mock('../music/store.js', () => ({ loadChoirs: async () => [], loadMonthRows: async () => [], loadMonths: async () => h.months, toDoc: (x: unknown) => x }));
vi.mock('../music/schedule.js', () => ({ unitsFrom: () => [], historyOutside: () => [] }));
vi.mock('../music/engine.js', () => ({
  buildMusicCalendar: (start: string) => [{ periodKey: start, date: `${start}-07`, serviceId: 's1' }],
  periodOptionsForHorizon: () => [],
}));
vi.mock('../music/configuredEngine.js', () => ({
  generateConfiguredMusicSchedule: () => { h.built += 1; return { services: [], warnings: [] }; },
  validateConfiguredMusicSchedule: () => ({ ok: true, errors: [] }),
}));
vi.mock('../scheduling/configLoader.js', () => ({
  loadMusicConfig: async () => ({ services: [{ id: 's1', active: true, musicRequired: true }], categories: [], policies: [], links: [], fixedAssignments: [] }),
}));

import { musicScheduleRouter } from './musicSchedule.js';

let server: Server;
let base = '';
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/music/schedule', musicScheduleRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/music/schedule`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => { h.months = []; h.built = 0; });

const generate = (start: string) => fetch(`${base}/drafts/generate`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ horizon: 'MONTH', start }),
});

describe('generate over a frozen month', () => {
  for (const state of ['CONFIRMED', 'PUBLISHED']) {
    it(`${state} month -> 409 SCHEDULE_FROZEN, nothing built`, async () => {
      h.months = [{ periodKey: '2099-01', state }];
      const res = await generate('2099-01');
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({
        error: 'SCHEDULE_FROZEN',
        message: 'This schedule is already confirmed. Edits to configuration do not rebuild confirmed or published schedules.',
      });
      expect(h.built).toBe(0);
    });
  }
});
```

`src/newdesign/config.test.ts` (frequency text, min/max, the one-sentence-per-rule preview, tab redirects) and the rewritten `src/api/schedulingConfigApi.test.ts` (live endpoints, no version anywhere, Rule and lock calls) are in the tarball.

How each requested test maps:

| Requested | Test |
|---|---|
| Inactive category in scope -> 422 with the specific error | `an inactive category is refused with 422 and the specific error` |
| Rule API runs the full validator | `a rule the generator would reject gets the same 422 error list the table edit gets` (min 4 on a 3-choir category: the rule and the old `policy.update` return identical `errors`) |
| 2 fixed choirs = 2 choir rules, shared `sharedPolicyId`; PATCH touches one | `a policy with 2 fixed choirs is 2 choir rules...` (w1's fixed row is the same row after w2's PATCH) |
| Category rule with 2 exceptions round-trips | `a category rule with 2 exceptions comes back intact...` (also asserts the engine-facing `eligibleOverrideJson` is `{SS1:false, SS2:false}`) |
| Held by another editor -> 409 LOCKED, no write, no audit | `a save without the edit lock is 409 LOCKED...` (and DELETE) |
| Generate on a confirmed month -> 409 SCHEDULE_FROZEN | `musicSchedule.frozen.test.ts`, CONFIRMED and PUBLISHED |

One adjustment: the "inactive category" case is a 422 from the Rule layer's own guard (same `{ errors: [...] }` shape), not from the generation validator, because the table op underneath would have refused it with a 400 first. The validator-parity case is the one that proves the Rule API and generation agree.

---

## 6. What the user sees now

**Before (after last session's versioning removal)**

A three-step wizard: Services, Choirs, Choir rules. Making one real-world statement meant touching several screens: a *Scheduling frequency* policy per category and service, a choir *link* to its category, per-choir *eligibility override* and *frequency override* boxes inside that link, and a separate *Fixed choir designations* form. Words like policy, link, override and designation were all on screen.

**After**

Four tabs, in this order:

1. **Services**: table of name, code, day, time, repeats, needs music, needs protocol, active. Add, Edit, Delete inline.
2. **Choir categories**: table of name, code, active. Add, Edit, Delete inline.
3. **Choirs**: table of choir and a category dropdown (one per choir). Choirs with none show an amber **Unassigned** chip, and the Rules tab warns about them.
4. **Rules**: one flat table (Services chips, Target, Arrangement, Min / Max, Frequency, Exceptions) under a plain-English line for the whole configuration.

One sample rule, as the table row and as the sentence built from its fields:

| Services | Target | Arrangement | Min / Max | Frequency | Exceptions |
|---|---|---|---|---|---|
| Sunday 1st, Sunday 2nd | All Primary | Rotation | 0–1 | ≥ 2 / month | 2 choirs |

> Primary rotates on Sunday 1st and Sunday 2nd, 0–1 choirs, ≥ 2 / month.

The one line that explains when config takes effect (shown at the top of the page and in the generate panel):

> Changes apply as soon as you save. Confirmed and published schedules are frozen and are not rebuilt.

(the generate confirmation uses the exact required wording: "Configuration is applied at generate time. Confirmed and published schedules are frozen and will not be rebuilt.")

**Rule behavior you should know about**

- *Fixed* needs a specific choir; *Rotation* and *Manual* need a category. The dialog switches the other control for you.
- A fixed choir on a service that its category rotates keeps working: the category rule and the choir rule both show.
- Deleting a rule never removes the underlying category-by-service pair (the calendar needs every pair). It puts the pair back to "takes no part".
- 422 errors list in the dialog; each has a *Go to* link that focuses the field, or, for a Services-tab problem such as a missing weekday, closes the dialog and opens that tab.

---

## 7. What stayed internal

- **Tables:** `CategoryServicePolicy`, `ChoirCategoryLink` (`eligibleOverride`, `frequencyOverride`) and `MusicFixedAssignment` are all still there. **No schema change and no migration this session.** The diff for `schema.prisma` is empty.
- **Engines:** this session changed no line of `configuredEngine.ts`, `music/engine.ts` or `protocol/engine.ts`; they still read the same tables through `configLoader.ts`, which is also unchanged.
- **Validation:** `validateForGeneration.ts`, `validateProtocolForGeneration` and `musicConfigRules.ts` are byte-identical to last session's. The validation step in `saveConfigChange` is unchanged.
- **Lifecycle and audit:** draft -> confirmed -> published and the frozen guards are untouched. Audit entries are the existing table-level actions (`POLICY_UPDATED`, `LINK_UPDATED`, `MUSIC_FIXED_ASSIGNMENT_CREATED`, ...), because a Rule write is expanded into those ops. No new audit action was added. `// TODO(confirm)`: the text of those entries still says "policy" and "link"; they are for admins, not the screen.
- **Old routes:** `/config/policies`, `/links` and `/fixed-assignments` still exist and still go through `saveConfigChange`. Nothing in the UI calls them now. Remove them later if you want one surface.
- **The only new surface:** the Rule resource (`/config/rules`) and the Choirs endpoints (`/config/choirs`, `/config/choirs/:id/category`).

---

## 8. i18n

Removed (45 keys, also in `removed-i18n-keys-rules.txt`):

```
door.config.step.services
door.config.step.choirs
door.config.step.rules
door.config.setup.steps
door.config.setup.question.services
door.config.setup.question.choirs
door.config.setup.question.rules
door.config.setup.progress
door.config.setup.categories
door.config.setup.back
door.config.setup.continue
door.config.tab.policies
door.config.tab.links
door.config.tab.fixed
door.config.tab.availability
door.config.intro.music.policies
door.config.intro.music.links
door.config.intro.music.fixed
door.config.intro.music.availability
door.config.link.eligibleOverride
door.config.link.frequencyOverride
door.config.link.overrideNotice
door.config.fixed.choose
door.config.fixed.scope.SERVICE
door.config.fixed.scope.DATE
door.config.fixed.scope.TIME
door.config.fixed.scope.DATE_TIME
door.config.exceptions
door.config.help.exceptionSet
door.config.help.exceptionDefault
door.config.choirEligibleQuestion
door.config.choirFrequencyQuestion
door.config.registerSync
door.config.needsCategory
door.config.registerMissing
door.config.categoryQuestion
door.config.policy.pair
door.config.fixed.empty
door.config.fixed.every
door.config.fixed.service
door.config.fixed.when
door.config.fixed.date
door.config.fixed.time
door.config.availability.date
door.config.availability.limit
```

Added: tab names `door.config.tab.choirs` / `.rules` and intros `door.config.intro.music.choirs` / `.rules`; table columns `door.config.col.*`; `door.config.delete`, `deleteService.*`, `deleteCategory.*`; Choirs tab `door.config.choir.unassigned`, `choirs.*`, `availability.heading` / `.service` / `.allServices`; rule dialog `door.config.rule.*` (fields, arrangement names and help, exceptions, errors, delete); preview and text `door.config.rules.*` (`sentence`, `how.*`, `per.*`, `count*`, `previewLabel`, `previewEmpty`, empty states). Reworded: `door.config.tab.services` ("Services"), `door.config.intro.music.services`, `.categories`. Kept on purpose: `door.config.policy.*` (still used by the schedule page's read-only rule context in `MonthPlanPage`) and `door.config.setup.unsaved` (leave guard). Only `en.ts` was staged; other locales need the same removals.

---

## `// TODO(confirm)` and conservative choices

1. **Category + Fixed is refused.** "All Worship fixed" has no safe table meaning (which choirs? what about a choir added later?). A Fixed rule names specific choirs.
2. **Choir + Rotation/Manual is refused.** Rotating one choir is a category rule with an exception.
3. **A choir cannot be set back to Unassigned** (the generator refuses an active unlinked choir). To take one out, make it inactive in the Choir register. Moving a choir that has fixed rules is refused with 409 `CHOIR_HAS_FIXED_RULES`; moving one clears its exceptions.
4. **Choir-rule frequency is the policy's frequency**, so it is shared by other choirs fixed on the same policy (that is what `sharedPolicyId` marks). On a service the category rotates, a frequency on a choir rule is refused; set it on the category rule.
5. **Date- or time-limited fixed rows** (from before the Rule model) show as read-only choir rules you can delete but not edit.
6. **Rule ids are derived** (`cat~<policyId>...`, `choir~<choirId>~<policyId>...`), not stored. Two rules that become identical after edits merge on the next read, which changes the id.
7. **Delete on services and categories deactivates** (rows are referenced by schedules).
8. **Min/Max and "include every eligible choir" apply to Rotation only**; Fixed and Manual store null.
9. **The Rules table hides "implied default" pairs** (ineligible, rotation, nothing set): they are "no rule".
10. **File name** `ruleModel.ts` instead of `rules.ts` (collision above).
11. **Away dates** moved under Choirs instead of being deleted.
12. **Client checks are a small mirror** of the server's value checks (counts, min <= max, frequency target). The server stays the authority; the client does not import server code.

## Commit

```
Simplify Music setup to four sections with a single Rule concept

Services, Choir categories, Choirs, Rules. A Rule ("for these services,
this category or choir is scheduled this way") is expanded server-side into
the existing policy, link-override and fixed-assignment tables, so the
engines and the generation validator are unchanged. Rule writes go through
saveConfigChange (lock, validation, audit). Adds /config/rules and the
Choirs endpoints, removes the wizard and the participation editor.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HGLZ7aNirSyXCKsYqHJn7N
```

Run `git add -A; git commit; git push` from your PC. Delete `src/newdesign/MusicParticipationEditor.tsx` (and `MusicSetupReview.tsx`, if you did not last time).
