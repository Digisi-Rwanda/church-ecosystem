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
