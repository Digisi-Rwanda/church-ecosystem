import { describe, expect, it } from 'vitest';
import type { ProtocolIssueView } from '../api/frontDoorApi';
import { candidatesFor, canAsk, canMark, openBlocking, protocolErrorKey, sortIssues, stepIndex, toggleKind, withDay, withoutDay } from './protocol';

const issue = (key: string, severity: 'BLOCKING' | 'WARNING', overridden = false, message = key): ProtocolIssueView => ({ key, code: 'X', severity, message, serviceId: null, personId: null, overridden, canOverride: false });

describe('protocol helpers', () => {
  it('lists open blocking problems first and allowed ones last', () => {
    const sorted = sortIssues([issue('w', 'WARNING'), issue('o', 'BLOCKING', true), issue('b', 'BLOCKING')]);
    expect(sorted.map((i) => i.key)).toEqual(['b', 'w', 'o']);
    expect(openBlocking(sorted)).toBe(1);
  });
  it('keeps days sorted, unique and valid', () => {
    expect(withDay(['2026-11-08'], '2026-11-01')).toEqual(['2026-11-01', '2026-11-08']);
    expect(withDay(['2026-11-01'], '2026-11-01')).toEqual(['2026-11-01']);
    expect(withDay([], 'tomorrow')).toEqual([]);
    expect(withoutDay(['2026-11-01', '2026-11-08'], '2026-11-01')).toEqual(['2026-11-08']);
  });
  it('toggles service kinds', () => {
    expect(toggleKind(['SS1'], 'SS2')).toEqual(['SS1', 'SS2']);
    expect(toggleKind(['SS1', 'SS2'], 'SS1')).toEqual(['SS2']);
  });
  it('attendance from the day on, excuses until the day', () => {
    expect(canMark('2026-10-04', '2026-10-04')).toBe(true);
    expect(canMark('2026-10-05', '2026-10-04')).toBe(false);
    expect(canAsk('2026-10-04', '2026-10-04')).toBe(true);
    expect(canAsk('2026-10-03', '2026-10-04')).toBe(false);
  });
  it('offers only people not already on the team', () => {
    const roster = [{ personId: 'a', name: 'A', load: 1 }, { personId: 'b', name: 'B', load: 0 }];
    expect(candidatesFor(roster, [{ personId: 'a' }]).map((r) => r.personId)).toEqual(['b']);
  });
  it('orders the steps and maps errors', () => {
    expect(stepIndex('WAIT_MUSIC')).toBeLessThan(stepIndex('DONE'));
    expect(protocolErrorKey('DOUBLE_SUNDAY')).toBe('door.protocol.err.doubleSunday');
    expect(protocolErrorKey('???')).toBe('door.people.actionFailed');
    expect(protocolErrorKey(undefined)).toBe('door.people.actionFailed');
  });
});
