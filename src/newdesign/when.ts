import type { PlanDetail, PlanTiming, ScheduleActivity, RepeatRule, TimingKind } from '../api/frontDoorApi';
import type { MessageKey } from '../i18n/translate';
import { dueToInput, inputToDue } from './work';

/** What the "When" block of the form holds while it is being filled in. Dates are church days (YYYY-MM-DD), times are HH:MM. */
export type WhenValue = {
  kind: TimingKind;
  start: string;
  end: string;
  startTime: string;
  endTime: string;
  repeat: 'WEEKLY' | 'MONTHLY';
  days: number[];
  nth: number;
  day: number;
};

export const emptyWhen = (): WhenValue => ({ kind: 'DATE', start: '', end: '', startTime: '', endTime: '', repeat: 'WEEKLY', days: [0], nth: 1, day: 0 });

type Timed = Pick<PlanDetail, 'timingKind' | 'startsOn' | 'endsOn' | 'startTime' | 'endTime' | 'repeat'>;

/** Read a saved activity's timing back into the form. An older plan with two different dates is a range. */
export function whenOf(p: Timed): WhenValue {
  const w = emptyWhen();
  const start = dueToInput(p.startsOn);
  const end = dueToInput(p.endsOn);
  const kind: TimingKind = p.timingKind === 'REPEAT' ? 'REPEAT' : end && end !== start ? 'RANGE' : 'DATE';
  const rule: RepeatRule | null = p.repeat;
  return {
    ...w, kind, start, end: kind === 'DATE' ? '' : end, startTime: p.startTime ?? '', endTime: p.endTime ?? '',
    ...(rule?.kind === 'WEEKLY' ? { repeat: 'WEEKLY' as const, days: [...rule.days] } : rule?.kind === 'MONTHLY' ? { repeat: 'MONTHLY' as const, nth: rule.nth, day: rule.day } : {}),
  };
}

export const ruleOf = (w: WhenValue): RepeatRule => (w.repeat === 'WEEKLY' ? { kind: 'WEEKLY', days: [...w.days].sort() } : { kind: 'MONTHLY', nth: w.nth, day: w.day });

/** What the server is sent. A single date has no last day; a repeat carries its rule; times are sent only when written. */
export function whenToInput(w: WhenValue): Omit<PlanTiming, 'location'> {
  return {
    timingKind: w.kind,
    startsOn: w.start ? inputToDue(w.start) : null,
    endsOn: w.kind === 'DATE' || !w.end ? null : inputToDue(w.end),
    startTime: w.startTime || null,
    endTime: w.endTime || null,
    repeat: w.kind === 'REPEAT' ? ruleOf(w) : null,
  };
}

export type WhenProblem = 'BAD_DATES' | 'BAD_TIME' | 'BAD_REPEAT' | 'DATE_REQUIRED' | null;
/** What is wrong before it is sent (the server checks again). A draft may have no date yet; an approved activity may not lose it. */
export function whenProblem(w: WhenValue, opts: { needDate?: boolean } = {}): WhenProblem {
  if (opts.needDate && !w.start) return 'DATE_REQUIRED';
  if (w.kind !== 'DATE' && w.start && w.end && w.end < w.start) return 'BAD_DATES';
  if (w.startTime && w.endTime && w.endTime < w.startTime) return 'BAD_TIME';
  if (w.kind === 'REPEAT' && w.repeat === 'WEEKLY' && w.days.length === 0) return 'BAD_REPEAT';
  return null;
}

/** Whether the timing in the form differs from the saved one. */
export const whenChanged = (a: WhenValue, b: WhenValue): boolean => JSON.stringify(whenToInput(a)) !== JSON.stringify(whenToInput(b));

type Say = (key: MessageKey, vars?: Record<string, string | number>) => string;
/** The activity's time in words: "Sat 14 Nov 2026, 09:00–11:00", "14 Nov – 20 Nov", "Every Sun, Wed from …", "On the 1st Sunday of each month". */
export function whenSummary(p: Timed, t: Say, locale: string): string {
  const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Africa/Kigali' }).format(new Date(iso)) : '');
  const wd = (d: number, style: 'short' | 'long') => new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + d)));
  const w = whenOf(p);
  const times = w.startTime ? `${w.startTime}${w.endTime ? `–${w.endTime}` : ''}` : '';
  let text: string;
  if (!p.startsOn) text = t('door.when.undated');
  else if (w.kind === 'REPEAT' && p.repeat) {
    const rule = p.repeat.kind === 'WEEKLY' ? t('door.when.sum.weekly', { days: p.repeat.days.map((d) => wd(d, 'short')).join(', ') }) : t('door.when.sum.monthly', { nth: t(`door.when.nth.${p.repeat.nth}` as MessageKey), day: wd(p.repeat.day, 'long') });
    text = `${rule} · ${p.endsOn ? t('door.when.sum.fromTo', { from: day(p.startsOn), to: day(p.endsOn) }) : t('door.when.sum.from', { from: day(p.startsOn) })}`;
  } else if (w.kind === 'RANGE' && p.endsOn) text = t('door.when.sum.fromTo', { from: day(p.startsOn), to: day(p.endsOn) });
  else text = day(p.startsOn);
  return times ? `${text}, ${times}` : text;
}

/** The clock part of an activity: "09:00–11:00", "09:00" or nothing. */
export const activityTime = (a: Pick<ScheduleActivity, 'startTime' | 'endTime'>): string => (a.startTime ? `${a.startTime}${a.endTime ? `–${a.endTime}` : ''}` : '');

/** Group by day, in order. */
export function activitiesByDay(items: ScheduleActivity[]): Array<{ day: string; items: ScheduleActivity[] }> {
  const days = new Map<string, ScheduleActivity[]>();
  for (const a of items) days.set(a.date, [...(days.get(a.date) ?? []), a]);
  return [...days.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([day, list]) => ({ day, items: list }));
}

