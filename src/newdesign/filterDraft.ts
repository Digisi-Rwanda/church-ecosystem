/**
 * What a person is typing into the filter form, before it is checked and applied. A draft keeps every value
 * as text (a number box holds "30", not 30) so half-typed input is never lost; applying it runs the same
 * check that an address read back goes through, and only a draft that passes becomes conditions.
 */
import { checkValue, fieldOf, type Checked, type Condition, type FieldSchema, type FilterSchema, type ValueProblem } from './filterModel';

export type DraftValue = string | string[] | Record<string, string | string[]>;
export type DraftCondition = { key: string; field: string; op: string; value: DraftValue };
export type Draft = { all: DraftCondition[]; groups: DraftCondition[][] };

type Shape = 'none' | 'scalar' | 'list' | 'pair' | 'duration' | 'parts';
/** How the value of this operator is typed in: nothing, one box, several ticks, two boxes, an amount and a unit, or labelled parts. */
export function shapeOf(field: FieldSchema, op: string): Shape {
  switch (field.type) {
    case 'boolean': return 'none';
    case 'records': return 'parts';
    case 'multi': return 'list';
    case 'choice': return op === 'is' || op === 'isNot' ? 'scalar' : 'list';
    case 'ordinal': return op === 'isAny' || op === 'isNone' ? 'list' : 'scalar';
    case 'number': return op === 'between' ? 'pair' : 'scalar';
    case 'date': return op === 'between' ? 'pair' : op === 'withinLast' || op === 'withinNext' ? 'duration' : 'scalar';
    default: return 'scalar';
  }
}

export function blankValue(field: FieldSchema, op: string): DraftValue {
  switch (shapeOf(field, op)) {
    case 'list': return [];
    case 'pair': return { from: '', to: '' };
    case 'duration': return { amount: '', unit: 'days' };
    case 'parts': return {};
    default: return '';
  }
}

/** Change the operator and keep what was typed when it still fits (one choice becomes a list of one, and back). */
export function retarget(field: FieldSchema, oldOp: string, newOp: string, value: DraftValue): DraftValue {
  const from = shapeOf(field, oldOp), to = shapeOf(field, newOp);
  if (from === to) return value;
  if (from === 'scalar' && to === 'list') return typeof value === 'string' && value ? [value] : [];
  if (from === 'list' && to === 'scalar') return Array.isArray(value) ? (value[0] ?? '') : '';
  return blankValue(field, newOp);
}

let counter = 0;
const nextKey = () => `d${++counter}`;
export const newDraftCondition = (field: FieldSchema): DraftCondition => ({ key: nextKey(), field: field.key, op: field.operators[0]!, value: blankValue(field, field.operators[0]!) });

/** Switch a draft condition to another field, starting its value afresh. */
export const withField = (dc: DraftCondition, field: FieldSchema): DraftCondition => ({ key: dc.key, field: field.key, op: field.operators[0]!, value: blankValue(field, field.operators[0]!) });
export const withOp = (dc: DraftCondition, field: FieldSchema, op: string): DraftCondition => ({ ...dc, op, value: retarget(field, dc.op, op, dc.value) });

const text = (v: unknown): string => (typeof v === 'number' ? String(v) : typeof v === 'string' ? v : '');
/** A condition the server takes, back into the form's own text-valued shape. */
export function toDraftCondition(field: FieldSchema, c: Condition): DraftCondition {
  const shape = shapeOf(field, c.op);
  let value: DraftValue;
  const v = c.value;
  if (shape === 'list') value = Array.isArray(v) ? v.map(String) : [];
  else if (shape === 'pair') value = { from: text((v as unknown[] | undefined)?.[0]), to: text((v as unknown[] | undefined)?.[1]) };
  else if (shape === 'duration') value = { amount: text((v as { amount?: unknown } | undefined)?.amount), unit: text((v as { unit?: unknown } | undefined)?.unit) || 'days' };
  else if (shape === 'parts') {
    const out: Record<string, string | string[]> = {};
    for (const [k, x] of Object.entries((v ?? {}) as Record<string, unknown>)) out[k] = Array.isArray(x) ? x.map(String) : text(x);
    value = out;
  } else value = shape === 'none' ? '' : text(v);
  return { key: nextKey(), field: field.key, op: c.op, value };
}

export type DraftProblem = ValueProblem | { code: 'field' };
export type DraftCheck = { all: Condition[]; groups: Condition[][]; problems: Record<string, DraftProblem>; tooMany: 'conditions' | 'groups' | null; ok: boolean };

const one = (schema: FilterSchema, dc: DraftCondition): Checked => {
  const field = fieldOf(schema, dc.field);
  return field ? checkValue(schema, field, dc.op, dc.value) : { ok: false, problem: { code: 'choice' } };
};

/** Check every row. Rows that pass become conditions; rows that fail keep their problem, and nothing is dropped silently. */
export function checkDraft(schema: FilterSchema, draft: Draft): DraftCheck {
  const problems: Record<string, DraftProblem> = {};
  const make = (dc: DraftCondition): Condition | null => {
    const r = one(schema, dc);
    if (!r.ok) { problems[dc.key] = r.problem; return null; }
    return r.value === undefined ? { field: dc.field, op: dc.op } : { field: dc.field, op: dc.op, value: r.value };
  };
  const all = draft.all.map(make);
  const groups = draft.groups.map((g) => g.map(make));
  const count = draft.all.length + draft.groups.reduce((n, g) => n + g.length, 0);
  const tooMany = count > schema.limits.conditions ? 'conditions' : draft.groups.length > schema.limits.groups ? 'groups' : null;
  const ok = Object.keys(problems).length === 0 && !tooMany;
  return {
    all: all.filter((c): c is Condition => c !== null),
    groups: groups.map((g) => g.filter((c): c is Condition => c !== null)).filter((g) => g.length > 0),
    problems, tooMany, ok,
  };
}

export const draftFrom = (schema: FilterSchema, all: Condition[], groups: Condition[][]): Draft => ({
  all: all.flatMap((c) => { const f = fieldOf(schema, c.field); return f ? [toDraftCondition(f, c)] : []; }),
  groups: groups.map((g) => g.flatMap((c) => { const f = fieldOf(schema, c.field); return f ? [toDraftCondition(f, c)] : []; })),
});
