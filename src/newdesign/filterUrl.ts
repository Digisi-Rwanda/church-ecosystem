/**
 * The filter state of a list, kept in the address of the page so that a refresh, a shared link and the back
 * button all bring back the same view. What is kept: the search words, "show archived", the conditions, the
 * sort and the page. Nothing else - no names or contact details of anyone, only what was asked.
 *
 *   q=word  archived=1  c=age:atLeast:30  g1=gender:is:"MALE"&g1=gender:is:"FEMALE"  sort=age:desc  size=25  page=3
 *
 * `c` holds the conditions that must all hold; `g1`..`g4` each hold one OR group. A condition is
 * `field:operator` plus `:value` as JSON when the operator takes one. Writing is deterministic (the same state
 * always gives the same address) and reading is forgiving: whatever is not valid for this viewer is left out and counted.
 */
import { cleanCondition, emptyState, pageSizes, type Condition, type FilterSchema, type FilterState } from './filterModel';

const GROUP_PARAM = /^g([1-9]\d*)$/;

const conditionText = (c: Condition): string => (c.value === undefined ? `${c.field}:${c.op}` : `${c.field}:${c.op}:${JSON.stringify(c.value)}`);

/** `field:op[:json]` back into a condition (not yet checked against any schema); null when it is not that shape. */
export function parseConditionText(text: string): { field: string; op: string; value?: unknown } | null {
  const a = text.indexOf(':');
  if (a < 1) return null;
  const b = text.indexOf(':', a + 1);
  const field = text.slice(0, a);
  const op = b === -1 ? text.slice(a + 1) : text.slice(a + 1, b);
  if (!/^\w+$/.test(field) || !/^\w+$/.test(op)) return null;
  if (b === -1) return { field, op };
  try {
    return { field, op, value: JSON.parse(text.slice(b + 1)) };
  } catch {
    return null;
  }
}

/** The state as an address. Defaults are left out so a plain list has a plain address. */
export function serializeFilterState(s: FilterState, defaults: { size: number }): URLSearchParams {
  const sp = new URLSearchParams();
  if (s.q.trim()) sp.set('q', s.q.trim());
  if (s.archived) sp.set('archived', '1');
  for (const c of s.all) sp.append('c', conditionText(c));
  s.groups.filter((g) => g.length > 0).forEach((g, i) => g.forEach((c) => sp.append(`g${i + 1}`, conditionText(c))));
  if (s.sort) sp.set('sort', `${s.sort.field}:${s.sort.dir}`);
  if (s.size !== defaults.size) sp.set('size', String(s.size));
  if (s.page > 1) sp.set('page', String(s.page));
  return sp;
}

export type ParsedFilterState = { state: FilterState; /** how many parts of the address were not usable and were left out */ dropped: number };

const wholeNumber = (v: string | null): number | null => (v !== null && /^\d{1,6}$/.test(v) ? Number(v) : null);

/** The state from an address, checked against what this viewer's schema offers. Never throws. */
export function parseFilterState(sp: URLSearchParams, schema: FilterSchema): ParsedFilterState {
  const state = emptyState(schema.limits.defaultPageSize);
  let dropped = 0;
  let room = schema.limits.conditions;
  const take = (text: string): Condition | null => {
    const raw = parseConditionText(text);
    const c = raw ? cleanCondition(schema, raw) : null;
    if (!c || room <= 0) { dropped++; return null; }
    room--;
    return c;
  };

  const q = sp.get('q');
  if (q !== null) state.q = q.trim().slice(0, schema.limits.stringLength);
  const arch = sp.get('archived');
  if (arch === '1') state.archived = true;
  else if (arch !== null) dropped++;

  for (const text of sp.getAll('c')) {
    const c = take(text);
    if (c) state.all.push(c);
  }
  const groupKeys = [...new Set([...sp.keys()].filter((k) => GROUP_PARAM.test(k)))].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  for (const key of groupKeys) {
    const list: Condition[] = [];
    for (const text of sp.getAll(key)) {
      const c = take(text);
      if (c) list.push(c);
    }
    if (list.length === 0) continue;
    if (state.groups.length >= schema.limits.groups) { dropped += list.length; continue; }
    state.groups.push(list);
  }

  const sort = sp.get('sort');
  if (sort !== null) {
    const [field, dir] = sort.split(':');
    if (field && (dir === 'asc' || dir === 'desc') && schema.sortable.includes(field)) {
      if (!(field === schema.defaultSort.field && dir === schema.defaultSort.dir)) state.sort = { field, dir };
    } else dropped++;
  }
  const size = sp.get('size');
  if (size !== null) {
    const n = wholeNumber(size);
    if (n !== null && pageSizes(schema.limits).includes(n)) state.size = n;
    else dropped++;
  }
  const page = sp.get('page');
  if (page !== null) {
    const n = wholeNumber(page);
    if (n !== null && n >= 1 && (n - 1) * state.size <= 100_000) state.page = n;
    else dropped++;
  }
  return { state, dropped };
}
