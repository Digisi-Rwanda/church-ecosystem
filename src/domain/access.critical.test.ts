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
import { choirOfficeMayAccess } from './choirNav';
import {
  ASSIGNMENTS,
  MEMBERSHIPS,
  POSITIONS,
  SYSTEMS,
  TASKS,
} from '../data/seed';
import { getEffectiveScope } from './access';
import { rolesFromPositions } from './participation';
import type { Position, SystemId } from './types';

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

  it('ordained pastor keeps light oversight rules, but no peer system is entered any more', () => {
    expect(oversightMayAccessModule('sys-evangelism', 'tasks', 'light')).toBe(false);
  });

  it('ordained pastor is just a member in other ministries (no oversight)', () => {
    for (const sys of ['sys-youth', 'sys-choir', 'sys-deacon', 'sys-music'] as const) {
      expect(resolvePeerEntry('p-pastor-2', sys, POSITIONS).kind).toBe('member');
    }
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
    const grants = grantsFor('p-pastor-2');
    expect(
      authorize(
        {
          personId: 'p-pastor-2',
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
          personId: 'p-pastor-2',
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
          personId: 'p-pastor-2',
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
});

describe('choir office nav', () => {
  it('members cannot open the people list; president can', () => {
    expect(choirOfficeMayAccess('MEMBER', 'people')).toBe(false);
    expect(choirOfficeMayAccess('PRESIDENT', 'people')).toBe(true);
    expect(choirOfficeMayAccess('MUSIC_DIRECTOR', 'people')).toBe(false);
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


describe('main church roles — system reach', () => {
  const enterable = (personId: string) =>
    SYSTEMS.map((x) => x.id).filter(
      (sys) =>
        authorize(
          { personId, systemId: sys, resource: 'SYSTEM', action: 'ENTER' },
          grantsFor(personId),
        ).allowed,
    );

  it('Pastor enters Central only (firm walls)', () => {
    expect(enterable('p-pastor-2').sort()).toEqual(['sys-main']);
  });

  it('Pastor has no governance inside Evangelism or Youth', () => {
    const grants = grantsFor('p-pastor-2');
    expect(
      authorize(
        { personId: 'p-pastor-2', systemId: 'sys-evangelism', resource: 'PROGRAM', action: 'VIEW' },
        grants,
      ).allowed,
    ).toBe(false);
    expect(
      authorize(
        { personId: 'p-pastor-2', systemId: 'sys-youth', resource: 'PROGRAM', action: 'VIEW' },
        grants,
      ).allowed,
    ).toBe(false);
  });

  it('Church Leader enters every system', () => {
    expect(enterable('p-pastor').length).toBe(SYSTEMS.length);
  });

  it('Catechist enters Central only (firm walls)', () => {
    expect(enterable('p-catechist')).toEqual(['sys-main']);
  });

  it('no role called assistant pastor exists any more', () => {
    const roles = new Set(POSITIONS.map((p) => p.systemRole));
    expect(roles.has('ASSISTANT_PASTOR' as never)).toBe(false);
  });
});


describe('main church roles — five roles plus Member', () => {
  const officerPositions = (personId: string) =>
    POSITIONS.filter((p) => p.personId === personId);

  it('ministry officers hold no main-church role (they are plain Members)', () => {
    for (const pid of ['p-choir-leader', 'p-worship-leader', 'p-youth-leader', 'p-deacon-coord']) {
      expect(rolesFromPositions(officerPositions(pid))).toEqual([]);
      expect(getEffectiveScope([])).toBe('MEMBER');
    }
  });

  it('stale ministry role values saved in old data are ignored', () => {
    const stale = [
      { id: 'x', personId: 'p', title: 'Old', systemRole: 'CHOIR_LEADER', status: 'ACTIVE', startDate: '2020-01-01' },
      { id: 'y', personId: 'p', title: 'Old2', systemRole: 'LIMITED_STAFF', status: 'ACTIVE', startDate: '2020-01-01' },
    ] as unknown as Position[];
    expect(rolesFromPositions(stale)).toEqual([]);
  });

  it('exactly the five main-church roles are recognised', () => {
    const roles = new Set(
      rolesFromPositions(
        (['CHURCH_LEADER', 'PASTOR', 'CATECHIST', 'CHURCH_SECRETARY', 'CHURCH_TREASURER'] as const).map(
          (r, i) => ({ id: `r${i}`, personId: 'p', title: r, systemRole: r, status: 'ACTIVE', startDate: '2020-01-01' }) as Position,
        ),
      ),
    );
    expect([...roles].sort()).toEqual(['CATECHIST', 'CHURCH_LEADER', 'CHURCH_SECRETARY', 'CHURCH_TREASURER', 'PASTOR']);
  });

  it('ministry heads keep full rights inside their own ministry', () => {
    const grants = grantsFor('p-youth-leader');
    expect(
      authorize({ personId: 'p-youth-leader', systemId: 'sys-youth', resource: 'YOUTH_GROUP', action: 'MANAGE' }, grants).allowed,
    ).toBe(true);
    expect(
      authorize({ personId: 'p-youth-leader', systemId: 'sys-main', resource: 'PROGRAM', action: 'MANAGE' }, grants).allowed,
    ).toBe(false);
  });
});
