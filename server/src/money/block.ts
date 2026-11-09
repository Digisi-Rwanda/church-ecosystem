/**
 * The Money block's rules (Module 5), kept pure so they can be tested without a database.
 * Totals are always computed from lines, never typed. Planned and actual sit side by side.
 */
import { CATEGORIES, RETIRED_CATEGORIES } from './rules.js';

export const BUDGET_STATUS = ['DRAFT', 'SUBMITTED', 'APPROVED'] as const;
export const FUNDING_KINDS = ['CONTRIBUTION', 'DONATION', 'OTHER'] as const;
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
  const known = [...RETIRED_CATEGORIES, ...CATEGORIES] as readonly string[];
  const i = known.indexOf(c);
  return i < 0 ? known.length : i;
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

/* ───────────── money by program, project or event ───────────── */

export interface PlanLinkedItem { planId?: string | null; amount: number; status: string }
export interface PlanLinkedEntry { planId?: string | null; kind: string; amount: number; status: string }
export interface PlanMoneyRow { planId: string; planned: number; income: number; spending: number; pending: number }

/** Money per plan: planned from the action plan (dropped ones left out), income recorded, spending approved, spending still waiting. */
export function moneyByPlan(items: PlanLinkedItem[], entries: PlanLinkedEntry[]): PlanMoneyRow[] {
  const rows = new Map<string, PlanMoneyRow>();
  const row = (id: string) => {
    const r = rows.get(id) ?? { planId: id, planned: 0, income: 0, spending: 0, pending: 0 };
    rows.set(id, r);
    return r;
  };
  for (const i of items) if (i.planId && i.status !== 'DROPPED') row(i.planId).planned += i.amount;
  for (const e of entries) {
    if (!e.planId) continue;
    const r = row(e.planId);
    if (e.kind === 'INCOME' && e.status === 'RECORDED') r.income += e.amount;
    else if (e.kind === 'SPENDING' && e.status === 'APPROVED') r.spending += e.amount;
    else if (e.kind === 'SPENDING' && e.status === 'PENDING_APPROVAL') r.pending += e.amount;
  }
  return [...rows.values()];
}

/* ───────────── budget lines tied to activities ───────────── */

export interface PlanItemLike {
  id: string; title: string; amount: number; status: string; category?: string | null; dueMonth?: string | null; planId?: string | null;
  fundingKind?: string | null; fundingCode?: string | null; fundingNote?: string | null;
}
export interface BudgetLineRow extends BudgetLineLike { id: string; note?: string | null }
export interface LineUsage {
  id: string; kind: 'INCOME' | 'SPENDING'; category: string;
  /** Income: what was set. Spending: the larger of what was set aside and what the activities add up to. */
  planned: number;
  /** Spending only: the amount set aside on the line itself (0 when the line exists only because of activities). */
  setAside: number;
  /** True when no line was written for this category: it exists because activities were planned in it. */
  derived: boolean;
  /** Cost of the activities tied to this line (spending lines only; dropped activities do not count). */
  committed: number;
  /** Money really recorded in the year: income recorded, spending approved. */
  actual: number;
  /** The activities tied to this line, spending lines only. */
  activities: Array<{ id: string; title: string; amount: number; status: string; dueMonth: string | null; planId: string | null; fundingKind: string | null; fundingCode: string | null; fundingNote: string | null }>;
}

/**
 * Every budget line with what is committed to it by activities and what was really recorded. An activity
 * belongs to the spending line of its category; one with no category, or whose category has no spending
 * line, is "unlinked" and counted apart so nothing is hidden.
 */
export function budgetUsage(lines: BudgetLineRow[], items: PlanItemLike[], entries: EntryLike[], year: number) {
  const live = items.filter((i) => i.status !== 'DROPPED');
  const actualOf = (kind: string, category: string) =>
    entries.filter((e) => e.kind === kind && e.status === (kind === 'INCOME' ? 'RECORDED' : 'APPROVED') && e.category === category && yearOf(e.occurredOn) === year).reduce((s, e) => s + e.amount, 0);
  const act = (i: PlanItemLike) => ({ id: i.id, title: i.title, amount: i.amount, status: i.status, dueMonth: i.dueMonth ?? null, planId: i.planId ?? null, fundingKind: i.fundingKind ?? null, fundingCode: i.fundingCode ?? null, fundingNote: i.fundingNote ?? null });
  const rows: LineUsage[] = lines.map((l) => {
    const acts = l.kind === 'SPENDING' ? live.filter((i) => i.category === l.category) : [];
    const committed = acts.reduce((s, i) => s + i.amount, 0);
    return {
      id: l.id, kind: l.kind as 'INCOME' | 'SPENDING', category: l.category,
      planned: l.kind === 'SPENDING' ? Math.max(l.planned, committed) : l.planned,
      setAside: l.kind === 'SPENDING' ? l.planned : 0, derived: false,
      committed, actual: actualOf(l.kind, l.category), activities: acts.map(act),
    };
  });
  // A category with activities but no line still has a budget line: the activities themselves are its line items.
  const have = new Set(lines.filter((l) => l.kind === 'SPENDING').map((l) => l.category));
  const extra = [...new Set(live.map((i) => i.category).filter((c): c is string => !!c && !have.has(c)))].sort((x, y) => order(x) - order(y));
  for (const category of extra) {
    const acts = live.filter((i) => i.category === category);
    const committed = acts.reduce((s, i) => s + i.amount, 0);
    rows.push({ id: `derived:${category}`, kind: 'SPENDING', category, planned: committed, setAside: 0, derived: true, committed, actual: actualOf('SPENDING', category), activities: acts.map(act) });
  }
  const loose = live.filter((i) => !i.category);
  return { lines: rows, unlinked: { count: loose.length, amount: loose.reduce((s, i) => s + i.amount, 0) }, funding: fundingOf(live) };
}

export interface FundingRow { kind: string; code: string | null; planned: number; count: number }
/** What the activities will be paid from: contributions by type, donations, other, and activities with no source yet. */
export function fundingOf(items: PlanItemLike[]): FundingRow[] {
  const m = new Map<string, FundingRow>();
  for (const i of items.filter((x) => x.status !== 'DROPPED')) {
    const kind = i.fundingKind ?? 'NONE';
    const code = kind === 'CONTRIBUTION' ? i.fundingCode ?? null : null;
    const key = `${kind}|${code ?? ''}`;
    const r = m.get(key) ?? { kind, code, planned: 0, count: 0 };
    r.planned += i.amount; r.count += 1;
    m.set(key, r);
  }
  const rank = (k: string) => ['CONTRIBUTION', 'DONATION', 'OTHER', 'NONE'].indexOf(k);
  return [...m.values()].sort((a, b) => rank(a.kind) - rank(b.kind) || (a.code ?? '').localeCompare(b.code ?? ''));
}

export interface BudgetSnapshot {
  version: 1; year: number;
  totals: { incomePlanned: number; incomeActual: number; spendingPlanned: number; spendingCommitted: number; spendingActual: number };
  lines: Array<{ kind: 'INCOME' | 'SPENDING'; category: string; planned: number; committed: number; actual: number }>;
  activities: Array<{ title: string; category: string; dueMonth: string | null; amount: number; status: string; planTitle: string | null; fundingKind?: string | null; fundingCode?: string | null }>;
  funding?: FundingRow[];
}

/** The frozen copy a unit sends to Central: lines, what is committed and recorded, and the activities. */
export function budgetSnapshot(usage: ReturnType<typeof budgetUsage>, year: number, planTitles: Map<string, string>): BudgetSnapshot {
  const sumOf = (kind: string, f: (l: LineUsage) => number) => usage.lines.filter((l) => l.kind === kind).reduce((s, l) => s + f(l), 0);
  return {
    version: 1, year,
    totals: {
      incomePlanned: sumOf('INCOME', (l) => l.planned), incomeActual: sumOf('INCOME', (l) => l.actual),
      spendingPlanned: sumOf('SPENDING', (l) => l.planned), spendingCommitted: sumOf('SPENDING', (l) => l.committed), spendingActual: sumOf('SPENDING', (l) => l.actual),
    },
    lines: usage.lines.map((l) => ({ kind: l.kind, category: l.category, planned: l.planned, committed: l.committed, actual: l.actual })),
    activities: usage.lines.flatMap((l) => l.activities.map((a) => ({ title: a.title, category: l.category, dueMonth: a.dueMonth, amount: a.amount, status: a.status, planTitle: a.planId ? planTitles.get(a.planId) ?? null : null, fundingKind: a.fundingKind, fundingCode: a.fundingCode }))),
    funding: usage.funding,
  };
}

/** Church-wide totals from each unit's latest submitted snapshot: by system and by category. */
export function combineBudgets(snaps: Array<{ systemId: string; snapshot: BudgetSnapshot }>) {
  const t = { incomePlanned: 0, incomeActual: 0, spendingPlanned: 0, spendingCommitted: 0, spendingActual: 0 };
  const byCategory = new Map<string, { kind: 'INCOME' | 'SPENDING'; category: string; planned: number; committed: number; actual: number }>();
  for (const { snapshot } of snaps) {
    for (const k of Object.keys(t) as Array<keyof typeof t>) t[k] += snapshot.totals[k];
    for (const l of snapshot.lines) {
      const key = `${l.kind}|${l.category}`;
      const cur = byCategory.get(key) ?? { kind: l.kind, category: l.category, planned: 0, committed: 0, actual: 0 };
      cur.planned += l.planned; cur.committed += l.committed; cur.actual += l.actual;
      byCategory.set(key, cur);
    }
  }
  const rows = [...byCategory.values()].sort((a, b) => a.kind.localeCompare(b.kind) || order(a.category) - order(b.category));
  const fund = new Map<string, FundingRow>();
  for (const { snapshot } of snaps) {
    for (const f of snapshot.funding ?? []) {
      const key = `${f.kind}|${f.code ?? ''}`;
      const cur = fund.get(key) ?? { kind: f.kind, code: f.code, planned: 0, count: 0 };
      cur.planned += f.planned; cur.count += f.count;
      fund.set(key, cur);
    }
  }
  return { totals: t, byCategory: rows, funding: [...fund.values()] };
}
