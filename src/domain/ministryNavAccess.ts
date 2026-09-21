/**
 * Ministry module access — members must not see leadership/finance suites.
 * Board offices: PRESIDENT | VP | TREASURER | SECRETARY (shared across ministries).
 * Choir keeps its richer choirAccess matrix; this covers other ministry systems.
 */
import type {
  MissionLeaderOffice,
  Position,
  SystemId,
} from './types';
import { MISSION_LEADER_OFFICES } from './missionScope';

export type MinistryBoardOffice = MissionLeaderOffice | 'MEMBER';

const BOARD = new Set<string>(MISSION_LEADER_OFFICES);

/** Path segment → module key (last meaningful segment under /systems/:slug/...). */
export function ministryModuleKey(to: string, basePath: string): string {
  const base = basePath.replace(/\/$/, '');
  let rel = to.startsWith(base) ? to.slice(base.length) : to;
  rel = rel.replace(/^\//, '');
  if (!rel) return 'home';
  return rel.split('/')[0] ?? 'home';
}

function officeFromPosition(p: Position): string | undefined {
  return (
    p.ministryOffice ??
    p.choirOffice ??
    p.worshipOffice ??
    p.protocolOffice ??
    p.deaconOffice
  );
}

/** Resolve standing board office for this system, else MEMBER.
 *  Church governance is NOT promoted to PRESIDENT — use resolvePeerEntry() for oversight. */
export function resolveMinistryBoardOffice(
  personId: string,
  systemId: SystemId,
  positions: Position[],
): MinistryBoardOffice {
  for (const p of positions) {
    if (p.personId !== personId || p.systemId !== systemId) continue;
    if (p.status !== 'ACTIVE') continue;
    const office = officeFromPosition(p);
    if (office && BOARD.has(office)) {
      return office as MissionLeaderOffice;
    }
  }
  // Domain ops offices (music director, coordinator, …) are not plain members —
  // treat as PRESIDENT-level module access unless system has its own matrix (Choir).
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

const MEMBER_DEFAULT = [
  'home',
  'mission',
  'programs',
  'events',
  'tasks',
  'projects',
  'my-contributions',
] as const;

const MEMBER_MUSIC = [
  'home',
  'mission',
  'schedule',
  'schedule-published',
  'schedule-inbox',
  'programs',
  'events',
  'tasks',
  'projects',
  'my-contributions',
] as const;

const MEMBER_WORSHIP = [
  'home',
  'mission',
  'repertoire',
  'sections',
  'rehearsals',
  'roster',
  'my-contributions',
] as const;

const MEMBER_PROTOCOL = [
  'home',
  'mission',
  'mine',
  'attendance',
  'inbox',
  'faithful',
] as const;

const MEMBER_DEACON = ['home', 'mission', 'my-contributions'] as const;

const FINANCE_SUITE = [
  'finance',
  'donations',
  'sponsors',
  'fundraising',
  'accounting',
  'assets',
  'reports',
  'ledger',
] as const;

/** Oversight view — no donations/sponsors/fundraising (treasurer money intake). */
const PRESIDENT_FINANCE_VIEW = [
  'finance',
  'accounting',
  'assets',
  'reports',
  'ledger',
] as const;

const PEER_OPS = [
  'home',
  'mission',
  'programs',
  'events',
  'tasks',
  'projects',
  'my-contributions',
] as const;

function memberModulesFor(systemId: SystemId): readonly string[] {
  if (systemId === 'sys-worship') return MEMBER_WORSHIP;
  if (systemId === 'sys-protocol') return MEMBER_PROTOCOL;
  if (systemId === 'sys-deacon') return MEMBER_DEACON;
  if (systemId === 'sys-music') return MEMBER_MUSIC;
  if (systemId === 'sys-youth') return MEMBER_DEFAULT;
  return MEMBER_DEFAULT; // peer-core kit
}

function boardModulesFor(
  systemId: SystemId,
  office: MissionLeaderOffice,
): readonly string[] {
  // Handle before TREASURER/SECRETARY early returns so office comparisons stay valid.
  if (systemId === 'sys-music') {
    if (office === 'TREASURER') {
      return ['home', 'mission', 'my-contributions', ...FINANCE_SUITE];
    }
    if (office === 'SECRETARY') {
      return [
        ...PEER_OPS,
        'schedule',
        'schedule-drafts',
        'schedule-published',
        'schedule-inbox',
      ];
    }
    return [
      ...PEER_OPS,
      'schedule',
      'schedule-drafts',
      'schedule-published',
      'schedule-inbox',
      ...PRESIDENT_FINANCE_VIEW,
    ];
  }

  if (office === 'TREASURER') {
    if (systemId === 'sys-protocol') {
      return ['home', 'mission', 'mine', 'finance', 'reports', 'my-contributions', 'faithful'];
    }
    if (systemId === 'sys-deacon') {
      return ['home', 'mission', 'my-contributions', 'finance'];
    }
    if (systemId === 'sys-worship') {
      return [
        'home',
        'mission',
        'my-contributions',
        ...FINANCE_SUITE,
      ];
    }
    return ['home', 'mission', 'my-contributions', ...FINANCE_SUITE];
  }

  if (office === 'SECRETARY') {
    if (systemId === 'sys-worship') {
      return [
        'home',
        'mission',
        'people',
        'families',
        'repertoire',
        'sections',
        'rehearsals',
        'roster',
        'my-contributions',
      ];
    }
    if (systemId === 'sys-protocol') {
      return [
        'home',
        'mission',
        'members',
        'calendar',
        'teams',
        'review',
        'attendance',
        'faithful',
        'mine',
        'inbox',
        'export',
        'history',
      ];
    }
    if (systemId === 'sys-deacon') {
      return ['home', 'mission', 'roster', 'cases', 'visits', 'my-contributions'];
    }
    return [...PEER_OPS];
  }

  // PRESIDENT / VP — operational breadth + finance oversight (view)
  if (systemId === 'sys-worship') {
    return [
      'home',
      'mission',
      'people',
      'families',
      'repertoire',
      'sections',
      'rehearsals',
      'roster',
      'my-contributions',
      ...PRESIDENT_FINANCE_VIEW,
    ];
  }
  if (systemId === 'sys-protocol') {
    return [
      'home',
      'mission',
      'members',
      'calendar',
      'teams',
      'review',
      'attendance',
      'faithful',
      'mine',
      'finance',
      'reports',
      'inbox',
      'export',
      'history',
    ];
  }
  if (systemId === 'sys-deacon') {
    return [
      'home',
      'mission',
      'roster',
      'cases',
      'visits',
      'my-contributions',
      'finance',
    ];
  }
  // Youth + peer kit — board ops; intake suites stay treasurer-only
  if (office === 'PRESIDENT' || office === 'VP') {
    return [...PEER_OPS, ...PRESIDENT_FINANCE_VIEW];
  }
  return [...PEER_OPS, ...FINANCE_SUITE];
}

export function ministryModulesForOffice(
  systemId: SystemId,
  office: MinistryBoardOffice,
): readonly string[] {
  if (systemId === 'sys-choir') {
    // Choir uses choirAccess — callers should not use this path for choir.
    return memberModulesFor(systemId);
  }
  if (office === 'MEMBER') return memberModulesFor(systemId);
  return boardModulesFor(systemId, office);
}

export function ministryOfficeMayAccessModule(
  systemId: SystemId,
  office: MinistryBoardOffice,
  moduleKey: string,
): boolean {
  return ministryModulesForOffice(systemId, office).includes(moduleKey);
}

export function filterMinistryNav<T extends { to: string; label: string }>(
  systemId: SystemId,
  basePath: string,
  nav: T[],
  office: MinistryBoardOffice,
): T[] {
  const allowed = new Set(ministryModulesForOffice(systemId, office));
  return nav.filter((item) =>
    allowed.has(ministryModuleKey(item.to, basePath)),
  );
}
