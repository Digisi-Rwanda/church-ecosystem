import { describe, expect, it } from 'vitest';
import type { OversightRow } from '../api/frontDoorApi';
import { groupUrgent, needsAttention, orderOversight, takeFirst, urgentHref } from './central';

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

describe('urgent groups', () => {
  it('groups by kind in a fixed order and leaves out the empty ones', () => {
    const it = (kind: string, n: number) => ({ key: `${kind}${n}`, kind, systemId: 's', systemName: 'S', unitName: 'U', subject: 'x', id: null, at: null }) as never;
    const g = groupUrgent([it('VACANCY', 1), it('DECISION_TO_APPROVE', 1), it('VACANCY', 2)]);
    expect(g.map((x) => [x.kind, x.items.length])).toEqual([['DECISION_TO_APPROVE', 1], ['VACANCY', 2]]);
  });
  it('takes the first few and counts the rest', () => {
    expect(takeFirst([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2, 3], more: 2 });
    expect(takeFirst([1], 3)).toEqual({ shown: [1], more: 0 });
  });
});
