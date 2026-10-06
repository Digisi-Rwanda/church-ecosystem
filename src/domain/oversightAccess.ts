/**
 * Itorero high-leader entry into peer ministry/org systems.
 * Oversight ≠ membership / officer — same module map, reports-first depth.
 */
import { PASTOR_SYSTEM_IDS, isPastorScoped } from './governanceScope';
import type { Position, SystemId, SystemRole } from './types';
import {
  type MinistryBoardOffice,
  ministryModuleKey,
  ministryModulesForOffice,
} from './ministryNavAccess';

/** High leaders who may open peer systems in oversight (not as members). */
export const ITORERO_OVERSIGHT_ROLES: SystemRole[] = [
  'CHURCH_LEADER',
  'PASTOR',
  'CATECHIST',
];

/** Map a role to its oversight seat (Church Leader, Pastor, Catechist). */
export function canonicalOversightRole(
  role: SystemRole,
): 'CHURCH_LEADER' | 'PASTOR' | 'CATECHIST' | null {
  if (role === 'CHURCH_LEADER') return 'CHURCH_LEADER';
  if (role === 'PASTOR') return 'PASTOR';
  if (role === 'CATECHIST') return 'CATECHIST';
  return null;
}

export type OversightDepth = 'rich' | 'ops' | 'light';

export function oversightDepthForRoles(roles: SystemRole[]): OversightDepth {
  if (roles.includes('CHURCH_LEADER')) return 'rich';
  if (roles.includes('CATECHIST')) return 'ops';
  return 'light';
}

export type PeerEntryKind = 'oversight' | 'officer' | 'member';

export type PeerEntry = {
  kind: PeerEntryKind;
  /** Standing office when kind is officer; MEMBER otherwise. */
  office: MinistryBoardOffice;
};

function officeFromPosition(p: Position): string | undefined {
  return (
    p.ministryOffice ??
    p.choirOffice ??
    p.worshipOffice ??
    p.protocolOffice ??
    p.deaconOffice
  );
}

const BOARD = new Set(['PRESIDENT', 'VP', 'SECRETARY', 'TREASURER']);

/** True if person holds an Itorero high-leader mandate (or legacy grantsAllSystems). */
export function hasItoreroOversightMandate(
  positions: Position[],
  /** When given, a Pastor only counts for the systems in PASTOR_SYSTEM_IDS. */
  systemId?: SystemId,
): boolean {
  return positions.some((p) => {
    if (p.status !== 'ACTIVE') return false;
    if (isPastorScoped(p)) {
      return systemId === undefined || PASTOR_SYSTEM_IDS.includes(systemId);
    }
    return (
      (p.systemRole == null && p.grantsAllSystems === true) ||
      (p.systemRole != null && ITORERO_OVERSIGHT_ROLES.includes(p.systemRole))
    );
  });
}

/**
 * Standing office on this system only — never promotes governance to PRESIDENT.
 */
export function resolveStandingOfficeOnSystem(
  personId: string,
  systemId: SystemId,
  positions: Position[],
): MinistryBoardOffice {
  for (const p of positions) {
    if (p.personId !== personId || p.systemId !== systemId) continue;
    if (p.status !== 'ACTIVE') continue;
    const office = officeFromPosition(p);
    if (office && BOARD.has(office)) {
      return office as Exclude<MinistryBoardOffice, 'MEMBER'>;
    }
  }
  for (const p of positions) {
    if (p.personId !== personId || p.systemId !== systemId) continue;
    if (p.status !== 'ACTIVE') continue;
    const office = officeFromPosition(p);
    if (office && !BOARD.has(office) && office !== 'MEMBER') {
      return 'PRESIDENT';
    }
  }
  return 'MEMBER';
}

/**
 * How this person enters a peer system.
 * Dual hat: standing office on the system wins (officer mode).
 */
export function resolvePeerEntry(
  personId: string,
  systemId: SystemId,
  positions: Position[],
): PeerEntry {
  if (systemId === 'sys-main' || systemId === 'sys-finance') {
    return { kind: 'member', office: 'MEMBER' };
  }

  const office = resolveStandingOfficeOnSystem(personId, systemId, positions);
  if (office !== 'MEMBER') {
    return { kind: 'officer', office };
  }

  const mine = positions.filter(
    (p) => p.personId === personId && p.status === 'ACTIVE',
  );
  if (hasItoreroOversightMandate(mine, systemId)) {
    return { kind: 'oversight', office: 'MEMBER' };
  }

  return { kind: 'member', office: 'MEMBER' };
}

/** Finance-suite keys — hidden in oversight until shared / assistance. */
export const OVERSIGHT_FINANCE_HIDDEN = [
  'finance',
  'donations',
  'sponsors',
  'fundraising',
  'accounting',
  'ledger',
] as const;

const PASTOR_LIGHT_EXTRA = new Set([
  'people',
  'members',
  'families',
  'roster',
  'cases',
  'visits',
]);

/**
 * Modules an oversight visitor may open.
 * Depth: Church Leader rich · Catechist ops · Pastor light.
 */
export function oversightModulesFor(
  systemId: SystemId,
  depth: OversightDepth = 'rich',
): readonly string[] {
  if (systemId === 'sys-choir') {
    const choir = [
      'home',
      'mission',
      'people',
      'families',
      'repertoire',
      'sections',
      'rehearsals',
      'roster',
      'assets',
      'reports',
    ];
    if (depth === 'light') {
      return choir.filter(
        (k) =>
          k === 'home' ||
          k === 'mission' ||
          k === 'people' ||
          k === 'families' ||
          k === 'assets' ||
          k === 'reports',
      );
    }
    return choir;
  }

  const memberish = ministryModulesForOffice(systemId, 'MEMBER');
  const base = new Set<string>([...memberish, 'assets', 'reports']);

  const presidentish = ministryModulesForOffice(systemId, 'PRESIDENT');
  for (const key of presidentish) {
    if (
      (OVERSIGHT_FINANCE_HIDDEN as readonly string[]).includes(key) ||
      key === 'my-contributions'
    ) {
      continue;
    }
    base.add(key);
  }

  for (const k of OVERSIGHT_FINANCE_HIDDEN) base.delete(k);
  base.add('assets');
  base.add('reports');

  if (depth === 'light') {
    return [...base].filter(
      (k) =>
        k === 'home' ||
        k === 'mission' ||
        k === 'assets' ||
        k === 'reports' ||
        k === 'programs' ||
        k === 'events' ||
        PASTOR_LIGHT_EXTRA.has(k),
    );
  }

  return [...base];
}

export function oversightMayAccessModule(
  systemId: SystemId,
  moduleKey: string,
  depth: OversightDepth = 'rich',
): boolean {
  return oversightModulesFor(systemId, depth).includes(moduleKey);
}

/** Modules that render real pages in oversight; others get the reports surface. */
export function oversightPassthroughModule(moduleKey: string): boolean {
  return (
    moduleKey === 'home' ||
    moduleKey === 'mission' ||
    moduleKey === 'assets' ||
    moduleKey === 'reports'
  );
}

export function filterOversightNav<T extends { to: string; label: string }>(
  systemId: SystemId,
  basePath: string,
  nav: T[],
  depth: OversightDepth = 'rich',
): T[] {
  const allowed = new Set(oversightModulesFor(systemId, depth));
  return nav.filter((item) =>
    allowed.has(ministryModuleKey(item.to, basePath)),
  );
}
