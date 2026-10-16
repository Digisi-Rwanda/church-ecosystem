import type { GroupDetail, GroupKind, GroupListItem } from '../api/frontDoorApi';

const ERROR_KEYS: Record<string, string> = {
  BAD_AGES: 'door.groups.err.ages',
  ALREADY_EXISTS: 'door.groups.err.exists',
  NOT_A_MEMBER: 'door.groups.err.notMember',
  FUTURE_DATE: 'door.groups.err.future',
  WRONG_STATE: 'door.groups.err.closed',
  BAD_INPUT: 'door.groups.err.input',
  FORBIDDEN: 'door.gov.err.notAllowed',
  NOT_FOUND: 'door.work.err.gone',
  PERSON_NOT_ACTIVE: 'door.gov.err.personNotActive',
};
export const groupErrorKey = (code: string | undefined): string => (code && ERROR_KEYS[code]) || 'door.people.actionFailed';

/** The wording of a group changes by system: fellowship groups, classes or age groups. */
export const kindKey = (kind: GroupKind, word: 'title' | 'intro' | 'new' | 'none' | 'noneDetail' | 'name') => `door.groups.${kind}.${word}` as const;

/** "13 to 17", "from 13", "up to 17", or empty. */
export function agesLabel(from: number | null, to: number | null, t: (k: 'door.groups.ages.range' | 'door.groups.ages.from' | 'door.groups.ages.to', v: Record<string, string>) => string): string {
  if (from != null && to != null) return t('door.groups.ages.range', { from: String(from), to: String(to) });
  if (from != null) return t('door.groups.ages.from', { from: String(from) });
  if (to != null) return t('door.groups.ages.to', { to: String(to) });
  return '';
}

/** Whole number from a field, or null when empty; NaN when not a whole number. */
export function wholeOrNull(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  return /^\d{1,3}$/.test(s) ? Number(s) : Number.NaN;
}

/** Active groups first, then by name. */
export function sortGroups(list: GroupListItem[]): GroupListItem[] {
  return [...list].sort((a, b) => (a.status === b.status ? 0 : a.status === 'ACTIVE' ? -1 : 1) || a.name.localeCompare(b.name));
}

/** Members who came to fewer than half of the recent meetings, so a leader can follow them up. */
export function needsFollowUp(members: GroupDetail['members']): GroupDetail['members'] {
  return members.filter((m) => m.of >= 2 && m.rate < 50);
}
