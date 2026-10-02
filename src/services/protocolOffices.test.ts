import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('window', {
  setTimeout, clearTimeout,
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  addEventListener: () => {},
});
vi.stubGlobal('localStorage', (globalThis as any).window.localStorage);

import { applyProtocolOffices } from '../data/protocolOffices';
import { PROTOCOL_ROSTER } from '../data/protocolSeed';
import { PEOPLE } from '../data/seed';
import { protocolService } from './protocolService';

const office = (id: string, personId: string, protocolOffice: string, name: string) => ({
  id, personId, title: `Protocol ${protocolOffice}`, protocolOffice, startDate: '2026-01-01',
  person: { id: personId, fullName: name, preferredName: name.split(' ')[0], email: `${personId}@x.org` },
});

describe('Protocol offices from the server', () => {
  it('a real person gets their office, and it follows the server', () => {
    const list = [
      office('a', 'srv-real-coord', 'COORDINATOR', 'Real Coordinator'),
      office('b', 'srv-real-pres', 'PRESIDENT', 'Real President'),
    ];
    expect(applyProtocolOffices(list)).toBe(true);
    expect(applyProtocolOffices(list)).toBe(false); // unchanged → nothing to do
    expect(protocolService.officeFor('srv-real-coord')).toBe('COORDINATOR');
    expect(protocolService.isCoordinator('srv-real-coord')).toBe(true);
    expect(protocolService.isReviewer('srv-real-pres')).toBe(true);
    expect(protocolService.isReviewer('srv-real-coord')).toBe(false);
    expect(PEOPLE.some((p) => p.id === 'srv-real-pres')).toBe(true);

    // the server moves the Presidency to someone else
    applyProtocolOffices([
      office('a', 'srv-real-coord', 'COORDINATOR', 'Real Coordinator'),
      office('c', 'srv-new-pres', 'PRESIDENT', 'New President'),
    ]);
    expect(protocolService.isReviewer('srv-real-pres')).toBe(false);
    expect(protocolService.isReviewer('srv-new-pres')).toBe(true);
    applyProtocolOffices([]);
    expect(protocolService.officeFor('srv-real-coord')).toBeNull();
  });

  it('ignores offices it does not know', () => {
    expect(applyProtocolOffices([office('z', 'srv-x', 'EMPEROR', 'Nobody')])).toBe(false);
  });
});

describe('Roster management', () => {
  const coordinator = PROTOCOL_ROSTER.find((m) => m.office === 'COORDINATOR')!.personId;
  const member = PROTOCOL_ROSTER.find((m) => m.office === 'MEMBER')!;
  beforeEach(() => {
    const i = PROTOCOL_ROSTER.findIndex((m) => m.personId === 'srv-newbie');
    if (i >= 0) PROTOCOL_ROSTER.splice(i, 1);
  });

  it('only the Coordinator can change the roster', () => {
    expect(protocolService.rosterAdd({ personId: 'srv-newbie' }, member.personId).ok).toBe(false);
    expect(protocolService.rosterUpdate(member.id, { notes: 'x' }, member.personId).ok).toBe(false);
  });

  it('adds a person from the directory, shows their saved name, and rejects duplicates', () => {
    const r = protocolService.rosterAdd(
      { personId: 'srv-newbie', displayName: 'Newbie Person', email: 'n@x.org', serveDays: 'TUESDAY' },
      coordinator,
    );
    expect(r.ok).toBe(true);
    const row = PROTOCOL_ROSTER.find((m) => m.id === r.id)!;
    expect(row).toMatchObject({ office: 'MEMBER', status: 'ACTIVE', serveDays: 'TUESDAY' });
    expect(protocolService.personLabel('srv-newbie')).toBe('Newbie Person');
    expect(protocolService.rosterAdd({ personId: 'srv-newbie' }, coordinator).ok).toBe(false);
  });

  it('updates status, leave dates and notes, and can reactivate', () => {
    const { id } = protocolService.rosterAdd({ personId: 'srv-newbie', displayName: 'Newbie' }, coordinator);
    expect(protocolService.rosterUpdate(id!, { status: 'LEAVE', unavailableDates: ['2026-10-11', '2026-10-04'], notes: ' away ' }, coordinator).ok).toBe(true);
    const row = PROTOCOL_ROSTER.find((m) => m.id === id)!;
    expect(row).toMatchObject({ status: 'LEAVE', unavailableDates: ['2026-10-04', '2026-10-11'], notes: 'away' });
    expect(protocolService.rosterUpdate(id!, { unavailableDates: ['11/10/2026'] }, coordinator).ok).toBe(false);
    protocolService.rosterUpdate(id!, { status: 'INACTIVE' }, coordinator);
    expect(protocolService.rosterAdd({ personId: 'srv-newbie' }, coordinator).ok).toBe(true);
    expect(PROTOCOL_ROSTER.find((m) => m.id === id)!.status).toBe('ACTIVE');
  });

  it('leadership offices cannot be set or removed from the roster', () => {
    const coordRow = PROTOCOL_ROSTER.find((m) => m.office === 'COORDINATOR')!;
    expect(protocolService.rosterUpdate(coordRow.id, { status: 'INACTIVE' }, coordinator).ok).toBe(false);
    expect(protocolService.rosterUpdate(member.id, { office: 'PRESIDENT' }, coordinator).ok).toBe(false);
    expect(protocolService.rosterUpdate(member.id, { office: 'SECRETARY' }, coordinator).ok).toBe(true);
    protocolService.rosterUpdate(member.id, { office: 'MEMBER' }, coordinator);
  });
});
