import { describe, expect, it } from 'vitest';
import type { OversightRow } from '../api/frontDoorApi';
import { needsAttention, orderOversight, urgentHref } from './central';

const row = (o: Partial<OversightRow>): OversightRow => ({ systemId: 's', name: 's', units: 1, plannedMeetings: 0, overdueMeetings: 0, decisionsWaiting: 0, lettersOpen: 0, vacancies: 0, ...o });

describe('central home helpers', () => {
  it('sends each urgent item to the screen that settles it', () => {
    expect(urgentHref({ kind: 'DECISION_TO_APPROVE', systemId: 'sys-choir', id: 'd1' })).toBe('/s/sys-choir/governance/decisions');
    expect(urgentHref({ kind: 'MEETING_OVERDUE', systemId: 'sys-choir', id: 'm1' })).toBe('/s/sys-choir/governance/meetings/m1');
    expect(urgentHref({ kind: 'LETTER_TO_PRINT', systemId: 'sys-main', id: 'l1' })).toBe('/s/sys-main/governance/letters/l1');
    expect(urgentHref({ kind: 'VACANCY', systemId: 'sys-youth', id: null })).toBe('/s/sys-main/people/appointments');
  });
  it('puts systems that need attention first and keeps the rest in order', () => {
    const rows = [row({ systemId: 'a' }), row({ systemId: 'b', vacancies: 1 }), row({ systemId: 'c' }), row({ systemId: 'd', decisionsWaiting: 2 })];
    expect(orderOversight(rows).map((r) => r.systemId)).toEqual(['b', 'd', 'a', 'c']);
    expect(needsAttention(row({ lettersOpen: 3 }))).toBe(false);
  });
});
