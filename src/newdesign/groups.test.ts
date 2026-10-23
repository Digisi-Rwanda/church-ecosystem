import { describe, expect, it } from 'vitest';
import type { GroupDetail, GroupListItem } from '../api/frontDoorApi';
import { agesLabel, groupErrorKey, needsFollowUp, sortGroups, wholeOrNull } from './groups';

const t = (k: string, v: Record<string, string>) => `${k}:${JSON.stringify(v)}`;

describe('group helpers', () => {
  it('ages label', () => {
    expect(agesLabel(13, 17, t as never)).toContain('range');
    expect(agesLabel(13, null, t as never)).toContain('from');
    expect(agesLabel(null, 17, t as never)).toContain('door.groups.ages.to');
    expect(agesLabel(null, null, t as never)).toBe('');
  });
  it('whole numbers', () => {
    expect(wholeOrNull('')).toBeNull();
    expect(wholeOrNull(' 13 ')).toBe(13);
    expect(wholeOrNull('1.5')).toBeNaN();
    expect(wholeOrNull('abc')).toBeNaN();
  });
  it('active groups first', () => {
    const g = (name: string, status: GroupListItem['status']) => ({ name, status }) as GroupListItem;
    expect(sortGroups([g('B', 'CLOSED'), g('C', 'ACTIVE'), g('A', 'ACTIVE')]).map((x) => x.name)).toEqual(['A', 'C', 'B']);
  });
  it('follow-up needs at least two meetings and under half attended', () => {
    const m = (personId: string, of: number, rate: number) => ({ personId, of, rate }) as GroupDetail['members'][number];
    expect(needsFollowUp([m('a', 1, 0), m('b', 4, 25), m('c', 4, 50), m('d', 2, 0)]).map((x) => x.personId)).toEqual(['b', 'd']);
  });
  it('errors fall back', () => {
    expect(groupErrorKey('NOT_A_MEMBER')).toBe('door.groups.err.notMember');
    expect(groupErrorKey(undefined)).toBe('door.people.actionFailed');
  });
});
