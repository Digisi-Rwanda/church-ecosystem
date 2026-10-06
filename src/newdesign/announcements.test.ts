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
