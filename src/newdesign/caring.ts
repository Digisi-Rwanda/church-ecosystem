const ERROR_KEYS: Record<string, string> = {
  SAME_PERSON: 'door.caring.err.same',
  ALREADY_EXISTS: 'door.caring.err.exists',
  BAD_DATE: 'door.caring.err.date',
  FUTURE_DATE: 'door.caring.err.future',
  BAD_TIMES: 'door.caring.err.times',
  WRONG_STATE: 'door.caring.err.closed',
  TOO_MANY: 'door.caring.err.full',
  BAD_INPUT: 'door.caring.err.input',
  FORBIDDEN: 'door.gov.err.notAllowed',
  NOT_FOUND: 'door.work.err.gone',
  PERSON_NOT_ACTIVE: 'door.gov.err.personNotActive',
};
export const caringErrorKey = (code: string | undefined): string => (code && ERROR_KEYS[code]) || 'door.people.actionFailed';

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
/** Monday-first order for display, with Sunday last. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** Watches grouped by weekday in Monday-first order, empty days left out. */
export function byWeekday<T extends { weekday: number; startTime: string }>(list: T[]): Array<{ weekday: number; items: T[] }> {
  return WEEK_ORDER.map((weekday) => ({ weekday, items: list.filter((w) => w.weekday === weekday).sort((a, b) => a.startTime.localeCompare(b.startTime)) })).filter((d) => d.items.length > 0);
}
