import { describe, expect, it } from 'vitest';
import { codeKey, isDay, monthOf, whoProblem } from '../src/servicePrep/rules.js';

describe('service preparation rules', () => {
  it('accepts only real calendar days', () => {
    expect(isDay('2026-11-22')).toBe(true);
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('22-11-2026')).toBe(false);
  });
  it('takes the month from a day', () => expect(monthOf('2026-11-22')).toBe('2026-11'));
  it('matches service codes regardless of case', () => expect(codeKey(' sunday ')).toBe('SUNDAY'));
  it('needs exactly one of member, guest or visitor name', () => {
    expect(whoProblem({ personId: 'p1' })).toBeNull();
    expect(whoProblem({ guestId: 'g1' })).toBeNull();
    expect(whoProblem({ guestName: 'Visiting pastor' })).toBeNull();
    expect(whoProblem({})).not.toBeNull();
    expect(whoProblem({ personId: 'p1', guestId: 'g1' })).not.toBeNull();
    expect(whoProblem({ personId: 'p1', guestName: 'X' })).not.toBeNull();
  });
});
