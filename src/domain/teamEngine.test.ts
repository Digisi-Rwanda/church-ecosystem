import { describe, expect, it } from 'vitest';
import { musicConflictCode } from './teamEngine';
import type { ProtocolRosterMember, ProtocolService } from './types';

const member = { personId: 'p1' } as ProtocolRosterMember;
const svc = (id: string): ProtocolService =>
  ({ id, musicServiceId: id, kind: 'TUESDAY' }) as ProtocolService;

describe('musicConflictCode', () => {
  it('worship-team member is only allowed where Worship is scheduled', () => {
    const units = new Map([['p1', new Set(['mu-worship'])]]);
    const on = new Map([['tue', new Set(['mu-worship', 'mu-elim'])], ['sun', new Set(['mu-hope'])]]);
    expect(musicConflictCode(member, svc('tue'), units, on, true, true)).toBeUndefined();
    expect(musicConflictCode(member, svc('sun'), units, on, true, true)).toBe('WORSHIP_NOT_SCHEDULED');
  });

  it('the worship rule can be switched off independently of the choir rule', () => {
    const units = new Map([['p1', new Set(['mu-worship'])]]);
    const on = new Map([['sun', new Set(['mu-hope'])]]);
    expect(musicConflictCode(member, svc('sun'), units, on, true, false)).toBeUndefined();
  });

  it('a choir member is allowed when any of their units is on the service', () => {
    const units = new Map([['p1', new Set(['mu-elim', 'mu-worship'])]]);
    const on = new Map([['s', new Set(['mu-elim'])], ['t', new Set(['mu-ijwi'])]]);
    expect(musicConflictCode(member, svc('s'), units, on, true, true)).toBeUndefined();
    expect(musicConflictCode(member, svc('t'), units, on, true, true)).toBe('CHOIR_NOT_SCHEDULED');
  });

  it('a person in no choir is never blocked', () => {
    expect(musicConflictCode(member, svc('x'), new Map(), new Map(), true, true)).toBeUndefined();
  });
});
