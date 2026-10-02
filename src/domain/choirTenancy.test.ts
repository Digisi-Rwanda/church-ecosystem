import { describe, expect, it } from 'vitest';
import { CHOIR_ORG_UNITS } from './choirCatalog';
import {
  personHasChoirOversight,
  resolveAccessibleChoirOrgUnitIds,
} from './choirTenancy';
import type { Membership, Position } from './types';

describe('choirTenancy', () => {
  it('gives pastor oversight all named choirs', () => {
    const positions: Position[] = [
      {
        id: 'pos-pastor',
        personId: 'p-pastor',
        title: 'Church Leader',
        orgUnitId: 'ou-leadership',
        systemRole: 'CHURCH_LEADER',
        grantsAllSystems: true,
        status: 'ACTIVE',
        startDate: '2018-01-01',
      },
    ];
    expect(personHasChoirOversight(positions)).toBe(true);
    expect(resolveAccessibleChoirOrgUnitIds([], positions)).toEqual(
      CHOIR_ORG_UNITS.map((c) => c.id),
    );
  });

  it('scopes choir leader to membership/position choir only', () => {
    const memberships: Membership[] = [
      {
        id: 'm1',
        personId: 'p-choir-leader',
        type: 'CHOIR_MEMBER',
        label: 'Ijwi member',
        status: 'ACTIVE',
        startDate: '2022-01-01',
        orgUnitId: 'ou-choir-ijwi',
        systemId: 'sys-choir',
      },
    ];
    const positions: Position[] = [
      {
        id: 'pos-choir-leader',
        personId: 'p-choir-leader',
        title: 'Choir Music Director',
        orgUnitId: 'ou-choir-ijwi',
        choirOffice: 'MUSIC_DIRECTOR',
        systemId: 'sys-choir',
        status: 'ACTIVE',
        startDate: '2022-01-01',
      },
    ];
    expect(personHasChoirOversight(positions)).toBe(false);
    expect(resolveAccessibleChoirOrgUnitIds(memberships, positions)).toEqual([
      'ou-choir-ijwi',
    ]);
  });
});
