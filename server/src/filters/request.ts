/**
 * Request validation. Two layers: the shape (sizes and nesting, the same for every module) and then each
 * condition against the module's registry for this viewer: known field, permitted field, operator the type
 * offers, a value of the right kind, and units inside the viewer's own scope.
 */
import { z } from 'zod';
import { isDay } from './dates.js';
import {
  FilterError, LIMITS, OPERATORS,
  type Condition, type FieldDef, type MatchRequest, type PageRequest, type Registry, type SortRequest,
} from './types.js';

const scalar = z.union([z.string().max(LIMITS.stringLength), z.number().finite()]);
const rawValue = z.union([
  scalar,
  z.array(scalar).max(LIMITS.listValues),
  z.record(z.string().max(20), z.union([scalar, z.array(scalar).max(LIMITS.listValues)])).refine((o) => Object.keys(o).length <= 4),
]);
const conditionShape = z.object({ field: z.string().min(1).max(40), op: z.string().min(1).max(20), value: rawValue.optional() }).strict();

/** One level of OR groups only, groups are combined with AND, and the whole request carries at most 12 conditions. */
export const MatchSchema = z.object({
  all: z.array(conditionShape).max(LIMITS.conditions).optional(),
  anyGroups: z.array(z.object({ any: z.array(conditionShape).min(1).max(LIMITS.conditions) }).strict()).max(LIMITS.groups).optional(),
}).strict().refine((m) => (m.all?.length ?? 0) + (m.anyGroups ?? []).reduce((n, g) => n + g.any.length, 0) <= LIMITS.conditions);
export const SortSchema = z.object({ field: z.string().min(1).max(40), dir: z.enum(['asc', 'desc']) }).strict();
export const PageSchema = z.object({
  limit: z.number().int().min(1).max(LIMITS.pageSize).default(LIMITS.defaultPageSize),
  offset: z.number().int().min(0).max(LIMITS.maxOffset).default(0),
}).strict();

export const bad = () => new FilterError(400, 'BAD_INPUT', 'These filters are not valid');

const day = z.string().refine(isDay);
const word = z.string().trim().min(1).max(LIMITS.stringLength);
const pair = <T extends z.ZodType<number | string>>(t: T) =>
  z.tuple([t, t]).refine(([a, b]) => (a as never) <= (b as never));

/** The value a condition must carry for this field and operator; `null` when the operator takes none. */
export function valueSchemaFor<R, C, V>(def: FieldDef<R, C, V>, op: string): z.ZodType | null {
  const choice = def.choices?.length ? z.enum(def.choices as [string, ...string[]]) : word;
  const list = (item: z.ZodType) => z.array(item).min(1).max(LIMITS.listValues);
  switch (def.type) {
    case 'text': return word;
    case 'choice': return op === 'is' || op === 'isNot' ? choice : list(choice);
    case 'ordinal': {
      if (op === 'atLeast' || op === 'atMost') return z.enum(Object.keys(def.rank ?? {}) as [string, ...string[]]);
      return op === 'is' ? choice : list(choice);
    }
    case 'number': {
      const n = z.number().int().min(def.min ?? 0).max(def.max ?? 1000);
      return op === 'between' ? pair(n) : n;
    }
    case 'date':
      if (op === 'between') return pair(day);
      if (op === 'withinLast' || op === 'withinNext') {
        return z.object({ amount: z.number().int().min(1).max(LIMITS.amountMax), unit: z.enum(['days', 'months', 'years']) }).strict();
      }
      return day;
    case 'boolean': return null;
    case 'multi': return list(choice);
    case 'records': return def.valueSchema ?? null;
  }
}

export interface Prepared<R, C, V> {
  def: FieldDef<R, C, V>; op: string; value: unknown;
  /** multi fields that widen their values: the union, built once rather than for every person. */
  expanded?: Set<string>;
}
export interface Plan<R, C, V> {
  all: Array<Prepared<R, C, V>>;
  groups: Array<Array<Prepared<R, C, V>>>;
  sort: { def: FieldDef<R, C, V>; dir: 'asc' | 'desc' } | null;
}

/**
 * Check a request against the registry for this viewer and turn it into something the engine can run.
 * Order matters for what a client can learn: unknown names are 400 (no hint about anything hidden); a known field
 * the viewer may not use is 403 naming only what the client itself sent; only then are operators and values checked.
 */
export function planRequest<R, C, V>(
  registry: Registry<R, C, V>, viewer: V, ctx: C, unitScope: Set<string> | null,
  match: MatchRequest | undefined, sort: SortRequest | undefined,
): Plan<R, C, V> {
  const byKey = new Map(registry.map((d) => [d.key, d]));
  const conditions: Condition[] = [...(match?.all ?? []), ...(match?.anyGroups ?? []).flatMap((g) => g.any)];
  const defs: Array<FieldDef<R, C, V>> = [];
  for (const c of conditions) {
    const def = byKey.get(c.field);
    if (!def) throw bad();
    defs.push(def);
  }
  const sortDef = sort ? byKey.get(sort.field) : undefined;
  if (sort && (!sortDef || !sortDef.sortKey)) throw bad();

  const forbidden = new Set<string>();
  for (const d of defs) if (!d.allowed(viewer)) forbidden.add(d.key);
  if (sortDef && !sortDef.allowed(viewer)) forbidden.add(sortDef.key);
  if (forbidden.size) throw new FilterError(403, 'FIELD_NOT_ALLOWED', 'You may not filter on details you cannot read', [...forbidden]);

  const prepare = (c: Condition): Prepared<R, C, V> => {
    const def = byKey.get(c.field)!;
    if (!(OPERATORS[def.type] as readonly string[]).includes(c.op)) throw bad();
    const schema = valueSchemaFor(def, c.op);
    let value: unknown = undefined;
    if (schema === null) {
      if (c.value !== undefined) throw bad();
    } else {
      const parsed = schema.safeParse(c.value);
      if (!parsed.success) throw bad();
      value = parsed.data;
    }
    return { def, op: c.op, value };
  };
  const all = (match?.all ?? []).map(prepare);
  const groups = (match?.anyGroups ?? []).map((g) => g.any.map(prepare));
  const prepared = [...all, ...groups.flat()];

  // Units named by a condition must be inside what the viewer may see: a unit they cannot see could not be
  // filtered on without showing who else belongs to it.
  if (unitScope !== null) {
    for (const p of prepared) {
      if (p.def.unitRefs && p.def.unitRefs(p.value as never).some((u) => !unitScope.has(u))) {
        throw new FilterError(403, 'UNIT_NOT_ALLOWED', 'You may not filter by a unit outside your own');
      }
    }
  }
  for (const p of prepared) {
    if (p.def.expand && Array.isArray(p.value)) {
      const set = new Set<string>();
      for (const v of p.value as string[]) for (const x of p.def.expand(v, ctx)) set.add(x);
      p.expanded = set;
    }
  }
  return { all, groups, sort: sortDef && sort ? { def: sortDef, dir: sort.dir } : null };
}

export type { PageRequest };
