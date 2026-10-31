/**
 * Fundraising and settlement (slice 7). Pure.
 * A fundraising event states a target and later logs the money it receives. When it is Done, revenue minus spending goes to the
 * general pool: a profit adds to it, a deficit takes from it (and the pool may then show negative; it is flagged, never refused).
 * A Done activity stays open for a settlement period so late invoices can still be recorded; unspent money then goes back to its sources.
 */
export const SETTLE_DAYS = 30;
const DAY = 86_400_000;

/** What a fundraising event is expected to leave once its spending is paid. */
export const projectedNet = (target: number, planned: number): number => target - planned;

/** Revenue minus spending: positive is profit for the pool, negative is a deficit taken from it. */
export const netOf = (revenue: number, spent: number): number => revenue - spent;

export type Outcome = 'PROFIT' | 'DEFICIT' | 'EVEN';
export const outcomeOf = (net: number): Outcome => (net > 0 ? 'PROFIT' : net < 0 ? 'DEFICIT' : 'EVEN');

/** The last day the Treasurer can still record against a Done activity. */
export const settleDue = (doneAt: Date | string, days: number = SETTLE_DAYS): Date => new Date(new Date(doneAt).getTime() + days * DAY);

export const settlementOpen = (p: { doneAt?: Date | string | null; settledAt?: Date | string | null }, now: Date = new Date()): boolean =>
  !!p.doneAt && !p.settledAt && now.getTime() < settleDue(p.doneAt).getTime();

/** Whether the period has run out without the Treasurer finalizing. */
export const settlementLapsed = (p: { doneAt?: Date | string | null; settledAt?: Date | string | null }, now: Date = new Date()): boolean =>
  !!p.doneAt && !p.settledAt && now.getTime() >= settleDue(p.doneAt).getTime();

/** What goes back to the sources when an activity is settled: what was set aside and not spent. */
export const underBudget = (earmarked: number, spent: number): number => Math.max(0, earmarked - spent);

/** A fundraising event needs a target above zero. */
export function fundraisingProblem(fundraising: boolean, target: number | null | undefined, planType: string | null | undefined): string | null {
  if (!fundraising) return null;
  if (planType !== 'EVENT') return 'FUNDRAISING_EVENT_ONLY';
  if (!Number.isInteger(target) || (target as number) <= 0) return 'TARGET_NEEDED';
  return null;
}

export const revenueProblem = (amount: unknown): string | null => (Number.isInteger(amount) && (amount as number) > 0 && (amount as number) <= 2_000_000_000 ? null : 'AMOUNT');
