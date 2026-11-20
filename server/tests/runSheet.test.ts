import { describe, expect, it } from 'vitest';
import { chain, endTimeOf, fromMinutes, ownerProblem, runWarnings, toMinutes } from '../src/servicePrep/runSheet.js';

describe('run-sheet times', () => {
  it('converts times both ways', () => {
    expect(toMinutes('09:30')).toBe(570);
    expect(fromMinutes(570)).toBe('09:30');
  });
  it('works out the end of an item', () => expect(endTimeOf({ startTime: '09:50', minutes: 25 })).toBe('10:15'));
  it('lays template items one after another', () => {
    const rows = chain('09:00', [{ minutes: 10 }, { minutes: 20 }, { minutes: 5 }]);
    expect(rows.map((r) => r.startTime)).toEqual(['09:00', '09:10', '09:30']);
  });
  it('warns when items overlap or run past the end', () => {
    const items = [{ startTime: '09:00', minutes: 30 }, { startTime: '09:20', minutes: 10 }, { startTime: '11:50', minutes: 20 }];
    expect(runWarnings(items, '12:00')).toEqual([{ kind: 'OVERLAP', index: 1, with: 0 }, { kind: 'OVERRUN', index: 2 }]);
    expect(runWarnings(items.slice(0, 1), null)).toEqual([]);
  });
  it('does not call back-to-back items an overlap', () => {
    expect(runWarnings([{ startTime: '09:00', minutes: 10 }, { startTime: '09:10', minutes: 10 }], '10:00')).toEqual([]);
  });
  it('asks for what each owner kind needs', () => {
    expect(ownerProblem({ ownerKind: 'PERSON' })).not.toBeNull();
    expect(ownerProblem({ ownerKind: 'PERSON', personId: 'p' })).toBeNull();
    expect(ownerProblem({ ownerKind: 'PULPIT' })).not.toBeNull();
    expect(ownerProblem({ ownerKind: 'TEXT', ownerLabel: '  ' })).not.toBeNull();
    expect(ownerProblem({ ownerKind: 'CHOIR' })).toBeNull();
    expect(ownerProblem({ ownerKind: 'PROTOCOL' })).toBeNull();
  });
});
