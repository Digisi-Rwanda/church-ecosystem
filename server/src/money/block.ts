/**
 * The Money block's rules (Module 5), kept pure so they can be tested without a database.
 * Totals are always computed from lines, never typed. Planned and actual sit side by side.
 */
import { CATEGORIES } from './rules.js';

export const BUDGET_STATUS = ['DRAFT', 'APPROVED'] as const;
export const PLAN_STATUS = ['PLANNED', 'DONE', 'DROPPED'] as const;
export const LIST_LEVELS = ['TEAM', 'UNIT'] as const;
export const LIST_STATUS = ['DRAFT', 'SUBMITTED', 'COMBINED', 'APPROVED', 'RETURNED'] as const;
export type ListStatus = (typeof LIST_STATUS)[number];

export const isMonth = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export const isYear = (v: number) => Number.isInteger(v) && v >= 2000 && v <= 2100;
/** Kigali is two hours ahead of UTC; a day belongs to the year it is in locally. */
export const yearOf = (d: Date | string) => new Date(new Date(d).getTime() + 2 * 3600 * 1000).getUTCFullYear();
export const monthOf = (d: Date | string) => new Date(new Date(d).getTime() + 2 * 3600 * 1000).toISOString().slice(0, 7);

export interface BudgetLineLike { kind: string; category: string; planned: number }
export interface EntryLike { kind: string; amount: number; status: string; category: string; occurredOn: Date | string }

export interface AccountingRow { kind: 'INCOME' | 'SPENDING'; category: string; planned: number; actual: number; difference: number }
export interface AccountingSide { rows: AccountingRow[]; planned: number; actual: number }

const order = (c: string) => {
  const i = (CATEGORIES as readonly string[]).indexOf(c);
  return i < 0 ? CATEGORIES.length : i;
};

/** Planned against actual for one year: income recorded and spending approved count as actual. */
export function accounting(lines: BudgetLineLike[], entries: EntryLike[], year: number) {
  const side = (kind: 'INCOME' | 'SPENDING'): AccountingSide => {
    const planned = new Map<string, number>();
    for (const l of lines) if (l.kind === kind) planned.set(l.category, (planned.get(l.category) ?? 0) + l.planned);
    const actual = new Map<string, number>();
    const counts = kind === 'INCOME' ? 'RECORDED' : 'APPROVED';
    for (const e of entries) {
      if (e.kind === kind && e.status === counts && yearOf(e.occurredOn) === year) actual.set(e.category, (actual.get(e.category) ?? 0) + e.amount);
    }
    const cats = [...new Set([...planned.keys(), ...actual.keys()])].sort((a, b) => order(a) - order(b) || a.localeCompare(b));
    const rows = cats.map((category) => {
      const p = planned.get(category) ?? 0;
      const a = actual.get(category) ?? 0;
      return { kind, category, planned: p, actual: a, difference: a - p };
    });
    return { rows, planned: rows.reduce((s, r) => s + r.planned, 0), actual: rows.reduce((s, r) => s + r.actual, 0) };
  };
  const income = side('INCOME');
  const spending = side('SPENDING');
  return { income, spending, net: { planned: income.planned - spending.planned, actual: income.actual - spending.actual } };
}

/* ───────────── contribution lists ───────────── */

export interface LineLike { name: string; personId?: string | null; team?: string | null; amount: number }
export interface ListLike { level: string; status: string; sourceListIds?: string }
export const editable = (status: string) => status === 'DRAFT' || status === 'RETURNED';
export const total = (lines: Array<{ amount: number }>) => lines.reduce((s, l) => s + l.amount, 0);

/**
 * Which lists count towards totals without counting a person twice. A team list counts once it
 * is with the treasurer; when it is combined its lines live on in the unit list, which then counts.
 */
export function counts(list: ListLike): boolean {
  if (list.level === 'UNIT') return true;
  return list.status === 'SUBMITTED';
}

export type Goal = { goalAmount?: number; goalPer?: 'MEMBER' | 'TEAM' };
export interface GoalGroup { label: string; total: number; goal: number; met: boolean }

/** Per member or per team: who has reached the goal. No goal, no groups. */
export function goalGroups(type: Goal, lines: LineLike[]): GoalGroup[] {
  if (!type.goalAmount || !type.goalPer) return [];
  const goal = type.goalAmount;
  const sums = new Map<string, { label: string; total: number }>();
  for (const l of lines) {
    const key = type.goalPer === 'MEMBER' ? l.personId || `n:${l.name.trim().toLowerCase()}` : `t:${l.team ?? ''}`;
    const label = type.goalPer === 'MEMBER' ? l.name : l.team || '—';
    const cur = sums.get(key) ?? { label, total: 0 };
    cur.total += l.amount;
    sums.set(key, cur);
  }
  return [...sums.values()].map((g) => ({ ...g, goal, met: g.total >= goal })).sort((a, b) => a.label.localeCompare(b.label));
}

/** Team lists that are with the treasurer become one list with a Team column. */
export function combine(teamLists: Array<{ id: string; teamName: string | null; lines: LineLike[] }>) {
  const lines: LineLike[] = [];
  for (const l of [...teamLists].sort((a, b) => (a.teamName ?? '').localeCompare(b.teamName ?? ''))) {
    for (const x of l.lines) lines.push({ name: x.name, personId: x.personId ?? null, amount: x.amount, team: l.teamName ?? null });
  }
  return { lines, sourceListIds: teamLists.map((l) => l.id) };
}

export function linesProblem(lines: unknown): string | null {
  if (!Array.isArray(lines) || lines.length > 500) return 'LINES';
  for (const l of lines as LineLike[]) {
    if (!l || typeof l.name !== 'string' || !l.name.trim() || l.name.length > 80) return 'LINE_NAME';
    if (!Number.isInteger(l.amount) || l.amount <= 0 || l.amount > 2_000_000_000) return 'AMOUNT';
  }
  return null;
}
