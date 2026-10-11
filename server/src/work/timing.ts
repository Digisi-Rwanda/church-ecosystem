/**
 * When an activity happens (spec: "Time and the schedule"). Every activity says it in exactly one of three ways, and the
 * schedule reads it directly: nothing is copied into slots, and a repeat is expanded for the month being looked at.
 * Pure. Church time is UTC+2, so a stored instant is turned into a church day before anything is compared.
 */
import { z } from 'zod';

export const TIMING_KINDS = ['DATE', 'RANGE', 'REPEAT'] as const;
export type TimingKind = (typeof TIMING_KINDS)[number];

export const CHURCH_OFFSET_MS = 2 * 3600 * 1000;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isClock = (v: string | null | undefined): v is string => !!v && TIME_RE.test(v);

/** Weekly on chosen days (0 = Sunday), or monthly on the nth weekday (nth 1 to 4, or 5 for the last). */
export type RepeatRule = { kind: 'WEEKLY'; days: number[] } | { kind: 'MONTHLY'; nth: number; day: number };

export const repeatSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('WEEKLY'), days: z.array(z.number().int().min(0).max(6)).min(1).max(7) }),
  z.object({ kind: z.literal('MONTHLY'), nth: z.number().int().min(1).max(5), day: z.number().int().min(0).max(6) }),
]);

export function repeatOf(raw: string | null | undefined): RepeatRule | null {
  if (!raw) return null;
  try {
    const r = repeatSchema.safeParse(JSON.parse(raw));
    return r.success ? (r.data.kind === 'WEEKLY' ? { kind: 'WEEKLY', days: [...new Set(r.data.days)].sort() } : r.data) : null;
  } catch {
    return null;
  }
}

export interface Timing {
  timingKind?: string | null;
  startsOn?: Date | string | null;
  endsOn?: Date | string | null;
  startTime?: string | null;
  endTime?: string | null;
  repeatJson?: string | null;
}

/** The church day ("YYYY-MM-DD") of a stored instant. */
export function churchDay(v: Date | string): string {
  return new Date(new Date(v).getTime() + CHURCH_OFFSET_MS).toISOString().slice(0, 10);
}

export type TimingProblem = 'BAD_DATES' | 'BAD_TIME' | 'BAD_REPEAT' | 'DATE_REQUIRED' | null;

/** What must hold before a timing can be saved. A draft may still have no date at all. */
export function timingProblem(t: Timing, opts: { needDate?: boolean } = {}): TimingProblem {
  const kind = (t.timingKind ?? 'RANGE') as TimingKind;
  const start = t.startsOn ? churchDay(t.startsOn) : null;
  const end = t.endsOn ? churchDay(t.endsOn) : null;
  if (opts.needDate && !start) return 'DATE_REQUIRED';
  if (start && end && end < start) return 'BAD_DATES';
  if (t.startTime && !isClock(t.startTime)) return 'BAD_TIME';
  if (t.endTime && !isClock(t.endTime)) return 'BAD_TIME';
  if (t.startTime && t.endTime && t.endTime < t.startTime) return 'BAD_TIME';
  if (kind === 'REPEAT' && !repeatOf(t.repeatJson)) return 'BAD_REPEAT';
  return null;
}

/** A timing as it is stored: a single date has the same last day; only a repeat keeps its rule. */
export function normalizeTiming(t: Timing): { timingKind: TimingKind; startsOn: Date | null; endsOn: Date | null; startTime: string | null; endTime: string | null; repeatJson: string | null } {
  const kind = (TIMING_KINDS as readonly string[]).includes(t.timingKind ?? '') ? (t.timingKind as TimingKind) : 'RANGE';
  const startsOn = t.startsOn ? new Date(t.startsOn) : null;
  const endsOn = kind === 'DATE' ? startsOn : t.endsOn ? new Date(t.endsOn) : null;
  const rule = kind === 'REPEAT' ? repeatOf(t.repeatJson) : null;
  return { timingKind: kind, startsOn, endsOn, startTime: isClock(t.startTime) ? t.startTime : null, endTime: isClock(t.endTime) ? t.endTime : null, repeatJson: rule ? JSON.stringify(rule) : null };
}

export interface Occurrence { date: string; startTime: string | null; endTime: string | null }

const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const weekday = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
export const isMonth = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

function matches(rule: RepeatRule, y: number, m: number, d: number): boolean {
  const wd = weekday(y, m, d);
  if (rule.kind === 'WEEKLY') return rule.days.includes(wd);
  if (wd !== rule.day) return false;
  const n = daysIn(y, m);
  return rule.nth === 5 ? d + 7 > n : Math.ceil(d / 7) === rule.nth;
}

/** The days of one month ("YYYY-MM") on which the activity happens. A repeat with no last day runs to the end of the month. */
export function occurrencesIn(t: Timing, month: string): Occurrence[] {
  if (!isMonth(month) || !t.startsOn) return [];
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = `${month}-01`;
  const last = `${month}-${pad(daysIn(y, m))}`;
  const start = churchDay(t.startsOn);
  const kind = (t.timingKind ?? 'RANGE') as TimingKind;
  // A range with no last day (an older plan, or an ongoing program) shows on its first day only.
  const end = t.endsOn ? churchDay(t.endsOn) : kind === 'RANGE' ? start : null;
  const at = (date: string): Occurrence => ({ date, startTime: t.startTime ?? null, endTime: t.endTime ?? null });
  if (kind === 'DATE') return start >= first && start <= last ? [at(start)] : [];
  const from = start > first ? start : first;
  const to = end && end < last ? end : last;
  if (from > to) return [];
  const rule = kind === 'REPEAT' ? repeatOf(t.repeatJson) : null;
  if (kind === 'REPEAT' && !rule) return [];
  const out: Occurrence[] = [];
  for (let d = Number(from.slice(8)); d <= Number(to.slice(8)); d += 1) {
    if (!rule || matches(rule, y, m, d)) out.push(at(`${month}-${pad(d)}`));
  }
  return out;
}

/** Whether a new start is more than six months after the old one: the Church Leader is then asked whether the money stays reserved. */
export function postponedOverSixMonths(from: Date | string | null | undefined, to: Date | string | null | undefined): boolean {
  if (!from || !to) return false;
  const a = new Date(churchDay(from));
  const b = new Date(churchDay(to));
  const limit = new Date(a);
  limit.setUTCMonth(limit.getUTCMonth() + 6);
  return b.getTime() > limit.getTime();
}

/** A date or a range in words the notices can use, e.g. "2026-11-14" or "2026-11-14 to 2026-11-20", with the times when there are any. */
export function timingText(t: Timing): string {
  const kind = (t.timingKind ?? 'RANGE') as TimingKind;
  const s = t.startsOn ? churchDay(t.startsOn) : '';
  const e = t.endsOn ? churchDay(t.endsOn) : '';
  if (!s) return '';
  const times = t.startTime ? ` ${t.startTime}${t.endTime ? `–${t.endTime}` : ''}` : '';
  if (kind === 'REPEAT') return `from ${s}${e ? ` to ${e}` : ''}${times}`;
  return kind === 'RANGE' && e && e !== s ? `${s} to ${e}${times}` : `${s}${times}`;
}
