import { describe, expect, it } from 'vitest';
import { authorize, buildEffectiveAccess } from './authorize';
import {
  ministryOfficeMayAccessModule,
  resolveMinistryBoardOffice,
} from './ministryNavAccess';
import {
  oversightMayAccessModule,
  resolvePeerEntry,
} from './oversightAccess';
import { authorizeFinanceFund, visibleFundIds } from './financeAccess';
import { choirOfficeMayAccess } from './choirNav';
import {
  ASSIGNMENTS,
  MEMBERSHIPS,
  POSITIONS,
  SYSTEMS,
  TASKS,
} from '../data/seed';
import type { SystemId } from './types';

function participation() {
  return {
    memberships: MEMBERSHIPS,
    positions: POSITIONS,
    assignments: ASSIGNMENTS,
    tasks: TASKS,
    allSystemIds: SYSTEMS.map((s) => s.id) as SystemId[],
  };
}

function grantsFor(personId: string) {
  return buildEffectiveAccess(personId, participation());
}

describe('ministry member module allow-list', () => {
  it('blocks finance suite for MEMBER on youth', () => {
    expect(
      ministryOfficeMayAccessModule('sys-youth', 'MEMBER', 'finance'),
    ).toBe(false);
    expect(
      ministryOfficeMayAccessModule('sys-youth', 'MEMBER', 'donations'),
    ).toBe(false);
    expect(
      ministryOfficeMayAccessModule('sys-youth', 'MEMBER', 'my-contributions'),
    ).toBe(true);
  });

  it('allows treasurer full suite; president oversight finance (not donations)', () => {
    expect(
      ministryOfficeMayAccessModule('sys-youth', 'TREASURER', 'donations'),
    ).toBe(true);
    expect(
      ministryOfficeMayAccessModule('sys-youth', 'PRESIDENT', 'finance'),
    ).toBe(true);
    expect(
      ministryOfficeMayAccessModule('sys-youth', 'PRESIDENT', 'accounting'),
    ).toBe(true);
    expect(
      ministryOfficeMayAccessModule('sys-youth', 'PRESIDENT', 'assets'),
    ).toBe(true);
    expect(
      ministryOfficeMayAccessModule('sys-youth', 'PRESIDENT', 'reports'),
    ).toBe(true);
    expect(
      ministryOfficeMayAccessModule('sys-youth', 'PRESIDENT', 'donations'),
    ).toBe(false);
  });

  it('music president can open accounting and assets', () => {
    expect(
      ministryOfficeMayAccessModule('sys-music', 'PRESIDENT', 'accounting'),
    ).toBe(true);
    expect(
      ministryOfficeMayAccessModule('sys-music', 'PRESIDENT', 'assets'),
    ).toBe(true);
    expect(
      ministryOfficeMayAccessModule('sys-music', 'PRESIDENT', 'donations'),
    ).toBe(false);
  });

  it('protocol members only get schedule surface', () => {
    expect(
      ministryOfficeMayAccessModule('sys-protocol', 'MEMBER', 'teams'),
    ).toBe(false);
    expect(
      ministryOfficeMayAccessModule('sys-protocol', 'MEMBER', 'mine'),
    ).toBe(true);
  });
});

describe('resolveMinistryBoardOffice', () => {
  it('resolves youth president from seeded positions', () => {
    const office = resolveMinistryBoardOffice(
      'p-youth-leader',
      'sys-youth',
      POSITIONS,
    );
    expect(office).toBe('PRESIDENT');
  });

  it('does not promote pastor governance to PRESIDENT on youth', () => {
    const office = resolveMinistryBoardOffice(
      'p-pastor',
      'sys-youth',
      POSITIONS,
    );
    expect(office).toBe('MEMBER');
  });
});

describe('peer oversight entry', () => {
  it('pastor enters youth as oversight, not officer', () => {
    const entry = resolvePeerEntry('p-pastor', 'sys-youth', POSITIONS);
    expect(entry.kind).toBe('oversight');
    expect(oversightMayAccessModule('sys-youth', 'assets')).toBe(true);
    expect(oversightMayAccessModule('sys-youth', 'finance')).toBe(false);
    expect(oversightMayAccessModule('sys-youth', 'donations')).toBe(false);
    expect(oversightMayAccessModule('sys-youth', 'programs')).toBe(true);
  });

  it('youth president stays officer on youth', () => {
    const entry = resolvePeerEntry('p-youth-leader', 'sys-youth', POSITIONS);
    expect(entry.kind).toBe('officer');
    expect(entry.office).toBe('PRESIDENT');
  });

  it('catechist enters youth as oversight with ops depth modules', () => {
    const entry = resolvePeerEntry('p-catechist', 'sys-youth', POSITIONS);
    expect(entry.kind).toBe('oversight');
    expect(oversightMayAccessModule('sys-youth', 'tasks', 'ops')).toBe(true);
  });

  it('ordained pastor (Claire) gets light oversight nav', () => {
    const entry = resolvePeerEntry('p-assistant', 'sys-youth', POSITIONS);
    expect(entry.kind).toBe('oversight');
    expect(oversightMayAccessModule('sys-youth', 'tasks', 'light')).toBe(false);
    expect(oversightMayAccessModule('sys-youth', 'programs', 'light')).toBe(
      true,
    );
  });

  it('secretary is not peer oversight by role alone', () => {
    const entry = resolvePeerEntry('p-secretary', 'sys-youth', POSITIONS);
    expect(entry.kind).toBe('member');
  });

  it('pastor cannot VIEW ministry finance via governance grants', () => {
    const grants = grantsFor('p-pastor');
    const fin = authorize({
      personId: 'p-pastor',
      systemId: 'sys-youth',
      resource: 'MINISTRY_FINANCE',
      action: 'VIEW',
    }, grants);
    expect(fin.allowed).toBe(false);
  });

  it('pastor can ENTER youth and VIEW programs (oversight)', () => {
    const grants = grantsFor('p-pastor');
    expect(
      authorize(
        {
          personId: 'p-pastor',
          systemId: 'sys-youth',
          resource: 'SYSTEM',
          action: 'ENTER',
        },
        grants,
      ).allowed,
    ).toBe(true);
    expect(
      authorize(
        {
          personId: 'p-pastor',
          systemId: 'sys-youth',
          resource: 'PROGRAM',
          action: 'VIEW',
        },
        grants,
      ).allowed,
    ).toBe(true);
    expect(
      authorize(
        {
          personId: 'p-pastor',
          systemId: 'sys-youth',
          resource: 'PROGRAM',
          action: 'MANAGE',
        },
        grants,
      ).allowed,
    ).toBe(false);
  });

  it('youth system admin gets SYSTEM_CONFIG without MINISTRY_FINANCE', () => {
    const grants = grantsFor('p-youth-sysadmin');
    expect(
      authorize(
        {
          personId: 'p-youth-sysadmin',
          systemId: 'sys-youth',
          resource: 'SYSTEM_CONFIG',
          action: 'MANAGE',
        },
        grants,
      ).allowed,
    ).toBe(true);
    expect(
      authorize(
        {
          personId: 'p-youth-sysadmin',
          systemId: 'sys-youth',
          resource: 'MINISTRY_FINANCE',
          action: 'VIEW',
        },
        grants,
      ).allowed,
    ).toBe(false);
  });

  it('church leader can MANAGE board; can VIEW board meetings list', () => {
    const grants = grantsFor('p-pastor');
    expect(
      authorize(
        {
          personId: 'p-pastor',
          systemId: 'sys-main',
          resource: 'BOARD',
          action: 'MANAGE',
        },
        grants,
      ).allowed,
    ).toBe(true);
  });

  it('ordained pastor cannot MANAGE programs on main (less institutional power)', () => {
    const grants = grantsFor('p-assistant');
    expect(
      authorize(
        {
          personId: 'p-assistant',
          systemId: 'sys-main',
          resource: 'PROGRAM',
          action: 'MANAGE',
        },
        grants,
      ).allowed,
    ).toBe(false);
    expect(
      authorize(
        {
          personId: 'p-assistant',
          systemId: 'sys-main',
          resource: 'PROGRAM',
          action: 'VIEW',
        },
        grants,
      ).allowed,
    ).toBe(true);
    expect(
      authorize(
        {
          personId: 'p-assistant',
          systemId: 'sys-main',
          resource: 'BOARD',
          action: 'MANAGE',
        },
        grants,
      ).allowed,
    ).toBe(false);
  });

  it('catechist can MANAGE events on main (ops) but not BOARD MANAGE', () => {
    const grants = grantsFor('p-catechist');
    expect(
      authorize(
        {
          personId: 'p-catechist',
          systemId: 'sys-main',
          resource: 'EVENT',
          action: 'MANAGE',
        },
        grants,
      ).allowed,
    ).toBe(true);
    expect(
      authorize(
        {
          personId: 'p-catechist',
          systemId: 'sys-main',
          resource: 'BOARD',
          action: 'MANAGE',
        },
        grants,
      ).allowed,
    ).toBe(false);
    expect(
      authorize(
        {
          personId: 'p-catechist',
          systemId: 'sys-main',
          resource: 'POSITION',
          action: 'MANAGE',
        },
        grants,
      ).allowed,
    ).toBe(false);
  });

  it('church leader can VIEW general fund (church-wide contributions)', () => {
    const grants = grantsFor('p-pastor');
    expect(
      authorizeFinanceFund('p-pastor', 'fund-general', 'VIEW', grants).allowed,
    ).toBe(true);
    expect(
      authorizeFinanceFund('p-pastor', 'fund-general', 'APPROVE', grants)
        .allowed,
    ).toBe(true);
  });
});

describe('leadership pack money privacy', () => {
  it('never exposes ministry vault totals', async () => {
    const { reportsService } = await import('../services/reportsService');
    const pack = reportsService.leadershipPack();
    expect(pack.money.ministryVaultBalance).toBe(0);
    expect(reportsService.leadershipCsv()).not.toContain('ministry_vaults');
  });
});

describe('choir office nav', () => {
  it('members cannot open finance; treasurer can', () => {
    expect(choirOfficeMayAccess('MEMBER', 'finance')).toBe(false);
    expect(choirOfficeMayAccess('TREASURER', 'finance')).toBe(true);
    expect(choirOfficeMayAccess('MUSIC_DIRECTOR', 'finance')).toBe(false);
  });
});

describe('ORG_PRIVATE fund vaults', () => {
  it('pastor cannot open youth vault without grant', () => {
    const grants = grantsFor('p-pastor');
    const decision = authorizeFinanceFund(
      'p-pastor',
      'fund-youth',
      'VIEW',
      grants,
    );
    expect(decision.allowed).toBe(false);
  });

  it('youth treasurer can manage youth vault', () => {
    const grants = grantsFor('p-youth-treas');
    const decision = authorizeFinanceFund(
      'p-youth-treas',
      'fund-youth',
      'MANAGE',
      grants,
    );
    expect(decision.allowed).toBe(true);
    expect(visibleFundIds('p-youth-treas', grants)).toContain('fund-youth');
  });

  it('church treasurer can manage general fund', () => {
    const grants = grantsFor('p-church-treas');
    const decision = authorizeFinanceFund(
      'p-church-treas',
      'fund-general',
      'MANAGE',
      grants,
    );
    expect(decision.allowed).toBe(true);
  });
});

describe('membership does not grant ministry finance VIEW', () => {
  it('plain membership grants lack MINISTRY_FINANCE', () => {
    // Patrick is a church member with limited grants — not a youth treasurer.
    const grants = grantsFor('p-member');
    const fin = authorize({
      personId: 'p-member',
      systemId: 'sys-youth',
      resource: 'MINISTRY_FINANCE',
      action: 'VIEW',
    }, grants);
    expect(fin.allowed).toBe(false);
  });
});
