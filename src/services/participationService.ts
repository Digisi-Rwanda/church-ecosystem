import {
  ASSIGNMENTS,
  MEMBERSHIPS,
  POSITIONS,
  SYSTEMS,
  TASKS,
} from '../data/seed';
import { persistPeopleLocalStore } from '../data/peopleLocalStore';
import {
  isAssignmentActive,
  isMembershipActive,
  isPositionActive,
  resolveSystemEntitlements,
  rolesFromPositions,
} from '../domain/participation';
import { isTaskActive } from '../domain/permissions';
import type {
  Assignment,
  Membership,
  Position,
  SystemEntitlement,
  SystemId,
  SystemRole,
  WorkTask,
} from '../domain/types';

export const participationService = {
  membershipsFor(personId: string): Membership[] {
    return MEMBERSHIPS.filter((m) => m.personId === personId);
  },

  positionsFor(personId: string): Position[] {
    return POSITIONS.filter((p) => p.personId === personId);
  },

  assignmentsFor(personId: string): Assignment[] {
    return ASSIGNMENTS.filter((a) => a.personId === personId);
  },

  tasksFor(personId: string): WorkTask[] {
    return TASKS.filter(
      (t) =>
        t.ownerPersonId === personId ||
        (t.helperPersonIds ?? []).includes(personId),
    );
  },

  activeMemberships(personId: string, now = new Date()): Membership[] {
    return this.membershipsFor(personId).filter((m) =>
      isMembershipActive(m, now),
    );
  },

  activePositions(personId: string, now = new Date()): Position[] {
    return this.positionsFor(personId).filter((p) => isPositionActive(p, now));
  },

  activeAssignments(personId: string, now = new Date()): Assignment[] {
    return this.assignmentsFor(personId).filter((a) =>
      isAssignmentActive(a, now),
    );
  },

  activeTasks(personId: string, now = new Date()): WorkTask[] {
    return this.tasksFor(personId).filter((t) => isTaskActive(t, now));
  },

  rolesFor(personId: string, now = new Date()): SystemRole[] {
    return rolesFromPositions(this.positionsFor(personId), now);
  },

  entitlementsFor(personId: string, now = new Date()): SystemEntitlement[] {
    const base = resolveSystemEntitlements(
      personId,
      {
        memberships: MEMBERSHIPS,
        positions: POSITIONS,
        assignments: ASSIGNMENTS,
        allSystemIds: SYSTEMS.map((s) => s.id),
      },
      now,
    );

    const map = new Map(
      base.map((e) => [e.systemId, { ...e, reasons: [...e.reasons] }]),
    );

    for (const t of this.activeTasks(personId, now)) {
      if (!t.grantsSystemAccess || !t.systemId) continue;
      const reason = `Task: ${t.title}`;
      const existing = map.get(t.systemId);
      if (existing) {
        if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
        if (!existing.sources.includes('TASK')) existing.sources.push('TASK');
      } else {
        map.set(t.systemId, {
          systemId: t.systemId,
          sources: ['TASK'],
          reasons: [reason],
        });
      }
    }

    return [...map.values()];
  },

  canEnter(personId: string, systemId: SystemId, now = new Date()): boolean {
    if (systemId === 'sys-main') return true;
    return this.entitlementsFor(personId, now).some(
      (e) => e.systemId === systemId,
    );
  },

  rosterByOrgUnit(orgUnitId: string, now = new Date()): Membership[] {
    return MEMBERSHIPS.filter(
      (m) => m.orgUnitId === orgUnitId && isMembershipActive(m, now),
    );
  },

  positionsByOrgUnit(orgUnitId: string, now = new Date()): Position[] {
    return POSITIONS.filter(
      (p) => p.orgUnitId === orgUnitId && isPositionActive(p, now),
    );
  },

  listMemberships(filter?: { personId?: string; status?: Membership['status'] }) {
    return MEMBERSHIPS.filter((m) => {
      if (filter?.personId && m.personId !== filter.personId) return false;
      if (filter?.status && m.status !== filter.status) return false;
      return true;
    });
  },

  listPositions(filter?: { personId?: string; status?: Position['status'] }) {
    return POSITIONS.filter((p) => {
      if (filter?.personId && p.personId !== filter.personId) return false;
      if (filter?.status && p.status !== filter.status) return false;
      return true;
    });
  },

  listAssignments(filter?: { personId?: string; status?: Assignment['status'] }) {
    return ASSIGNMENTS.filter((a) => {
      if (filter?.personId && a.personId !== filter.personId) return false;
      if (filter?.status && a.status !== filter.status) return false;
      return true;
    });
  },

  createMembership(input: {
    personId: string;
    type: Membership['type'];
    label: string;
    orgUnitId?: string;
    systemId?: SystemId;
    startDate?: string;
  }): Membership {
    const m: Membership = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      personId: input.personId,
      type: input.type,
      label: input.label,
      orgUnitId: input.orgUnitId,
      systemId: input.systemId,
      status: 'ACTIVE',
      startDate: input.startDate ?? new Date().toISOString().slice(0, 10),
    };
    MEMBERSHIPS.unshift(m);
    persistPeopleLocalStore();
    return m;
  },

  endMembership(id: string): Membership | null {
    const i = MEMBERSHIPS.findIndex((m) => m.id === id);
    if (i < 0) return null;
    MEMBERSHIPS[i] = {
      ...MEMBERSHIPS[i],
      status: 'ENDED',
      endDate: new Date().toISOString().slice(0, 10),
    };
    persistPeopleLocalStore();
    return MEMBERSHIPS[i];
  },

  createPosition(input: {
    personId: string;
    title: string;
    orgUnitId: string;
    systemRole?: Position['systemRole'];
    ministryOffice?: Position['ministryOffice'];
    systemAdmin?: boolean;
    grantsAllSystems?: boolean;
    systemId?: SystemId;
    startDate?: string;
  }): Position {
    const p: Position = {
      id: `pos-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      personId: input.personId,
      title: input.title,
      orgUnitId: input.orgUnitId,
      systemRole: input.systemRole,
      ministryOffice: input.ministryOffice,
      systemAdmin: input.systemAdmin,
      grantsAllSystems: input.grantsAllSystems,
      systemId: input.systemId,
      status: 'ACTIVE',
      startDate: input.startDate ?? new Date().toISOString().slice(0, 10),
    };
    POSITIONS.unshift(p);
    persistPeopleLocalStore();
    return p;
  },

  endPosition(id: string): Position | null {
    const i = POSITIONS.findIndex((p) => p.id === id);
    if (i < 0) return null;
    POSITIONS[i] = {
      ...POSITIONS[i],
      status: 'ENDED',
      endDate: new Date().toISOString().slice(0, 10),
    };
    persistPeopleLocalStore();
    return POSITIONS[i];
  },

  createAssignment(input: {
    personId: string;
    title: string;
    contextType: Assignment['contextType'];
    contextId: string;
    contextLabel: string;
    orgUnitId?: string;
    systemId?: SystemId;
    startDate?: string;
    endDate?: string;
  }): Assignment {
    const a: Assignment = {
      id: `asg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      personId: input.personId,
      title: input.title,
      contextType: input.contextType,
      contextId: input.contextId,
      contextLabel: input.contextLabel,
      orgUnitId: input.orgUnitId,
      systemId: input.systemId,
      status: 'ACTIVE',
      startDate: input.startDate ?? new Date().toISOString().slice(0, 10),
      endDate: input.endDate,
    };
    ASSIGNMENTS.unshift(a);
    persistPeopleLocalStore();
    return a;
  },

  completeAssignment(id: string): Assignment | null {
    const i = ASSIGNMENTS.findIndex((a) => a.id === id);
    if (i < 0) return null;
    ASSIGNMENTS[i] = {
      ...ASSIGNMENTS[i],
      status: 'COMPLETED',
      endDate: new Date().toISOString().slice(0, 10),
    };
    persistPeopleLocalStore();
    return ASSIGNMENTS[i];
  },
};
