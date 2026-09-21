import type {
  AccessScope,
  ChurchSystem,
  SystemEntitlement,
  SystemId,
  SystemRole,
} from './types';
import { personCanEnterSystem } from './participation';

/** Stage 1 coarse scopes — still useful for profile section filters. */
const ROLE_SCOPE: Record<SystemRole, AccessScope> = {
  CHURCH_LEADER: 'FULL',
  PASTOR: 'FULL',
  ASSISTANT_PASTOR: 'FULL',
  CATECHIST: 'FULL',
  CHURCH_SECRETARY: 'FULL',
  CHURCH_TREASURER: 'FINANCE',
  CHOIR_LEADER: 'CHOIR',
  WORSHIP_LEADER: 'WORSHIP',
  YOUTH_LEADER: 'YOUTH',
  PROTOCOL_LEADER: 'PROTOCOL',
  DEACON_LEADER: 'DEACON',
  LIMITED_STAFF: 'LIMITED',
};

export function getEffectiveScope(roles: SystemRole[]): AccessScope {
  if (roles.some((r) => ROLE_SCOPE[r] === 'FULL')) return 'FULL';
  if (roles.includes('CHURCH_TREASURER')) return 'FINANCE';
  if (roles.includes('CHOIR_LEADER')) return 'CHOIR';
  if (roles.includes('WORSHIP_LEADER')) return 'WORSHIP';
  if (roles.includes('YOUTH_LEADER')) return 'YOUTH';
  if (roles.includes('PROTOCOL_LEADER')) return 'PROTOCOL';
  if (roles.includes('DEACON_LEADER')) return 'DEACON';
  return 'LIMITED';
}

const PASTORAL_360 = [
  'employment',
  'education',
  'talents',
  'gifts',
] as const;

export function allowedProfileSections(scope: AccessScope): string[] {
  const common = ['overview', 'personal', 'contact', 'account'];
  if (scope === 'FULL') {
    return [
      'overview',
      'personal',
      'contact',
      'family',
      'membership',
      'baptism',
      'marriage',
      'certificates',
      'documents',
      'teams',
      'history',
      ...PASTORAL_360,
      'account',
    ];
  }
  if (scope === 'CHOIR' || scope === 'WORSHIP' || scope === 'YOUTH') {
    return [...common, 'teams'];
  }
  if (scope === 'PROTOCOL') {
    return [...common, 'teams'];
  }
  if (scope === 'DEACON') {
    return [...common, 'teams', 'family'];
  }
  if (scope === 'FINANCE') {
    return [...common, 'membership'];
  }
  return common;
}

/** Own 360° profile — what a member may see about themselves. */
export function allowedOwnProfileSections(): string[] {
  return [
    'overview',
    'personal',
    'contact',
    'family',
    'membership',
    'baptism',
    'marriage',
    'certificates',
    'documents',
    'teams',
    'history',
    ...PASTORAL_360,
    'account',
  ];
}

export function roleLabel(role: SystemRole): string {
  const map: Record<SystemRole, string> = {
    CHURCH_LEADER: 'Church Leader',
    PASTOR: 'Pastor',
    ASSISTANT_PASTOR: 'Pastor',
    CATECHIST: 'Catechist (Umwarimu)',
    CHURCH_SECRETARY: 'Church Secretary',
    CHURCH_TREASURER: 'Church Treasurer',
    CHOIR_LEADER: 'Choir Leader',
    WORSHIP_LEADER: 'Worship Leader',
    YOUTH_LEADER: 'Youth Leader',
    PROTOCOL_LEADER: 'Protocol Leader',
    DEACON_LEADER: 'Deacon Leader',
    LIMITED_STAFF: 'Limited Staff',
  };
  return map[role];
}

export function canEnterSystem(
  entitlements: SystemEntitlement[],
  systemId: SystemId,
): boolean {
  if (systemId === 'sys-main') return true;
  return personCanEnterSystem(entitlements, systemId);
}

export function entitledSystems(
  entitlements: SystemEntitlement[],
  all: ChurchSystem[],
): ChurchSystem[] {
  const ids = new Set(entitlements.map((e) => e.systemId));
  ids.add('sys-main');
  return all.filter((s) => s.status === 'ACTIVE' && ids.has(s.id));
}

export function membershipTypeLabel(type: string): string {
  const map: Record<string, string> = {
    CHURCH_MEMBER: 'Church member',
    CHOIR_MEMBER: 'Choir member',
    WORSHIP_MEMBER: 'Worship team member',
    YOUTH_MEMBER: 'Youth member',
    PROTOCOL_MEMBER: 'Protocol member',
    DEACON_MEMBER: 'Deacon team member',
    MEDIA_MEMBER: 'Media member',
    MUSIC_MEMBER: 'Music ministry member',
    MEN_MEMBER: 'Men ministry member',
    WOMEN_MEMBER: 'Women ministry member',
    COUPLES_MEMBER: 'Couples ministry member',
    CHILDREN_MEMBER: 'Children ministry member',
    ELDERLY_MEMBER: 'Elderly ministry member',
    EVANGELISM_MEMBER: 'Evangelism ministry member',
    INTERCESSORS_MEMBER: 'Intercessors ministry member',
  };
  return map[type] ?? type;
}
