import { describe, expect, it } from 'vitest';
import { authorize, buildEffectiveAccess } from './authorize';
import {
  ASSIGNMENTS,
  MEMBERSHIPS,
  POSITIONS,
  SYSTEMS,
  TASKS,
} from '../data/seed';
import {
  PROTOCOL_COORDINATOR_PERSON_ID,
  PROTOCOL_PRESIDENT_PERSON_ID,
} from '../data/protocolMembersSeed';
import { ministryOfficeMayAccessModule } from './ministryNavAccess';
import type { SystemId } from './types';

function can(personId: string, action: 'VIEW' | 'MANAGE' | 'APPROVE') {
  const grants = buildEffectiveAccess(personId, {
    memberships: MEMBERSHIPS,
    positions: POSITIONS,
    assignments: ASSIGNMENTS,
    tasks: TASKS,
    allSystemIds: SYSTEMS.map((s) => s.id) as SystemId[],
  });
  return authorize(
    { personId, systemId: 'sys-protocol', resource: 'PROTOCOL_SCHEDULE', action },
    grants,
  ).allowed;
}

describe('Protocol schedule access: build vs review', () => {
  it('Coordinator builds (MANAGE)', () => {
    expect(can(PROTOCOL_COORDINATOR_PERSON_ID, 'VIEW')).toBe(true);
    expect(can(PROTOCOL_COORDINATOR_PERSON_ID, 'MANAGE')).toBe(true);
    // NB: the engine treats MANAGE as implying APPROVE, so the review/publish
    // split is enforced by protocolService (office checks), not by grants.
  });

  it('President approves but does not build', () => {
    for (const id of [PROTOCOL_PRESIDENT_PERSON_ID]) {
      expect(can(id, 'VIEW')).toBe(true);
      expect(can(id, 'APPROVE')).toBe(true);
      expect(can(id, 'MANAGE')).toBe(false);
    }
  });

  it('church-level leaders do not approve or manage the Protocol schedule', () => {
    expect(can('p-pastor', 'APPROVE')).toBe(false);
    expect(can('p-pastor', 'MANAGE')).toBe(false);
  });

  it('President and VP can open the review and teams modules', () => {
    expect(ministryOfficeMayAccessModule('sys-protocol', 'PRESIDENT', 'review')).toBe(true);
    expect(ministryOfficeMayAccessModule('sys-protocol', 'VP', 'teams')).toBe(true);
  });

  it('the Coordinator-level offices can open Availability and the Music schedule feed', () => {
    for (const office of ['PRESIDENT', 'VP', 'SECRETARY'] as const) {
      expect(ministryOfficeMayAccessModule('sys-protocol', office, 'availability')).toBe(true);
      expect(ministryOfficeMayAccessModule('sys-protocol', office, 'music')).toBe(true);
    }
    // Plain members and the treasurer do not get them.
    expect(ministryOfficeMayAccessModule('sys-protocol', 'MEMBER', 'availability')).toBe(false);
    expect(ministryOfficeMayAccessModule('sys-protocol', 'TREASURER', 'music')).toBe(false);
  });
});
