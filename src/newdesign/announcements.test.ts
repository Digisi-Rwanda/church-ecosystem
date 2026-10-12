import { describe, expect, it } from 'vitest';
import type { AnnouncementItem, AnnouncementOptions } from '../api/frontDoorApi';
import { announceErrorKey, audienceKinds, buildAudience, canCompose, dayOf, formReady, markedRead, unreadIds } from './announcements';

const opts = (over: Partial<AnnouncementOptions> = {}): AnnouncementOptions => ({
  wholeChurch: false, offices: [], systems: [], limits: { titleMax: 120, bodyMax: 2000 }, ...over,
});
const item = (id: string, read = false): AnnouncementItem => ({
  id, title: id, body: '', audience: { kind: 'WHOLE_CHURCH', systemId: null, systemName: null, office: null },
  authorId: 'a', authorName: 'A', publishedAt: null, expiresAt: null, read, mine: false, canWithdraw: false,
});

describe('audienceKinds', () => {
  it('offers only what the server allowed', () => {
    expect(audienceKinds(undefined)).toEqual([]);
    expect(audienceKinds(opts())).toEqual([]);
    expect(audienceKinds(opts({ systems: [{ id: 'sys-choir', name: 'Choir', shortName: 'Choir' }] }))).toEqual(['SYSTEM']);
    expect(audienceKinds(opts({ wholeChurch: true, offices: ['TREASURER'], systems: [{ id: 's', name: 's', shortName: 's' }] }))).toEqual(['WHOLE_CHURCH', 'SYSTEM', 'OFFICE']);
  });
  it('a reader who may not post gets no form', () => {
    expect(canCompose(opts())).toBe(false);
    expect(canCompose(opts({ wholeChurch: true }))).toBe(true);
  });
});

describe('buildAudience and formReady', () => {
  it('is complete only when the chosen audience has what it needs', () => {
    expect(buildAudience('', '', '')).toBeNull();
    expect(buildAudience('WHOLE_CHURCH', '', '')).toEqual({ kind: 'WHOLE_CHURCH' });
    expect(buildAudience('SYSTEM', '', '')).toBeNull();
    expect(buildAudience('SYSTEM', 'sys-choir', '')).toEqual({ kind: 'SYSTEM', systemId: 'sys-choir' });
    expect(buildAudience('OFFICE', '', '')).toBeNull();
    expect(buildAudience('OFFICE', '', 'TREASURER')).toEqual({ kind: 'OFFICE', office: 'TREASURER' });
  });
  it('needs a title of 3 letters, a message and an audience', () => {
    const a = { kind: 'WHOLE_CHURCH' as const };
    expect(formReady('Hi', 'x', a)).toBe(false);
    expect(formReady('Hello', '  ', a)).toBe(false);
    expect(formReady('Hello', 'x', null)).toBe(false);
    expect(formReady(' Hello ', 'x', a)).toBe(true);
  });
});

describe('read state and wording', () => {
  it('marks some read and lists the unread', () => {
    const list = [item('a'), item('b'), item('c', true)];
    expect(unreadIds(list)).toEqual(['a', 'b']);
    expect(unreadIds(markedRead(list, ['a']))).toEqual(['b']);
    expect(list[0].read).toBe(false);
  });
  it('turns the refusal codes into messages', () => {
    expect(announceErrorKey('CANNOT_SEND_TO_AUDIENCE')).toBe('door.announce.err.notAllowed');
    expect(announceErrorKey('BAD_DATES')).toBe('door.announce.err.badDates');
    expect(announceErrorKey('ALREADY_WITHDRAWN')).toBe('door.announce.err.alreadyDown');
    expect(announceErrorKey('???')).toBe('door.people.actionFailed');
    expect(announceErrorKey(undefined)).toBe('door.people.actionFailed');
  });
  it('shows a last day as a date', () => {
    expect(dayOf('2026-10-31T00:00:00.000Z')).toBe('2026-10-31');
    expect(dayOf(null)).toBe('');
  });
});

import { filterAnnouncements, inPeriod } from './announcements';
describe('announcement filters', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  const a = (id: string, o: Record<string, unknown>) => ({ id, title: id, body: '', audience: { kind: 'WHOLE_CHURCH', systemId: null, systemName: null, office: null }, authorId: 'x', authorName: 'x', publishedAt: '2026-10-11T10:00:00Z', expiresAt: null, read: false, mine: false, canWithdraw: false, ...o }) as never;
  it('filters by status, audience and period', () => {
    const list = [a('old', { publishedAt: '2026-08-01T10:00:00Z', read: true }), a('mine', { mine: true }), a('sys', { audience: { kind: 'SYSTEM', systemId: 's', systemName: 'S', office: null } })];
    expect(filterAnnouncements(list, { status: 'unread', audience: '', period: 'any' }, now).map((x: { id: string }) => x.id)).toEqual(['mine', 'sys']);
    expect(filterAnnouncements(list, { status: 'mine', audience: '', period: 'any' }, now)).toHaveLength(1);
    expect(filterAnnouncements(list, { status: 'all', audience: 'SYSTEM', period: 'any' }, now)).toHaveLength(1);
    expect(filterAnnouncements(list, { status: 'all', audience: '', period: 'month' }, now)).toHaveLength(2);
  });
  it('counts back from now', () => {
    expect(inPeriod('2026-10-12T01:00:00Z', 'today', now)).toBe(true);
    expect(inPeriod('2026-10-01T01:00:00Z', 'week', now)).toBe(false);
  });
});
