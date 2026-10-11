/**
 * Budget cycles (slice 6). A repeat with spending must say how its allowance is counted and how long it runs; the total budget is the
 * allowance of one cycle times the number of cycles. An activity with no end must be a Program with a monthly operating budget, and each
 * month the Church Leader releases that month's money. Spending past an allowance, or in a month not released, is recorded and flagged, never refused. Pure.
 */
import { occurrencesIn, churchDay, type Timing } from '../work/timing.js';

export const BUDGET_CYCLES = ['PER_OCCURRENCE', 'MONTHLY', 'QUARTERLY'] as const;
export type BudgetCycle = (typeof BUDGET_CYCLES)[number];
export const CYCLES_MAX = 120;

export interface CyclePlan extends Timing {
  planType?: string | null;
  budgetCycle?: string | null;
  budgetCycles?: number | null;
}

const isCycle = (v: unknown): v is BudgetCycle => (BUDGET_CYCLES as readonly string[]).includes(String(v));
const monthsBetween = (from: string, to: string) => (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;

/** An ongoing program: no end, counted monthly. Its money is released one month at a time. */
export const isOngoing = (p: CyclePlan): boolean => p.planType === 'PROGRAM' && p.budgetCycle === 'MONTHLY' && !p.budgetCycles && !p.endsOn;

/** How many cycles a plan runs for: the number it says, or what its last day gives. Null when it has neither. */
export function cyclesOf(p: CyclePlan): number | null {
  if (p.budgetCycles && p.budgetCycles > 0) return p.budgetCycles;
  if (!p.endsOn || !p.startsOn || !isCycle(p.budgetCycle)) return null;
  const from = churchDay(p.startsOn).slice(0, 7);
  const to = churchDay(p.endsOn).slice(0, 7);
  const months = Math.max(1, Math.min(CYCLES_MAX * 3, monthsBetween(from, to)));
  if (p.budgetCycle === 'MONTHLY') return months;
  if (p.budgetCycle === 'QUARTERLY') return Math.ceil(months / 3);
  let n = 0;
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  for (let i = 0; i < months; i += 1) {
    n += occurrencesIn(p, `${y}-${String(m).padStart(2, '0')}`).length;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return Math.max(1, n);
}

export type CycleProblem = 'CYCLE_REQUIRED' | 'ONGOING_NEEDS_PROGRAM' | null;
/** A repeat cannot hold spending without a cycle and a length; with no end it must be a program with a monthly budget. */
export function cycleProblem(p: CyclePlan): CycleProblem {
  if (p.timingKind !== 'REPEAT') return null;
  if (!isCycle(p.budgetCycle)) return 'CYCLE_REQUIRED';
  if (cyclesOf(p)) return null;
  if (isOngoing(p)) return null;
  return p.planType === 'PROGRAM' ? 'CYCLE_REQUIRED' : 'ONGOING_NEEDS_PROGRAM';
}

/** What the spending lines are multiplied by: the number of cycles of a repeat, otherwise one. */
export const multiplierOf = (p: CyclePlan): number => (p.timingKind === 'REPEAT' && isCycle(p.budgetCycle) ? cyclesOf(p) ?? 1 : 1);

/** The cycle an entry's day falls in. A per-occurrence cycle is the latest occurrence on or before the day. */
export function cycleKey(cycle: BudgetCycle, day: string, occurrences: string[] = []): string {
  if (cycle === 'MONTHLY') return day.slice(0, 7);
  if (cycle === 'QUARTERLY') return `${day.slice(0, 4)}-Q${Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1}`;
  const sorted = [...occurrences].sort();
  return [...sorted].reverse().find((o) => o <= day) ?? sorted[0] ?? day;
}

export interface CycleSpend { key: string; spent: number; allowance: number; over: number }
/** Each cycle's spending against its own allowance. */
export function overspendByCycle(entries: Array<{ amount: number; day: string }>, allowance: number, cycle: BudgetCycle, occurrences: string[] = []): CycleSpend[] {
  const by = new Map<string, number>();
  for (const e of entries) by.set(cycleKey(cycle, e.day, occurrences), (by.get(cycleKey(cycle, e.day, occurrences)) ?? 0) + e.amount);
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, spent]) => ({ key, spent, allowance, over: Math.max(0, spent - allowance) }));
}

/** The money a shortened repeat gives back: the allowance of each cycle taken away. */
export const releasedOnShorten = (allowance: number, from: number, to: number): number => Math.max(0, allowance) * Math.max(0, from - to);

/** Take an amount back from the sources, last one first. */
export function reduceSources<T extends { amount: number }>(sources: T[], amount: number): T[] {
  let left = amount;
  const out = sources.map((s) => ({ ...s }));
  for (let i = out.length - 1; i >= 0 && left > 0; i -= 1) {
    const take = Math.min(out[i]!.amount, left);
    out[i]!.amount -= take;
    left -= take;
  }
  return out.filter((s) => s.amount > 0);
}

/** Whether a month of an ongoing program has been released by the Church Leader. */
export const isReleased = (renewals: Array<{ month: string }>, month: string): boolean => renewals.some((r) => r.month === month);
