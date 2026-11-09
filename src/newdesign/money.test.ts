import { describe, expect, it } from 'vitest';
import type { MoneyEntryItem } from '../api/frontDoorApi';
import { currentMonth, formatRwf, moneyErrorKey, parseAmount, queueFirst } from './money';

const e = (id: string, status: MoneyEntryItem['status'], day: string) => ({ id, status, occurredOn: day }) as MoneyEntryItem;

describe('money helpers', () => {
  it('formats francs with thousands', () => {
    expect(formatRwf(0)).toBe('0 RWF');
    expect(formatRwf(1234567)).toBe('1,234,567 RWF');
  });
  it('reads typed amounts', () => {
    expect(parseAmount('12 500')).toBe(12500);
    expect(parseAmount('12,500')).toBe(12500);
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('12.5')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
  });
  it('puts waiting spending first', () => {
    expect(queueFirst([e('a', 'APPROVED', '2026-10-05'), e('b', 'PENDING_APPROVAL', '2026-10-01'), e('c', 'RECORDED', '2026-10-06')]).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
  it('maps error codes and falls back', () => {
    expect(moneyErrorKey('OWN_ENTRY')).toBe('door.money.err.ownEntry');
    expect(moneyErrorKey('???')).toBe('door.people.actionFailed');
  });
  it('month is in Kigali time', () => {
    expect(currentMonth(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11');
  });
});
