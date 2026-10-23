const ERROR_KEYS: Record<string, string> = {
  NOT_A_MEMBER: 'door.groups.err.notMember',
  ALREADY_EXISTS: 'door.choirwork.err.exists',
  FUTURE_DATE: 'door.caring.err.future',
  BAD_DATE: 'door.caring.err.date',
  AMOUNT: 'door.money.err.amount',
  WRONG_STATE: 'door.choirwork.err.state',
  BAD_INPUT: 'door.caring.err.input',
  FORBIDDEN: 'door.gov.err.notAllowed',
  NOT_FOUND: 'door.work.err.gone',
};
export const choirWorkErrorKey = (code: string | undefined): string => (code && ERROR_KEYS[code]) || 'door.people.actionFailed';

/** Singers who came to fewer than half of the recent rehearsals (at least two), so a leader can follow them up. */
export function missingSingers<T extends { of: number; rate: number }>(members: T[]): T[] {
  return members.filter((m) => m.of >= 2 && m.rate < 50);
}

/** A song's "last sung" as whole days before today, or null when never sung. */
export function daysSince(iso: string | null, today: string): number | null {
  if (!iso) return null;
  const d = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000);
  return d < 0 ? 0 : d;
}

/** Songs not sung for the longest time come first; never-sung songs lead, then by title. */
export function restedFirst<T extends { title: string; lastSungOn: string | null }>(songs: T[]): T[] {
  return [...songs].sort((a, b) => (a.lastSungOn ?? '').localeCompare(b.lastSungOn ?? '') || a.title.localeCompare(b.title));
}
