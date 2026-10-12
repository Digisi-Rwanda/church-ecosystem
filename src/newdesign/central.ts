import type { OversightRow, UrgentItem, UrgentKind } from '../api/frontDoorApi';

export const urgentKey = (k: UrgentKind) => `door.central.urgent.${k}` as const;

/** Where an urgent item leads: the exact record when there is one, else the screen that fixes it. */
export function urgentHref(u: Pick<UrgentItem, 'kind' | 'systemId' | 'id'>): string {
  const gov = `/s/${u.systemId}/governance`;
  switch (u.kind) {
    case 'DECISION_TO_APPROVE':
      return `${gov}/decisions`;
    case 'MEETING_OVERDUE':
      return u.id ? `${gov}/meetings/${u.id}` : gov;
    case 'LETTER_TO_DELIVER':
    case 'LETTER_TO_PRINT':
      return u.id ? `${gov}/letters/${u.id}` : `${gov}/letters`;
    case 'VACANCY':
    case 'TERM_ENDING':
      return '/s/sys-main/people/appointments';
  }
}

/** Does this system need anyone's attention? Used to put the busy ones in plain sight. */
export const needsAttention = (r: OversightRow): boolean => r.overdueMeetings + r.decisionsWaiting + r.vacancies > 0;

/** Systems that need attention first, each group keeping the server's order. */
export function orderOversight(rows: OversightRow[]): OversightRow[] {
  return [...rows].sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a)));
}

/** The kinds in the order they are shown, each with its icon and tone. */
export const URGENT_KINDS: Array<{ kind: UrgentKind; icon: 'board' | 'calendar' | 'inbox' | 'user' | 'clock'; tone: 'red' | 'blue' | 'amber' }> = [
  { kind: 'DECISION_TO_APPROVE', icon: 'board', tone: 'red' },
  { kind: 'MEETING_OVERDUE', icon: 'calendar', tone: 'red' },
  { kind: 'LETTER_TO_PRINT', icon: 'inbox', tone: 'blue' },
  { kind: 'LETTER_TO_DELIVER', icon: 'inbox', tone: 'blue' },
  { kind: 'TERM_ENDING', icon: 'clock', tone: 'amber' },
  { kind: 'VACANCY', icon: 'user', tone: 'amber' },
];

/** The urgent items grouped by kind, in the fixed order; kinds with nothing in them are left out. */
export function groupUrgent(items: UrgentItem[]) {
  return URGENT_KINDS.map((k) => ({ ...k, items: items.filter((i) => i.kind === k.kind) })).filter((g) => g.items.length > 0);
}

/** The first few of a list, and how many are left out. */
export function takeFirst<T>(list: T[], n: number): { shown: T[]; more: number } {
  return { shown: list.slice(0, n), more: Math.max(0, list.length - n) };
}
