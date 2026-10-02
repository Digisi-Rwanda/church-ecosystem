import { authorizeFinanceFund, fundGrantsToPermissions } from './financeAccess';
import {
  CHOIR_MEMBERSHIP_GRANTS,
  CHOIR_OFFICE_GRANTS,
  CHOIR_OFFICES_WITH_PEOPLE_DIRECTORY,
} from './choirAccess';
import { canonicalGovernanceRole } from './churchLeadership';
import {
  isAssignmentActive,
  isMembershipActive,
  isPositionActive,
  rolesFromPositions,
} from './participation';
import { grantMatches, isTaskActive } from './permissions';
import type {
  Assignment,
  AuthzDecision,
  AuthzRequest,
  Membership,
  PermissionGrant,
  Position,
  SystemId,
  SystemRole,
  WorkTask,
} from './types';

import { governanceSystemsFor } from './governanceScope';

const GOVERNANCE_ROLES: SystemRole[] = [
  'CHURCH_LEADER',
  'PASTOR',
  'CATECHIST',
];

function pushGrant(grants: PermissionGrant[], grant: PermissionGrant) {
  const exists = grants.some(
    (g) =>
      g.systemId === grant.systemId &&
      g.resource === grant.resource &&
      g.action === grant.action &&
      g.source === grant.source &&
      g.reason === grant.reason &&
      g.fundId === grant.fundId,
  );
  if (!exists) grants.push(grant);
}

/** Main Church grants by supremacy — Leader full; Catechist ops; Pastor lighter. */
function mainChurchGovernanceSpecs(
  role: SystemRole | undefined,
): Array<Pick<PermissionGrant, 'resource' | 'action'>> {
  const kind = canonicalGovernanceRole(role) ?? 'CHURCH_LEADER';
  const enter: Array<Pick<PermissionGrant, 'resource' | 'action'>> = [
    { resource: 'SYSTEM', action: 'ENTER' },
    { resource: 'PERSON', action: 'VIEW_FULL' },
    { resource: 'AUDIT', action: 'VIEW' },
  ];
  if (kind === 'CHURCH_LEADER') {
    return [
      ...enter,
      { resource: 'PERSON', action: 'MANAGE' },
      { resource: 'ORG_UNIT', action: 'MANAGE' },
      { resource: 'MEMBERSHIP', action: 'MANAGE' },
      { resource: 'POSITION', action: 'MANAGE' },
      { resource: 'ASSIGNMENT', action: 'MANAGE' },
      { resource: 'PROGRAM', action: 'MANAGE' },
      { resource: 'ACTIVITY', action: 'MANAGE' },
      { resource: 'EVENT', action: 'MANAGE' },
      { resource: 'TASK', action: 'MANAGE' },
      { resource: 'PROJECT', action: 'MANAGE' },
      { resource: 'CORRESPONDENCE', action: 'MANAGE' },
    ];
  }
  if (kind === 'CATECHIST') {
    // Operational command under the Leader — day-to-day mission ops, not officer appoint.
    return [
      ...enter,
      { resource: 'ORG_UNIT', action: 'VIEW' },
      { resource: 'MEMBERSHIP', action: 'MANAGE' },
      { resource: 'POSITION', action: 'VIEW' },
      { resource: 'ASSIGNMENT', action: 'MANAGE' },
      { resource: 'PROGRAM', action: 'MANAGE' },
      { resource: 'ACTIVITY', action: 'MANAGE' },
      { resource: 'EVENT', action: 'MANAGE' },
      { resource: 'TASK', action: 'MANAGE' },
      { resource: 'PROJECT', action: 'MANAGE' },
      { resource: 'CORRESPONDENCE', action: 'CREATE' },
      { resource: 'CORRESPONDENCE', action: 'UPDATE' },
    ];
  }
  // Pastor — sacraments / care visibility; less institutional power.
  return [
    ...enter,
    { resource: 'ORG_UNIT', action: 'VIEW' },
    { resource: 'MEMBERSHIP', action: 'VIEW' },
    { resource: 'POSITION', action: 'VIEW' },
    { resource: 'ASSIGNMENT', action: 'VIEW' },
    { resource: 'PROGRAM', action: 'VIEW' },
    { resource: 'ACTIVITY', action: 'VIEW' },
    { resource: 'EVENT', action: 'VIEW' },
    { resource: 'TASK', action: 'VIEW' },
    { resource: 'PROJECT', action: 'VIEW' },
    { resource: 'CORRESPONDENCE', action: 'VIEW' },
  ];
}

function grantGovernanceBundle(
  grants: PermissionGrant[],
  systemId: SystemId,
  reason: string,
  systemRole?: SystemRole,
) {
  // Main church: role-split. Peer systems: oversight VIEW only — no finance.
  if (systemId === 'sys-main') {
    for (const s of mainChurchGovernanceSpecs(systemRole)) {
      pushGrant(grants, {
        systemId,
        resource: s.resource,
        action: s.action,
        source: 'GOVERNANCE',
        reason,
      });
    }
    return;
  }

  if (systemId === 'sys-finance') {
    pushGrant(grants, {
      systemId,
      resource: 'SYSTEM',
      action: 'ENTER',
      source: 'GOVERNANCE',
      reason,
    });
    pushGrant(grants, {
      systemId,
      resource: 'AUDIT',
      action: 'VIEW',
      source: 'GOVERNANCE',
      reason,
    });
    return;
  }

  // Peer ministry / org — Itorero oversight (reports-first). No *FINANCE VIEW.
  const oversight: Array<Pick<PermissionGrant, 'resource' | 'action'>> = [
    { resource: 'SYSTEM', action: 'ENTER' },
    { resource: 'PERSON', action: 'VIEW' },
    { resource: 'ORG_UNIT', action: 'VIEW' },
    { resource: 'MEMBERSHIP', action: 'VIEW' },
    { resource: 'PROGRAM', action: 'VIEW' },
    { resource: 'ACTIVITY', action: 'VIEW' },
    { resource: 'EVENT', action: 'VIEW' },
    { resource: 'TASK', action: 'VIEW' },
    { resource: 'PROJECT', action: 'VIEW' },
    { resource: 'AUDIT', action: 'VIEW' },
    { resource: 'CHOIR_REPERTOIRE', action: 'VIEW' },
    { resource: 'CHOIR_ROSTER', action: 'VIEW' },
    { resource: 'WORSHIP_REPERTOIRE', action: 'VIEW' },
    { resource: 'WORSHIP_ROSTER', action: 'VIEW' },
    { resource: 'YOUTH_GROUP', action: 'VIEW' },
    { resource: 'PROTOCOL_ROSTER', action: 'VIEW' },
    { resource: 'PROTOCOL_SCHEDULE', action: 'VIEW' },
    { resource: 'DEACON_ROSTER', action: 'VIEW' },
    { resource: 'DEACON_CARE', action: 'VIEW' },
  ];
  for (const s of oversight) {
    pushGrant(grants, {
      systemId,
      resource: s.resource,
      action: s.action,
      source: 'GOVERNANCE',
      reason: `${reason} — peer oversight`,
    });
  }

  // Church Leader may create temporary assignments into peer systems.
  const kind = canonicalGovernanceRole(systemRole) ?? systemRole;
  if (kind === 'CHURCH_LEADER') {
    pushGrant(grants, {
      systemId,
      resource: 'ASSIGNMENT',
      action: 'MANAGE',
      source: 'GOVERNANCE',
      reason: `${reason} — assign into peer system`,
    });
  }
}

function grantMemberBaseline(
  grants: PermissionGrant[],
  systemId: SystemId,
  reason: string,
) {
  pushGrant(grants, {
    systemId,
    resource: 'SYSTEM',
    action: 'ENTER',
    source: 'MEMBERSHIP',
    reason,
  });
  // No PERSON VIEW / MINISTRY_FINANCE here — finance suites are board/treasurer only.
  for (const resource of [
    'ORG_UNIT',
    'MEMBERSHIP',
    'ASSIGNMENT',
    'PROGRAM',
    'ACTIVITY',
    'EVENT',
    'TASK',
    'PROJECT',
  ] as const) {
    pushGrant(grants, {
      systemId,
      resource,
      action: 'VIEW',
      source: 'MEMBERSHIP',
      reason,
    });
  }
}

/** Org/ministry leadership offices that may browse the People directory. */
function grantPeopleDirectoryView(
  grants: PermissionGrant[],
  reason: string,
) {
  pushGrant(grants, {
    systemId: 'sys-main',
    resource: 'PERSON',
    action: 'VIEW',
    source: 'POSITION',
    reason: `${reason} · people directory`,
  });
}

/**
 * Collect every permission grant active for this person right now.
 * Includes positions, memberships, assignments, and tasks.
 */
export function buildEffectiveAccess(
  personId: string,
  input: {
    memberships: Membership[];
    positions: Position[];
    assignments: Assignment[];
    tasks: WorkTask[];
    allSystemIds: SystemId[];
  },
  now = new Date(),
): PermissionGrant[] {
  const grants: PermissionGrant[] = [];

  pushGrant(grants, {
    systemId: 'sys-main',
    resource: 'SYSTEM',
    action: 'ENTER',
    source: 'ACCOUNT',
    reason: 'Signed-in account',
  });
  // PERSON directory is leader-only — not granted to every signed-in account.
  for (const resource of [
    'ORG_UNIT',
    'MEMBERSHIP',
    'POSITION',
    'ASSIGNMENT',
    'PROGRAM',
    'ACTIVITY',
    'EVENT',
    'TASK',
  ] as const) {
    pushGrant(grants, {
      systemId: 'sys-main',
      resource,
      action: 'VIEW',
      source: 'ACCOUNT',
      reason: 'Signed-in account',
    });
  }

  const memberships = input.memberships.filter((m) => m.personId === personId);
  const positions = input.positions.filter((p) => p.personId === personId);
  const assignments = input.assignments.filter((a) => a.personId === personId);
  const tasks = input.tasks.filter((t) => t.ownerPersonId === personId);

  for (const m of memberships) {
    if (!isMembershipActive(m, now)) continue;
    if (m.type === 'CHURCH_MEMBER') {
      grantMemberBaseline(grants, 'sys-main', m.label);
    }
    if (m.systemId) {
      grantMemberBaseline(grants, m.systemId, m.label);
      if (m.systemId === 'sys-choir') {
        for (const spec of CHOIR_MEMBERSHIP_GRANTS) {
          pushGrant(grants, {
            systemId: 'sys-choir',
            resource: spec.resource,
            action: spec.action,
            source: 'MEMBERSHIP',
            reason: m.label,
          });
        }
      }
      if (m.systemId === 'sys-worship') {
        pushGrant(grants, {
          systemId: 'sys-worship',
          resource: 'WORSHIP_REPERTOIRE',
          action: 'VIEW',
          source: 'MEMBERSHIP',
          reason: m.label,
        });
        pushGrant(grants, {
          systemId: 'sys-worship',
          resource: 'WORSHIP_ROSTER',
          action: 'VIEW',
          source: 'MEMBERSHIP',
          reason: m.label,
        });
        // WORSHIP_FINANCE is office-scoped — not membership
      }
      if (m.systemId === 'sys-deacon') {
        pushGrant(grants, {
          systemId: 'sys-deacon',
          resource: 'DEACON_ROSTER',
          action: 'VIEW',
          source: 'MEMBERSHIP',
          reason: m.label,
        });
        pushGrant(grants, {
          systemId: 'sys-deacon',
          resource: 'DEACON_CARE',
          action: 'VIEW',
          source: 'MEMBERSHIP',
          reason: m.label,
        });
        // DEACON_FINANCE is office-scoped — not membership
      }
      if (m.systemId === 'sys-youth') {
        pushGrant(grants, {
          systemId: 'sys-youth',
          resource: 'YOUTH_GROUP',
          action: 'VIEW',
          source: 'MEMBERSHIP',
          reason: m.label,
        });
      }
      if (m.systemId === 'sys-protocol') {
        pushGrant(grants, {
          systemId: 'sys-protocol',
          resource: 'PROTOCOL_ROSTER',
          action: 'VIEW',
          source: 'MEMBERSHIP',
          reason: m.label,
        });
        pushGrant(grants, {
          systemId: 'sys-protocol',
          resource: 'PROTOCOL_SCHEDULE',
          action: 'VIEW',
          source: 'MEMBERSHIP',
          reason: m.label,
        });
      }
    }
  }

  for (const p of positions) {
    if (!isPositionActive(p, now)) continue;
    // A named role decides; the legacy grantsAllSystems flag only counts when no role is set.
    const isGov = p.systemRole
      ? GOVERNANCE_ROLES.includes(p.systemRole)
      : Boolean(p.grantsAllSystems);

    if (isGov) {
      const govRole =
        p.systemRole ??
        (p.grantsAllSystems ? ('CHURCH_LEADER' as SystemRole) : undefined);
      for (const systemId of governanceSystemsFor(p, input.allSystemIds)) {
        grantGovernanceBundle(
          grants,
          systemId,
          `${p.title} (governance)`,
          govRole,
        );
      }
      if (p.systemRole === 'CHURCH_LEADER') {
        pushGrant(grants, {
          systemId: 'sys-main',
          resource: 'BOARD',
          action: 'MANAGE',
          source: 'GOVERNANCE',
          reason: `${p.title} — call Board meetings`,
        });
      }
      pushGrant(grants, {
        systemId: 'sys-main',
        resource: 'BOARD',
        action: 'VIEW',
        source: 'GOVERNANCE',
        reason: `${p.title} — Board seat`,
      });
      continue;
    }

    if (p.systemRole === 'CHURCH_SECRETARY') {
      pushGrant(grants, {
        systemId: 'sys-main',
        resource: 'CORRESPONDENCE',
        action: 'MANAGE',
        source: 'POSITION',
        reason: `${p.title} — letters desk`,
      });
      pushGrant(grants, {
        systemId: 'sys-main',
        resource: 'PERSON',
        action: 'VIEW_FULL',
        source: 'POSITION',
        reason: `${p.title} — prepare member letters`,
      });
      grantPeopleDirectoryView(grants, p.title);
    }

    if (p.systemId) {
      pushGrant(grants, {
        systemId: p.systemId,
        resource: 'SYSTEM',
        action: 'ENTER',
        source: 'POSITION',
        reason: p.title,
      });

      if (p.systemAdmin) {
        pushGrant(grants, {
          systemId: p.systemId,
          resource: 'SYSTEM_CONFIG',
          action: 'MANAGE',
          source: 'POSITION',
          reason: `${p.title} — system admin`,
        });
        pushGrant(grants, {
          systemId: p.systemId,
          resource: 'MEMBERSHIP',
          action: 'VIEW',
          source: 'POSITION',
          reason: `${p.title} — system admin`,
        });
        pushGrant(grants, {
          systemId: p.systemId,
          resource: 'POSITION',
          action: 'VIEW',
          source: 'POSITION',
          reason: `${p.title} — system admin`,
        });
      }

      // Choir offices get mission scope from CHOIR_OFFICE_GRANTS — not a blanket MANAGE.
      const choirScoped = p.systemId === 'sys-choir' && p.choirOffice;
      const office =
        p.ministryOffice ??
        p.choirOffice ??
        p.worshipOffice ??
        p.protocolOffice ??
        p.deaconOffice;
      const adminOnly = p.systemAdmin === true && !office && !p.systemRole;
      if (!choirScoped && !adminOnly) {
        for (const resource of [
          'PROGRAM',
          'ACTIVITY',
          'EVENT',
          'TASK',
          'PROJECT',
        ] as const) {
          pushGrant(grants, {
            systemId: p.systemId,
            resource,
            action: 'MANAGE',
            source: 'POSITION',
            reason: p.title,
          });
        }
      }
    }

    if (p.systemRole === 'CHURCH_TREASURER') {
      pushGrant(grants, {
        systemId: 'sys-main',
        resource: 'SYSTEM',
        action: 'ENTER',
        source: 'POSITION',
        reason: p.title,
      });
      pushGrant(grants, {
        systemId: 'sys-main',
        resource: 'AUDIT',
        action: 'VIEW',
        source: 'POSITION',
        reason: `${p.title} — treasury audit`,
      });
      // Church treasury is a Main module; vault ops still need FundAccessGrant.
    }

    // Mission board leaders: President / VP / Secretary / Treasurer
    {
      const office =
        p.ministryOffice ??
        p.choirOffice ??
        p.worshipOffice ??
        p.protocolOffice ??
        p.deaconOffice;
      const leaderOffices = ['PRESIDENT', 'VP', 'SECRETARY', 'TREASURER'];
      if (
        p.systemId &&
        office &&
        leaderOffices.includes(office) &&
        !isGov
      ) {
        for (const resource of [
          'PROGRAM',
          'ACTIVITY',
          'EVENT',
          'TASK',
          'PROJECT',
          'ASSIGNMENT',
        ] as const) {
          pushGrant(grants, {
            systemId: p.systemId,
            resource,
            action: 'MANAGE',
            source: 'POSITION',
            reason: `${p.title} · mission board`,
          });
        }
        if (
          office === 'PRESIDENT' ||
          office === 'VP' ||
          office === 'SECRETARY'
        ) {
          grantPeopleDirectoryView(grants, p.title);
        }
        if (office === 'TREASURER') {
          pushGrant(grants, {
            systemId: p.systemId,
            resource: 'MINISTRY_FINANCE',
            action: 'MANAGE',
            source: 'POSITION',
            reason: `${p.title} · ministry finance`,
          });
        } else if (office === 'PRESIDENT' || office === 'VP') {
          // Oversight view only — full money suite (donations/accounting) is treasurer.
          pushGrant(grants, {
            systemId: p.systemId,
            resource: 'MINISTRY_FINANCE',
            action: 'VIEW',
            source: 'POSITION',
            reason: `${p.title} · ministry finance view`,
          });
          pushGrant(grants, {
            systemId: 'sys-main',
            resource: 'BOARD',
            action: 'VIEW',
            source: 'POSITION',
            reason: `${p.title} — Board seat`,
          });
        }
      }
    }

    // Choir leadership is granted only via choirOffice matrix (choirAccess.ts).
    // Ministry heads are identified by their office in that system, never by a main-church role.

    if (p.systemId === 'sys-choir' && p.choirOffice) {
      const office = p.choirOffice;
      const reason =
        office === 'ADVISOR' && p.choirAdvisorRole
          ? `${p.title} · ${p.choirAdvisorRole}`
          : p.title;

      for (const spec of CHOIR_OFFICE_GRANTS[office]) {
        pushGrant(grants, {
          systemId: 'sys-choir',
          resource: spec.resource,
          action: spec.action,
          source: 'POSITION',
          reason,
        });
      }

      if (CHOIR_OFFICES_WITH_PEOPLE_DIRECTORY.includes(office)) {
        grantPeopleDirectoryView(grants, reason);
      }
    }

    if (
      p.systemId === 'sys-worship' &&
      (p.worshipOffice === 'MUSIC_DIRECTOR' ||
        p.worshipOffice === 'PRESIDENT' ||
        p.ministryOffice === 'PRESIDENT')
    ) {
      pushGrant(grants, {
        systemId: 'sys-worship',
        resource: 'WORSHIP_REPERTOIRE',
        action: 'MANAGE',
        source: 'POSITION',
        reason: p.title,
      });
      pushGrant(grants, {
        systemId: 'sys-worship',
        resource: 'WORSHIP_ROSTER',
        action: 'MANAGE',
        source: 'POSITION',
        reason: p.title,
      });
      pushGrant(grants, {
        systemId: 'sys-worship',
        resource: 'MEMBERSHIP',
        action: 'MANAGE',
        source: 'POSITION',
        reason: p.title,
      });
      pushGrant(grants, {
        systemId: 'sys-worship',
        resource: 'ASSIGNMENT',
        action: 'MANAGE',
        source: 'POSITION',
        reason: p.title,
      });
      pushGrant(grants, {
        systemId: 'sys-main',
        resource: 'PERSON',
        action: 'VIEW',
        source: 'POSITION',
        reason: p.title,
      });
    }

    if (p.systemId === 'sys-worship' && p.worshipOffice) {
      const office = p.worshipOffice;
      pushGrant(grants, {
        systemId: 'sys-worship',
        resource: 'SYSTEM',
        action: 'ENTER',
        source: 'POSITION',
        reason: p.title,
      });
      pushGrant(grants, {
        systemId: 'sys-worship',
        resource: 'WORSHIP_ROSTER',
        action: 'VIEW',
        source: 'POSITION',
        reason: p.title,
      });
      // Finance is board/ops leadership only — not every worship office.
      if (
        office === 'TREASURER' ||
        office === 'ADMIN' ||
        office === 'PRESIDENT' ||
        office === 'VP' ||
        office === 'COORDINATOR' ||
        office === 'MUSIC_DIRECTOR' ||
        office === 'FAMILY_LEADER' ||
        office === 'FAMILY_VICE'
      ) {
        pushGrant(grants, {
          systemId: 'sys-worship',
          resource: 'WORSHIP_FINANCE',
          action: 'VIEW',
          source: 'POSITION',
          reason: p.title,
        });
      }
      if (
        office === 'TREASURER' ||
        office === 'ADMIN' ||
        office === 'COORDINATOR'
      ) {
        pushGrant(grants, {
          systemId: 'sys-worship',
          resource: 'WORSHIP_FINANCE',
          action: 'MANAGE',
          source: 'POSITION',
          reason: p.title,
        });
        pushGrant(grants, {
          systemId: 'sys-worship',
          resource: 'WORSHIP_FINANCE',
          action: 'APPROVE',
          source: 'POSITION',
          reason: p.title,
        });
      }
      if (
        office === 'ADMIN' ||
        office === 'PRESIDENT' ||
        office === 'COORDINATOR' ||
        office === 'SECRETARY'
      ) {
        grantPeopleDirectoryView(grants, p.title);
      }
    }

    if (
      p.systemId === 'sys-deacon' &&
      (p.deaconOffice === 'COORDINATOR' || p.ministryOffice === 'PRESIDENT')
    ) {
      pushGrant(grants, {
        systemId: 'sys-deacon',
        resource: 'DEACON_ROSTER',
        action: 'MANAGE',
        source: 'POSITION',
        reason: p.title,
      });
      pushGrant(grants, {
        systemId: 'sys-deacon',
        resource: 'DEACON_CARE',
        action: 'MANAGE',
        source: 'POSITION',
        reason: p.title,
      });
      pushGrant(grants, {
        systemId: 'sys-deacon',
        resource: 'MEMBERSHIP',
        action: 'MANAGE',
        source: 'POSITION',
        reason: p.title,
      });
      pushGrant(grants, {
        systemId: 'sys-main',
        resource: 'PERSON',
        action: 'VIEW',
        source: 'POSITION',
        reason: p.title,
      });
    }

    if (p.systemId === 'sys-deacon' && p.deaconOffice) {
      const office = p.deaconOffice;
      pushGrant(grants, {
        systemId: 'sys-deacon',
        resource: 'SYSTEM',
        action: 'ENTER',
        source: 'POSITION',
        reason: p.title,
      });
      pushGrant(grants, {
        systemId: 'sys-deacon',
        resource: 'DEACON_ROSTER',
        action: 'VIEW',
        source: 'POSITION',
        reason: p.title,
      });
      pushGrant(grants, {
        systemId: 'sys-deacon',
        resource: 'DEACON_CARE',
        action: 'VIEW',
        source: 'POSITION',
        reason: p.title,
      });
      if (
        office === 'TREASURER' ||
        office === 'COORDINATOR' ||
        office === 'PRESIDENT'
      ) {
        pushGrant(grants, {
          systemId: 'sys-deacon',
          resource: 'DEACON_FINANCE',
          action: 'VIEW',
          source: 'POSITION',
          reason: p.title,
        });
      }

      if (
        office === 'TREASURER' ||
        office === 'COORDINATOR'
      ) {
        pushGrant(grants, {
          systemId: 'sys-deacon',
          resource: 'DEACON_FINANCE',
          action: 'MANAGE',
          source: 'POSITION',
          reason: p.title,
        });
        pushGrant(grants, {
          systemId: 'sys-deacon',
          resource: 'DEACON_FINANCE',
          action: 'APPROVE',
          source: 'POSITION',
          reason: p.title,
        });
      }
      if (office === 'COORDINATOR' || office === 'PRESIDENT') {
        pushGrant(grants, {
          systemId: 'sys-deacon',
          resource: 'DEACON_CARE',
          action: 'MANAGE',
          source: 'POSITION',
          reason: p.title,
        });
        pushGrant(grants, {
          systemId: 'sys-deacon',
          resource: 'DEACON_ROSTER',
          action: 'MANAGE',
          source: 'POSITION',
          reason: p.title,
        });
        pushGrant(grants, {
          systemId: 'sys-deacon',
          resource: 'ASSIGNMENT',
          action: 'MANAGE',
          source: 'POSITION',
          reason: `${p.title} · assign within Deacon`,
        });
        grantPeopleDirectoryView(grants, p.title);
      }
    }

    if (p.systemId === 'sys-youth' && p.ministryOffice === 'PRESIDENT') {
      pushGrant(grants, {
        systemId: 'sys-youth',
        resource: 'YOUTH_GROUP',
        action: 'MANAGE',
        source: 'POSITION',
        reason: p.title,
      });
      pushGrant(grants, {
        systemId: 'sys-youth',
        resource: 'MEMBERSHIP',
        action: 'MANAGE',
        source: 'POSITION',
        reason: p.title,
      });
      pushGrant(grants, {
        systemId: 'sys-youth',
        resource: 'ASSIGNMENT',
        action: 'MANAGE',
        source: 'POSITION',
        reason: p.title,
      });
      pushGrant(grants, {
        systemId: 'sys-main',
        resource: 'PERSON',
        action: 'VIEW',
        source: 'POSITION',
        reason: p.title,
      });
    }

    if (p.systemId === 'sys-protocol' && p.protocolOffice) {
      const office = p.protocolOffice;
      pushGrant(grants, {
        systemId: 'sys-protocol',
        resource: 'SYSTEM',
        action: 'ENTER',
        source: 'POSITION',
        reason: p.title,
      });
      pushGrant(grants, {
        systemId: 'sys-protocol',
        resource: 'PROTOCOL_ROSTER',
        action: 'VIEW',
        source: 'POSITION',
        reason: p.title,
      });
      pushGrant(grants, {
        systemId: 'sys-protocol',
        resource: 'PROTOCOL_SCHEDULE',
        action: 'VIEW',
        source: 'POSITION',
        reason: p.title,
      });

      if (office === 'COORDINATOR') {
        pushGrant(grants, {
          systemId: 'sys-protocol',
          resource: 'PROTOCOL_ROSTER',
          action: 'MANAGE',
          source: 'POSITION',
          reason: p.title,
        });
        pushGrant(grants, {
          systemId: 'sys-protocol',
          resource: 'PROTOCOL_SCHEDULE',
          action: 'MANAGE',
          source: 'POSITION',
          reason: p.title,
        });
        pushGrant(grants, {
          systemId: 'sys-protocol',
          resource: 'MEMBERSHIP',
          action: 'MANAGE',
          source: 'POSITION',
          reason: p.title,
        });
        pushGrant(grants, {
          systemId: 'sys-protocol',
          resource: 'ASSIGNMENT',
          action: 'MANAGE',
          source: 'POSITION',
          reason: `${p.title} · assign within Protocol`,
        });
        grantPeopleDirectoryView(grants, p.title);
      }
      if (office === 'SECRETARY') {
        pushGrant(grants, {
          systemId: 'sys-protocol',
          resource: 'PROTOCOL_ROSTER',
          action: 'MANAGE',
          source: 'POSITION',
          reason: p.title,
        });
        pushGrant(grants, {
          systemId: 'sys-protocol',
          resource: 'PROTOCOL_SCHEDULE',
          action: 'RECORD_ATTENDANCE',
          source: 'POSITION',
          reason: p.title,
        });
        pushGrant(grants, {
          systemId: 'sys-protocol',
          resource: 'MEMBERSHIP',
          action: 'MANAGE',
          source: 'POSITION',
          reason: p.title,
        });
        grantPeopleDirectoryView(grants, p.title);
      }
      if (office === 'PRESIDENT' || office === 'VP') {
        pushGrant(grants, {
          systemId: 'sys-protocol',
          resource: 'PROTOCOL_SCHEDULE',
          action: 'APPROVE',
          source: 'POSITION',
          reason: `${p.title} · review & publish month`,
        });
        grantPeopleDirectoryView(grants, p.title);
      }
      // Treasurer: schedule VIEW only (already granted); fund via FundAccessGrant
    }
  }

  for (const a of assignments) {
    if (!isAssignmentActive(a, now) || !a.systemId) continue;
    pushGrant(grants, {
      systemId: a.systemId,
      resource: 'SYSTEM',
      action: 'ENTER',
      source: 'ASSIGNMENT',
      reason: `${a.title} · ${a.contextLabel}`,
    });
    pushGrant(grants, {
      systemId: a.systemId,
      resource: 'ASSIGNMENT',
      action: 'VIEW',
      source: 'ASSIGNMENT',
      reason: `${a.title} · ${a.contextLabel}`,
    });
    pushGrant(grants, {
      systemId: a.systemId,
      resource: 'EVENT',
      action: 'VIEW',
      source: 'ASSIGNMENT',
      reason: `${a.title} · ${a.contextLabel}`,
    });
    pushGrant(grants, {
      systemId: a.systemId,
      resource: 'TASK',
      action: 'UPDATE',
      source: 'ASSIGNMENT',
      reason: `${a.title} · ${a.contextLabel}`,
    });
    if (a.systemId === 'sys-choir') {
      pushGrant(grants, {
        systemId: 'sys-choir',
        resource: 'CHOIR_ROSTER',
        action: 'UPDATE',
        source: 'ASSIGNMENT',
        reason: `${a.title} · ${a.contextLabel}`,
      });
    }
    if (a.systemId === 'sys-youth') {
      pushGrant(grants, {
        systemId: 'sys-youth',
        resource: 'YOUTH_GROUP',
        action: 'UPDATE',
        source: 'ASSIGNMENT',
        reason: `${a.title} · ${a.contextLabel}`,
      });
    }
  }

  for (const t of tasks) {
    if (!isTaskActive(t, now)) continue;
    pushGrant(grants, {
      systemId: t.systemId ?? 'sys-main',
      resource: 'TASK',
      action: 'UPDATE',
      source: 'TASK',
      reason: t.title,
    });
    if (t.grantsSystemAccess && t.systemId) {
      pushGrant(grants, {
        systemId: t.systemId,
        resource: 'SYSTEM',
        action: 'ENTER',
        source: 'TASK',
        reason: `Task: ${t.title}`,
      });
      pushGrant(grants, {
        systemId: t.systemId,
        resource: 'EVENT',
        action: 'VIEW',
        source: 'TASK',
        reason: `Task: ${t.title}`,
      });
    }
  }

  // ORG_PRIVATE finance: only explicit fund grants — never governance.
  for (const g of fundGrantsToPermissions(personId, now)) {
    pushGrant(grants, g);
  }

  return grants;
}

export function grantsForSystem(
  grants: PermissionGrant[],
  systemId: SystemId,
): PermissionGrant[] {
  return grants.filter((g) => g.systemId === systemId);
}

/**
 * authorize(person, system, resource, action, now)
 * Same function for direct ministry login and church → ministry SSO.
 */
export function authorize(
  request: AuthzRequest,
  grants: PermissionGrant[],
): AuthzDecision {
  const now = request.now ?? new Date();
  const evaluatedAt = now.toISOString();

  if (request.resource === 'FINANCE' && request.fundId) {
    return authorizeFinanceFund(
      request.personId,
      request.fundId,
      request.action,
      grants,
      now,
    );
  }

  const matched = grants.find((g) =>
    grantMatches(
      g,
      request.systemId,
      request.resource,
      request.action,
      request.fundId,
    ),
  );

  if (matched) {
    return {
      allowed: true,
      personId: request.personId,
      systemId: request.systemId,
      resource: request.resource,
      action: request.action,
      fundId: request.fundId,
      matchedGrant: matched,
      reason: matched.reason,
      evaluatedAt,
    };
  }

  const privateDenied =
    request.resource === 'FINANCE'
      ? 'ORG_PRIVATE finance — no fund grant from the owning organization (pastor cannot bypass)'
      : 'No matching permission grant for this context';

  return {
    allowed: false,
    personId: request.personId,
    systemId: request.systemId,
    resource: request.resource,
    action: request.action,
    fundId: request.fundId,
    reason: privateDenied,
    evaluatedAt,
  };
}

export function effectiveRolesFromGrantsContext(
  positions: Position[],
  now = new Date(),
): SystemRole[] {
  return rolesFromPositions(positions, now);
}
