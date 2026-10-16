import { describe, expect, it } from 'vitest';
import type { PulpitSlotItem } from '../api/frontDoorApi';
import { evangErrorKey, isOpenContact, splitPlan } from './evangelism';

describe('evangelism helpers', () => {
  it('splits the plan around today', () => {
    const s = (serviceOn: string) => ({ serviceOn }) as PulpitSlotItem;
    const out = splitPlan([s('2026-10-04'), s('2026-10-18'), s('2026-10-11'), s('2026-09-27')], '2026-10-07');
    expect(out.upcoming.map((x) => x.serviceOn)).toEqual(['2026-10-11', '2026-10-18']);
    expect(out.past.map((x) => x.serviceOn)).toEqual(['2026-10-04', '2026-09-27']);
  });
  it('open contacts', () => {
    expect(isOpenContact('NEW')).toBe(true);
    expect(isOpenContact('FOLLOWING')).toBe(true);
    expect(isOpenContact('JOINED')).toBe(false);
  });
  it('error keys', () => {
    expect(evangErrorKey('ONE_PREACHER')).toBe('door.evang.err.onePreacher');
    expect(evangErrorKey(undefined)).toBe('door.people.actionFailed');
  });
});
