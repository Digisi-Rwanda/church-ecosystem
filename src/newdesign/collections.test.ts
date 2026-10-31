import { describe, expect, it } from 'vitest';
import type { CollectionItem } from '../api/frontDoorApi';
import { collectionErrorKey, collectionsToCsv, parseGiving, yearMonths } from './collections';

const item = (o: Partial<CollectionItem>): CollectionItem => ({
  id: 'x', kind: 'SERVICE', title: 'Sunday service', heldOn: '2026-09-27', startsAt: '09:00', tithe: 100, offering: 50, other: 0, total: 150, note: '', status: 'ACTIVE', voidReason: null, recordedByName: 'Treasurer', ...o,
});

describe('collections helpers', () => {
  it('reads a giving: empty is zero, spaces and commas are ignored, anything else is refused', () => {
    expect(parseGiving('')).toBe(0);
    expect(parseGiving('0')).toBe(0);
    expect(parseGiving('120 000')).toBe(120000);
    expect(parseGiving('1,500')).toBe(1500);
    expect(parseGiving('12.5')).toBeNull();
    expect(parseGiving('-3')).toBeNull();
    expect(parseGiving('abc')).toBeNull();
  });
  it('fills the months with no collection so a chart shows all twelve', () => {
    const m = yearMonths(2026, [{ month: '2026-03', tithe: 1, offering: 2, other: 3, total: 6, count: 1 }]);
    expect(m).toHaveLength(12);
    expect(m[2]!.total).toBe(6);
    expect(m[0]).toMatchObject({ month: '2026-01', total: 0 });
  });
  it('writes the CSV oldest first, counts a cancelled one as zero and keeps its reason', () => {
    const csv = collectionsToCsv(
      [item({ id: 'b', heldOn: '2026-09-27' }), item({ id: 'a', heldOn: '2026-09-20', title: 'Midweek, special', status: 'VOIDED', voidReason: 'Entered twice' })],
      ['date', 'time', 'kind', 'title', 'tithe', 'offering', 'other', 'total', 'status', 'reason', 'note', 'recordedBy'],
    ).split('\r\n');
    expect(csv[1]).toBe('2026-09-20,09:00,SERVICE,"Midweek, special",100,50,0,0,VOIDED,Entered twice,,Treasurer');
    expect(csv[2]!.startsWith('2026-09-27')).toBe(true);
  });
  it('maps the server’s refusals to words', () => {
    expect(collectionErrorKey('AMOUNT')).toBe('door.coll.err.amount');
    expect(collectionErrorKey('NOPE')).toBe('door.people.actionFailed');
  });
});
