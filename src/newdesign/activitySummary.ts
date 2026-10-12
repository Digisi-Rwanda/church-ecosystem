import type { PlanItem } from '../api/frontDoorApi';

export type ActivityGroup = 'DONE' | 'INPROGRESS' | 'UPCOMING';
export const ACTIVITY_GROUPS: ActivityGroup[] = ['DONE', 'INPROGRESS', 'UPCOMING'];
type Row = Pick<PlanItem, 'id' | 'state' | 'startsOn' | 'endsOn'>;

/** Which of the three lists an activity belongs in; drafts and cancelled ones are in none. */
export function groupOf(p: Pick<PlanItem, 'state' | 'startsOn'>, today: string): ActivityGroup | null {
  if (p.state === 'DONE') return 'DONE';
  if (p.state === 'WAITING') return 'UPCOMING';
  if (p.state === 'APPROVED') return p.startsOn && p.startsOn.slice(0, 10) > today ? 'UPCOMING' : 'INPROGRESS';
  return null;
}

/** Completed, in progress and upcoming activities: the most relevant first (latest finished, soonest to end, soonest to start). */
export function groupActivities<T extends Row>(plans: T[], today: string): Record<ActivityGroup, T[]> {
  const out: Record<ActivityGroup, T[]> = { DONE: [], INPROGRESS: [], UPCOMING: [] };
  for (const p of plans) {
    const g = groupOf(p, today);
    if (g) out[g].push(p);
  }
  const day = (v: string | null, fallback: string) => (v ? v.slice(0, 10) : fallback);
  out.DONE.sort((a, b) => day(b.endsOn, '').localeCompare(day(a.endsOn, '')));
  out.INPROGRESS.sort((a, b) => day(a.endsOn, '9999').localeCompare(day(b.endsOn, '9999')));
  out.UPCOMING.sort((a, b) => day(a.startsOn, '9999').localeCompare(day(b.startsOn, '9999')));
  return out;
}
