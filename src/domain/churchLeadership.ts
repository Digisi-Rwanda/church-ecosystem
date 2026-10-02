/**
 * Itorero high-leader supremacy (product):
 * Church Leader — authority & oversight
 * Pastor(s) — ordained / sacraments (same holy clearance; less institutional power)
 * Catechist — operational command under the Leader
 */
import type { SystemRole } from './types';

export function isChurchLeader(roles: SystemRole[]): boolean {
  return roles.includes('CHURCH_LEADER');
}

export function isOrdainedPastor(roles: SystemRole[]): boolean {
  return roles.includes('PASTOR');
}

export function isCatechist(roles: SystemRole[]): boolean {
  return roles.includes('CATECHIST');
}

/** Any of the three Itorero high seats (oversight entry, Board VIEW). */
export function isItoreroHighLeader(roles: SystemRole[]): boolean {
  return (
    isChurchLeader(roles) || isOrdainedPastor(roles) || isCatechist(roles)
  );
}

export function canonicalGovernanceRole(
  role: SystemRole | undefined | null,
): 'CHURCH_LEADER' | 'PASTOR' | 'CATECHIST' | null {
  if (!role) return null;
  if (role === 'CHURCH_LEADER') return 'CHURCH_LEADER';
  if (role === 'PASTOR') return 'PASTOR';
  if (role === 'CATECHIST') return 'CATECHIST';
  return null;
}
