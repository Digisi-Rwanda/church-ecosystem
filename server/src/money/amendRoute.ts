/**
 * Who decides an amendment, by what it changes. Pure.
 *  - Money only (cost lines, set-aside sources): the unit's President. When the President asks, the Treasurer; with no President, the Vice President.
 *  - Leader or team only: the President (same fall-backs); the Church Leader is told.
 *  - Schedule, mission, category, or any combined change: President, Catechist, Church Leader (the Treasurer checks first when money is in it).
 * The Church Leader is told of every amendment and may suspend the activity; there is no reverse amendment.
 */
import { normalizeTiming, repeatOf } from '../work/timing.js';

export type AmendScope = 'MONEY' | 'GENERAL' | 'TEAM';
export const SCHEDULE_KEYS = ['location', 'startsOn', 'endsOn', 'timingKind', 'startTime', 'endTime', 'repeat'] as const;
export const MISSION_KEYS = ['title', 'aim', 'needs', 'fundraising', 'fundTarget'] as const;
export const TEAM_KEYS = ['leaderId', 'team'] as const;
export const CHANGE_KEYS = [...SCHEDULE_KEYS, ...MISSION_KEYS, ...TEAM_KEYS] as const;
export type ChangeKey = (typeof CHANGE_KEYS)[number];

export interface PlanFields {
  title: string; aim?: string | null; needs?: string | null; location?: string | null; startsOn?: Date | string | null; endsOn?: Date | string | null;
  timingKind?: string | null; startTime?: string | null; endTime?: string | null; repeatJson?: string | null; fundraising?: boolean | null; fundTarget?: number | null;
  leaderPersonId: string; teamJson?: string | null;
}
export type Proposed = Partial<{
  title: string; aim: string; needs: string | null; location: string | null; startsOn: string | null; endsOn: string | null; timingKind: string; startTime: string | null; endTime: string | null;
  repeat: unknown; fundraising: boolean; fundTarget: number | null; leaderId: string; team: Array<{ personId: string; role: string }>;
}>;
/** What would be stored, ready for the plan row (dates as ISO text so it can be kept as JSON). */
export type StoredSet = Partial<{
  title: string; aim: string; needs: string | null; location: string | null; startsOn: string | null; endsOn: string | null; timingKind: string; startTime: string | null; endTime: string | null;
  repeatJson: string | null; fundraising: boolean; fundTarget: number | null; leaderPersonId: string; teamJson: string;
}>;

const day = (v: Date | string | null | undefined) => (v ? new Date(v).getTime() : null);
const text = (v: string | null | undefined) => (v ?? '').trim();
const teamSig = (raw: string | null | undefined): string => {
  try {
    const v = JSON.parse(raw ?? '[]') as Array<{ personId: string; role: string }>;
    return JSON.stringify([...v].map((t) => [t.personId, t.role]).sort());
  } catch { return '[]'; }
};

/** The fields a proposal really changes: their names, and the values to store. Fields left as they are drop out. */
export function fieldDiff(plan: PlanFields, ch: Proposed): { keys: ChangeKey[]; set: StoredSet } {
  const keys = new Set<ChangeKey>();
  const set: StoredSet = {};
  const has = (k: keyof Proposed) => ch[k] !== undefined;
  if (has('title') && text(ch.title) !== text(plan.title)) { keys.add('title'); set.title = ch.title!.trim(); }
  if (has('aim') && text(ch.aim) !== text(plan.aim)) { keys.add('aim'); set.aim = ch.aim!.trim(); }
  if (has('needs') && text(ch.needs) !== text(plan.needs)) { keys.add('needs'); set.needs = text(ch.needs) || null; }
  if (has('fundraising') && !!ch.fundraising !== !!plan.fundraising) { keys.add('fundraising'); set.fundraising = !!ch.fundraising; }
  if (has('fundTarget') && (ch.fundTarget ?? null) !== (plan.fundTarget ?? null)) { keys.add('fundTarget'); set.fundTarget = ch.fundTarget ?? null; }
  if (has('location') && text(ch.location) !== text(plan.location)) { keys.add('location'); set.location = text(ch.location) || null; }
  const scheduled = (['startsOn', 'endsOn', 'timingKind', 'startTime', 'endTime', 'repeat'] as const).some(has);
  if (scheduled) {
    const next = normalizeTiming({
      timingKind: ch.timingKind ?? plan.timingKind ?? 'RANGE',
      startsOn: has('startsOn') ? ch.startsOn ?? null : plan.startsOn ? new Date(plan.startsOn).toISOString() : null,
      endsOn: has('endsOn') ? ch.endsOn ?? null : plan.endsOn ? new Date(plan.endsOn).toISOString() : null,
      startTime: has('startTime') ? ch.startTime ?? null : plan.startTime ?? null,
      endTime: has('endTime') ? ch.endTime ?? null : plan.endTime ?? null,
      repeatJson: has('repeat') ? (ch.repeat ? JSON.stringify(ch.repeat) : null) : plan.repeatJson ?? null,
    });
    const was = normalizeTiming({ timingKind: plan.timingKind ?? 'RANGE', startsOn: plan.startsOn ? new Date(plan.startsOn).toISOString() : null, endsOn: plan.endsOn ? new Date(plan.endsOn).toISOString() : null, startTime: plan.startTime ?? null, endTime: plan.endTime ?? null, repeatJson: plan.repeatJson ?? null });
    const rule = (r: string | null) => JSON.stringify(repeatOf(r));
    if (next.timingKind !== was.timingKind) keys.add('timingKind');
    if (day(next.startsOn) !== day(was.startsOn)) keys.add('startsOn');
    if (day(next.endsOn) !== day(was.endsOn)) keys.add('endsOn');
    if ((next.startTime ?? null) !== (was.startTime ?? null)) keys.add('startTime');
    if ((next.endTime ?? null) !== (was.endTime ?? null)) keys.add('endTime');
    if (rule(next.repeatJson) !== rule(was.repeatJson)) keys.add('repeat');
    if (['timingKind', 'startsOn', 'endsOn', 'startTime', 'endTime', 'repeat'].some((k) => keys.has(k as ChangeKey))) {
      set.timingKind = next.timingKind; set.startsOn = next.startsOn ? next.startsOn.toISOString() : null; set.endsOn = next.endsOn ? next.endsOn.toISOString() : null;
      set.startTime = next.startTime; set.endTime = next.endTime; set.repeatJson = next.repeatJson;
    }
  }
  if (has('leaderId') && ch.leaderId !== plan.leaderPersonId) { keys.add('leaderId'); set.leaderPersonId = ch.leaderId!; }
  if (has('team') && teamSig(JSON.stringify(ch.team)) !== teamSig(plan.teamJson)) { keys.add('team'); set.teamJson = JSON.stringify(ch.team); }
  return { keys: [...keys], set };
}

/** The route a change takes; null when nothing changes. */
export function scopeOf(money: boolean, category: boolean, keys: readonly string[]): AmendScope | null {
  const general = category || keys.some((k) => (SCHEDULE_KEYS as readonly string[]).includes(k) || (MISSION_KEYS as readonly string[]).includes(k));
  const team = keys.some((k) => (TEAM_KEYS as readonly string[]).includes(k));
  if (!money && !general && !team) return null;
  if (general || (team && money)) return 'GENERAL';
  return team ? 'TEAM' : 'MONEY';
}

export const moneySig = (s: Array<{ kind: string; code: string; amount: number }>): string => JSON.stringify(s.map((x) => [x.kind, x.code, x.amount]).sort());
