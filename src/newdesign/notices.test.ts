import { describe, expect, it } from 'vitest';
import type { NoticeItem } from '../api/frontDoorApi';
import { badge, dayLabel, safeHref, unreadKeys, withRead } from './notices';

const item = (key: string, read: boolean): NoticeItem => ({
  key, kind: 'FOR_INFORMATION', title: key, body: null, href: null, systemId: 'sys-main', createdAt: '2026-01-01T00:00:00Z', read, important: false,
});

describe('safeHref', () => {
  it('follows only links that stay inside the app', () => {
    expect(safeHref('/s/sys-main/people')).toBe('/s/sys-main/people');
    expect(safeHref('https://evil.example')).toBeNull();
    expect(safeHref('//evil.example')).toBeNull();
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref(null)).toBeNull();
  });
});

describe('dayLabel', () => {
  const now = new Date(2026, 9, 6, 15, 0);
  it('says today, yesterday, or the date', () => {
    expect(dayLabel(new Date(2026, 9, 6, 8, 0).toISOString(), now).kind).toBe('today');
    expect(dayLabel(new Date(2026, 9, 5, 23, 0).toISOString(), now).kind).toBe('yesterday');
    expect(dayLabel(new Date(2026, 8, 1, 10, 0).toISOString(), now)).toEqual({ kind: 'date', date: '2026-09-01' });
    expect(dayLabel('nonsense', now).date).toBe('');
  });
});

describe('read state helpers', () => {
  it('finds unread keys and changes read state without touching the rest', () => {
    const list = [item('a', false), item('b', true), item('c', false)];
    expect(unreadKeys(list)).toEqual(['a', 'c']);
    const next = withRead(list, ['a', 'b'], true);
    expect(next.map((i) => i.read)).toEqual([true, true, false]);
    expect(list[0].read).toBe(false);
  });
});

describe('badge', () => {
  it('hides zero and caps large numbers', () => {
    expect(badge(0)).toBe('');
    expect(badge(7)).toBe('7');
    expect(badge(250)).toBe('99+');
  });
});
