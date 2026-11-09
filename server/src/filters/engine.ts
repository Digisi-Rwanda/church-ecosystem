/**
 * Evaluation. `all` conditions must each match; every OR group needs at least one of its conditions to match;
 * groups and `all` are combined with AND. Missing values never satisfy a positive operator; negative operators
 * (isNot, isNone, includesNone, noneMatch) do match them. Everything here is pure: no database, no clock.
 */
import { shiftDay } from './dates.js';
import type { FieldDef } from './types.js';
import type { Plan, Prepared } from './request.js';

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === null || v === undefined || v === '' ? [] : [v]);
const lower = (v: unknown) => String(v).toLowerCase();
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export function evaluate<R, C, V>(p: Prepared<R, C, V>, row: R, ctx: C & { today?: string }): boolean {
  const { def, op, value } = p;
  const raw = def.read(row, ctx);
  switch (def.type) {
    case 'text': {
      const have = list(raw).map((x) => text(x)).filter((x): x is string => x !== null).map(lower);
      const want = lower(value);
      return have.some((h) => (op === 'contains' ? h.includes(want) : op === 'equals' ? h === want : h.startsWith(want)));
    }
    case 'choice': {
      const have = list(raw).map(String);
      if (op === 'is') return have.includes(value as string);
      if (op === 'isNot') return !have.includes(value as string);
      const any = have.some((h) => (value as string[]).includes(h));
      return op === 'isAny' ? any : !any;
    }
    case 'ordinal': {
      const have = list(raw).map(String);
      const rank = def.rank ?? {};
      if (op === 'is') return have.includes(value as string);
      if (op === 'isAny') return have.some((h) => (value as string[]).includes(h));
      if (op === 'isNone') return !have.some((h) => (value as string[]).includes(h));
      // atLeast / atMost compare the highest ranked value recorded; unranked values and missing never match.
      const ranks = have.map((h) => rank[h]).filter((r): r is number => r !== undefined);
      if (!ranks.length) return false;
      const top = Math.max(...ranks);
      return op === 'atLeast' ? top >= rank[value as string]! : top <= rank[value as string]!;
    }
    case 'number': {
      const n = num(raw);
      if (n === null) return false;
      if (op === 'equals') return n === value;
      if (op === 'atLeast') return n >= (value as number);
      if (op === 'atMost') return n <= (value as number);
      const [lo, hi] = value as [number, number];
      return n >= lo && n <= hi;
    }
    case 'date': {
      const d = text(raw);
      if (d === null) return false;
      const today = ctx.today ?? '';
      if (op === 'on') return d === value;
      if (op === 'before') return d < (value as string);
      if (op === 'after') return d > (value as string);
      if (op === 'between') { const [a, b] = value as [string, string]; return d >= a && d <= b; }
      const { amount, unit } = value as { amount: number; unit: 'days' | 'months' | 'years' };
      if (!today) return false;
      return op === 'withinLast' ? d >= shiftDay(today, -amount, unit) && d <= today : d >= today && d <= shiftDay(today, amount, unit);
    }
    case 'boolean': {
      const yes = raw === true;
      return op === 'isYes' ? yes : !yes;
    }
    case 'multi': {
      const have = list(raw).map(String);
      const want = p.expanded ?? new Set(value as string[]);
      const any = have.some((h) => want.has(h));
      return op === 'includesAny' ? any : !any;
    }
    case 'records': {
      const any = list(raw).some((item) => (def as FieldDef<R, C, V>).itemMatches!(item, value as never, ctx));
      return op === 'anyMatch' ? any : !any;
    }
  }
}

export function matchesPlan<R, C, V>(plan: Plan<R, C, V>, row: R, ctx: C & { today?: string }): boolean {
  for (const c of plan.all) if (!evaluate(c, row, ctx)) return false;
  for (const g of plan.groups) if (!g.some((c) => evaluate(c, row, ctx))) return false;
  return true;
}
