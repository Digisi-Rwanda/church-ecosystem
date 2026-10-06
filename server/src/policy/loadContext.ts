import { prisma } from '../lib/prisma.js';
import type {
  Assignment,
  Membership,
  Position,
  SystemId,
  WorkTask,
} from './types.js';

export type PolicyContext = {
  memberships: Membership[];
  positions: Position[];
  assignments: Assignment[];
  tasks: WorkTask[];
  allSystemIds: SystemId[];
};

function iso(d: Date | null | undefined): string | undefined {
  if (!d) return undefined;
  return d.toISOString().slice(0, 10);
}

export async function loadPolicyContext(): Promise<PolicyContext> {
  const [systems, memberships, positions, workTasks, assignments] =
    await Promise.all([
      prisma.churchSystem.findMany({ select: { id: true } }),
      prisma.membership.findMany(),
      prisma.position.findMany(),
      prisma.workTask.findMany({
        where: { status: { in: ['TODO', 'IN_PROGRESS'] } },
      }),
      prisma.assignment.findMany({
        where: { status: 'ACTIVE' },
      }),
    ]);

  return {
    allSystemIds: systems.map((s) => s.id),
    memberships: memberships.map(
      (m): Membership => ({
        id: m.id,
        personId: m.personId,
        systemId: m.systemId ?? undefined,
        orgUnitId: m.orgUnitId ?? undefined,
        type: m.type,
        label: m.label ?? m.type,
        status: m.status,
        startDate: iso(m.startDate) ?? '2000-01-01',
        endDate: iso(m.endDate),
      }),
    ),
    positions: positions.map(
      (p): Position => ({
        id: p.id,
        personId: p.personId,
        systemId: p.systemId ?? undefined,
        orgUnitId: p.orgUnitId ?? undefined,
        title: p.title,
        office: p.office ?? undefined,
        systemRole: p.systemRole ?? undefined,
        ministryOffice: p.ministryOffice ?? undefined,
        choirOffice: p.choirOffice ?? undefined,
        choirAdvisorRole: p.choirAdvisorRole ?? undefined,
        systemAdmin: p.systemAdmin || undefined,
        worshipOffice: p.worshipOffice ?? undefined,
        protocolOffice: p.protocolOffice ?? undefined,
        deaconOffice: p.deaconOffice ?? undefined,
        grantsAllSystems: p.grantsAllSystems,
        status: p.status,
        startDate: iso(p.startDate) ?? '2000-01-01',
        endDate: iso(p.endDate),
      }),
    ),
    assignments: assignments.map(
      (a): Assignment => ({
        id: a.id,
        personId: a.personId,
        systemId: (a.systemId as SystemId) || undefined,
        title: a.title,
        contextLabel: a.contextLabel,
        status: a.status,
        startDate: iso(a.startDate) ?? '2000-01-01',
        endDate: iso(a.endDate),
      }),
    ),
    tasks: workTasks.map(
      (t): WorkTask => ({
        id: t.id,
        ownerPersonId: t.ownerPersonId,
        title: t.title,
        systemId: t.systemId ?? undefined,
        status: t.status,
        grantsSystemAccess: t.grantsSystemAccess,
        dueAt: t.dueDate ? t.dueDate.toISOString() : undefined,
        startDate: iso(t.startDate),
        endDate: iso(t.endDate),
      }),
    ),
  };
}
