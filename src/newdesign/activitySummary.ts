import type { ActivityState, PlanItem, PlanType } from '../api/frontDoorApi';

export const SUMMARY_TYPES: PlanType[] = ['PROGRAM', 'EVENT', 'PROJECT'];
export const SUMMARY_STATES: ActivityState[] = ['DRAFT', 'WAITING', 'APPROVED', 'DONE'];

export type ActivitySummary = Record<PlanType, Record<ActivityState, number> & { total: number }>;

/** How many programs, events and projects sit in each state. Cancelled ones are counted but not shown as a column. */
export function summarizeActivity(plans: Array<Pick<PlanItem, 'planType' | 'state'>>): ActivitySummary {
  const zero = () => ({ DRAFT: 0, WAITING: 0, APPROVED: 0, DONE: 0, CANCELLED: 0, total: 0 });
  const out = { PROGRAM: zero(), EVENT: zero(), PROJECT: zero() } as ActivitySummary;
  for (const p of plans) {
    const row = out[p.planType];
    if (!row) continue;
    row[p.state] += 1;
    row.total += 1;
  }
  return out;
}
