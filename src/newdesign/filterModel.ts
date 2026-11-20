/**
 * The shared filter model for list screens. A module (People now; Tasks, Events, Projects, Programs later) is
 * described by the schema its server publishes: fields, the operators each offers and the choices behind them.
 * This file holds the pure parts: the shapes, checking a condition's value, and what the server is sent.
 *
 * The server stays the authority: it checks every field, operator, value and unit again and refuses what the
 * viewer may not use. Everything here only helps a person fill the form in correctly before they send it.
 */

import type { FieldSchema, FilterLimits, FilterSchema, FilterValuePart as ValuePart } from '../api/frontDoorApi';
export type { FieldSchema, FilterLimits, FilterSchema, ValuePart };

/** A condition as the server takes it. Values are numbers, text, lists of text, or small objects. */
export type Condition = { field: string; op: string; value?: unknown };
export type Sort = { field: string; dir: 'asc' | 'desc' };

/** Everything that decides what a list shows. All of it is kept in the address of the page. */
export type FilterState = {
  q: string; archived: boolean;
  /** Every one of these must hold. */
  all: Condition[];
  /** Each group needs one of its conditions to hold; groups are combined with the conditions above. */
  groups: Condition[][];
  sort: Sort | null;
  page: number; size: number;
};

export const emptyState = (size: number): FilterState => ({ q: '', archived: false, all: [], groups: [], sort: null, page: 1, size });

export const conditionCount = (s: Pick<FilterState, 'all' | 'groups'>): number => s.all.length + s.groups.reduce((n, g) => n + g.length, 0);
export const hasFilters = (s: FilterState): boolean => s.q.trim() !== '' || s.archived || conditionCount(s) > 0;

export const fieldOf = (schema: FilterSchema, key: string): FieldSchema | undefined => schema.fields.find((f) => f.key === key);

/** The page sizes a person may pick, never above what the server allows. */
export const pageSizes = (limits: FilterLimits): number[] => [...new Set([25, limits.defaultPageSize, 100].filter((n) => n >= 1 && n <= limits.pageSize))].sort((a, b) => a - b);

/** Why a value cannot be sent; the screen turns each into a sentence. */
export type ValueProblem =
  | { code: 'required' } | { code: 'whole' } | { code: 'range'; min: number; max: number } | { code: 'order' }
  | { code: 'date' } | { code: 'long'; max: number } | { code: 'many'; max: number } | { code: 'choice' } | { code: 'part' };
export type Checked = { ok: true; value: unknown } | { ok: false; problem: ValueProblem };

const bad = (problem: ValueProblem): Checked => ({ ok: false, problem });
const good = (value: unknown): Checked => ({ ok: true, value });
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function isDay(s: unknown): s is string {
  if (typeof s !== 'string' || !DAY.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** A whole number from text or a number; anything else is not a number. */
function whole(raw: unknown, min: number, max: number): Checked {
  if (raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return bad({ code: 'required' });
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^-?\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  if (!Number.isInteger(n)) return bad({ code: 'whole' });
  return n < min || n > max ? bad({ code: 'range', min, max }) : good(n);
}
function word(raw: unknown, schema: FilterSchema): Checked {
  if (typeof raw !== 'string' || raw.trim() === '') return bad({ code: 'required' });
  return raw.trim().length > schema.limits.stringLength ? bad({ code: 'long', max: schema.limits.stringLength }) : good(raw.trim());
}
function oneOf(raw: unknown, allowed: readonly string[] | null): Checked {
  if (typeof raw !== 'string' || raw === '') return bad({ code: 'required' });
  return allowed && !allowed.includes(raw) ? bad({ code: 'choice' }) : good(raw);
}
function manyOf(raw: unknown, allowed: readonly string[] | null, schema: FilterSchema): Checked {
  if (!Array.isArray(raw) || raw.length === 0) return bad({ code: 'required' });
  if (raw.length > schema.limits.listValues) return bad({ code: 'many', max: schema.limits.listValues });
  const list = [...new Set(raw.filter((x): x is string => typeof x === 'string' && x !== ''))];
  if (list.length === 0) return bad({ code: 'required' });
  return allowed && list.some((x) => !allowed.includes(x)) ? bad({ code: 'choice' }) : good(list);
}
function pair(a: Checked, b: Checked): Checked {
  if (!a.ok) return a;
  if (!b.ok) return b;
  return (a.value as number | string) <= (b.value as number | string) ? good([a.value, b.value]) : bad({ code: 'order' });
}
const day = (raw: unknown): Checked => (raw === undefined || raw === '' ? bad({ code: 'required' }) : isDay(raw) ? good(raw) : bad({ code: 'date' }));
const part = (raw: unknown, key: string): unknown => (raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>)[key] : undefined);
/** A pair arrives as {from, to} from the form and as [a, b] from the server's own shape. */
const ends = (raw: unknown): [unknown, unknown] => (Array.isArray(raw) ? [raw[0], raw[1]] : [part(raw, 'from'), part(raw, 'to')]);

/** The parts of a records condition (an employment's sector, a calling's unit ...). Empty parts are simply left out. */
function checkParts(field: FieldSchema, raw: unknown, schema: FilterSchema): Checked {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad({ code: 'part' });
  const out: Record<string, unknown> = {};
  const given = raw as Record<string, unknown>;
  for (const key of Object.keys(given)) if (!field.parts?.some((p) => p.key === key)) return bad({ code: 'part' });
  for (const p of field.parts ?? []) {
    const v = given[p.key];
    const blank = v === undefined || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'string' && v.trim() === '');
    if (blank) continue;
    let r: Checked;
    switch (p.kind) {
      case 'text': r = word(v, schema); break;
      case 'unit': r = oneOf(v, schema.units.map((u) => u.id)); break;
      case 'choice': r = oneOf(v, p.choices ?? null); break;
      case 'choices': r = manyOf(v, p.choices ?? null, schema); break;
      case 'number': r = whole(v, p.min ?? 0, p.max ?? 1000); break;
    }
    if (!r.ok) return r;
    out[p.key] = r.value;
  }
  return Object.keys(out).length === 0 ? bad({ code: 'part' }) : good(out);
}

/**
 * Check the value of one condition against its field and operator and return it in the form the server takes
 * (numbers as numbers, trimmed text, lists without repeats). The same check serves the form and an address read back.
 */
export function checkValue(schema: FilterSchema, field: FieldSchema, op: string, raw: unknown): Checked {
  if (!field.operators.includes(op)) return bad({ code: 'choice' });
  const lo = field.min ?? 0, hi = field.max ?? 1000;
  switch (field.type) {
    case 'text': return word(raw, schema);
    case 'choice': return op === 'is' || op === 'isNot' ? oneOf(raw, field.choices ?? null) : manyOf(raw, field.choices ?? null, schema);
    case 'ordinal':
      if (op === 'atLeast' || op === 'atMost') return oneOf(raw, field.comparable ?? field.choices ?? null);
      return op === 'is' ? oneOf(raw, field.choices ?? null) : manyOf(raw, field.choices ?? null, schema);
    case 'number': {
      if (op !== 'between') return whole(raw, lo, hi);
      const [a, b] = ends(raw);
      return pair(whole(a, lo, hi), whole(b, lo, hi));
    }
    case 'date': {
      if (op === 'between') {
        const [a, b] = ends(raw);
        return pair(day(a), day(b));
      }
      if (op === 'withinLast' || op === 'withinNext') {
        const amount = whole(part(raw, 'amount'), 1, 3660);
        const unit = part(raw, 'unit');
        if (!amount.ok) return amount;
        return unit === 'days' || unit === 'months' || unit === 'years' ? good({ amount: amount.value, unit }) : bad({ code: 'choice' });
      }
      return day(raw);
    }
    case 'boolean': return good(undefined);
    case 'multi': return manyOf(raw, field.unitValued ? schema.units.map((u) => u.id) : (field.choices ?? null), schema);
    case 'records': return checkParts(field, raw, schema);
  }
}

/** A condition from outside (an address, a kept view): known field, offered operator, valid value; otherwise nothing. */
export function cleanCondition(schema: FilterSchema, raw: unknown): Condition | null {
  if (!raw || typeof raw !== 'object') return null;
  const { field: key, op, value } = raw as Record<string, unknown>;
  if (typeof key !== 'string' || typeof op !== 'string') return null;
  const field = fieldOf(schema, key);
  if (!field) return null;
  const checked = checkValue(schema, field, op, value);
  if (!checked.ok) return null;
  return checked.value === undefined ? { field: key, op } : { field: key, op, value: checked.value };
}

/** The request body for the server's search: only what is set, in a fixed order. */
export function buildSearchBody(s: FilterState, systemId: string): Record<string, unknown> {
  const groups = s.groups.filter((g) => g.length > 0);
  return {
    ...(s.q.trim() ? { q: s.q.trim() } : {}),
    ...(systemId ? { systemId } : {}),
    ...(s.archived ? { archived: true } : {}),
    ...(s.all.length || groups.length ? { match: { ...(s.all.length ? { all: s.all } : {}), ...(groups.length ? { anyGroups: groups.map((any) => ({ any })) } : {}) } } : {}),
    ...(s.sort ? { sort: s.sort } : {}),
    page: { limit: s.size, offset: (s.page - 1) * s.size },
  };
}

/** The same request always gives the same text, so it can name what was asked (and what a late answer was for). */
export function requestKey(body: unknown): string {
  return JSON.stringify(body, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));
}

/* ── Changing the state: every change that alters the list goes back to the first page ── */
const first = (s: FilterState, patch: Partial<FilterState>): FilterState => ({ ...s, ...patch, page: 1 });
export const withQuery = (s: FilterState, q: string): FilterState => first(s, { q });
export const withArchived = (s: FilterState, archived: boolean): FilterState => first(s, { archived });
export const withSort = (s: FilterState, sort: Sort | null): FilterState => first(s, { sort });
export const withSize = (s: FilterState, size: number): FilterState => first(s, { size });
export const withConditions = (s: FilterState, all: Condition[], groups: Condition[][]): FilterState => first(s, { all, groups: groups.filter((g) => g.length > 0) });
export const withPage = (s: FilterState, page: number): FilterState => ({ ...s, page: Math.max(1, Math.floor(page)) });
export const clearConditions = (s: FilterState): FilterState => withConditions(s, [], []);

export const removeCondition = (s: FilterState, index: number): FilterState => withConditions(s, s.all.filter((_, i) => i !== index), s.groups);
export const removeFromGroup = (s: FilterState, group: number, index: number): FilterState =>
  withConditions(s, s.all, s.groups.map((g, gi) => (gi === group ? g.filter((_, i) => i !== index) : g)));
export const removeGroup = (s: FilterState, group: number): FilterState => withConditions(s, s.all, s.groups.filter((_, gi) => gi !== group));

/** The value a quick list shows: exactly one plain "field is X" among the conditions, nothing else on that field. */
export function quickValue(s: FilterState, field: string): string {
  const hits = s.all.filter((c) => c.field === field);
  return hits.length === 1 && hits[0]!.op === 'is' && typeof hits[0]!.value === 'string' ? hits[0]!.value : '';
}
export function withQuick(s: FilterState, field: string, value: string): FilterState {
  const rest = s.all.filter((c) => c.field !== field);
  return withConditions(s, value ? [...rest, { field, op: 'is', value }] : rest, s.groups);
}

/** A sort as it is kept: nothing at all when it is the list's own order, so that order has the plain address. */
export const asSort = (schema: FilterSchema, field: string, dir: 'asc' | 'desc'): Sort | null =>
  field === schema.defaultSort.field && dir === schema.defaultSort.dir ? null : { field, dir };
