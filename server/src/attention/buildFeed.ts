import { prisma } from '../lib/prisma.js';
import type { SystemRole } from '../policy/types.js';

export type AttentionItemDto = {
  id: string;
  kind: 'PROGRAM' | 'EVENT' | 'PROJECT' | 'TASK' | 'FINANCE' | 'NOTICE';
  title: string;
  reason: string;
  href: string;
  /** Lower = more urgent. */
  rank: number;
  createdAt?: string;
};

const LEADERSHIP: SystemRole[] = [
  'CHURCH_LEADER',
  'PASTOR',
  'CATECHIST',
];

function isLeadership(roles: SystemRole[]) {
  return roles.some((r) => LEADERSHIP.includes(r));
}

/**
 * Unified Attention feed: approvals, setup/closing handoffs, open tasks — ranked.
 */
export async function buildAttentionFeed(
  personId: string,
): Promise<AttentionItemDto[]> {
  const positions = await prisma.position.findMany({
    where: { personId, status: 'ACTIVE' },
  });
  const roles = [
    ...new Set(
      positions
        .map((p) => p.systemRole)
        .filter((r): r is string => Boolean(r)),
    ),
  ] as SystemRole[];
  const items: AttentionItemDto[] = [];
  const today = new Date().toISOString().slice(0, 10);

  if (isLeadership(roles)) {
    const pendingPrograms = await prisma.program.findMany({
      where: { status: 'PENDING_APPROVAL' },
      orderBy: { name: 'asc' },
      take: 40,
    });
    for (const p of pendingPrograms) {
      items.push({
        id: `prog-approve-${p.id}`,
        kind: 'PROGRAM',
        title: p.name,
        reason: 'Program awaiting Church Leadership approval',
        href: `/programs/${p.id}`,
        rank: 10,
      });
    }

    const pendingProjects = await prisma.churchProject.findMany({
      where: { status: 'PENDING_APPROVAL' },
      orderBy: { name: 'asc' },
      take: 40,
    });
    for (const p of pendingProjects) {
      items.push({
        id: `proj-approve-${p.id}`,
        kind: 'PROJECT',
        title: p.name,
        reason: 'Project awaiting approval',
        href: `/projects/${p.id}`,
        rank: 12,
      });
    }

    const pendingEvents = await prisma.churchEvent.findMany({
      where: { status: 'PENDING_APPROVAL' },
      orderBy: { startsAt: 'asc' },
      take: 40,
    });
    for (const e of pendingEvents) {
      items.push({
        id: `evt-approve-${e.id}`,
        kind: 'EVENT',
        title: e.name,
        reason: 'Event awaiting approval',
        href: `/events/${e.id}`,
        rank: 14,
      });
    }
  }

  const setupPrograms = await prisma.program.findMany({
    where: {
      status: { in: ['SETUP', 'CLOSING'] },
    },
    take: 40,
  });
  for (const p of setupPrograms) {
    const leaders = (() => {
      try {
        const meta = p.metaJson ? JSON.parse(p.metaJson) : {};
        return Array.isArray(meta.leaderPersonIds)
          ? (meta.leaderPersonIds as string[])
          : [];
      } catch {
        return [] as string[];
      }
    })();
    const involved =
      isLeadership(roles) ||
      leaders.includes(personId) ||
      p.createdByPersonId === personId;
    if (!involved) continue;
    items.push({
      id: `prog-${p.status.toLowerCase()}-${p.id}`,
      kind: 'PROGRAM',
      title: p.name,
      reason:
        p.status === 'SETUP'
          ? 'In SETUP — start running when ready'
          : 'In CLOSING — finish stewardship close-out',
      href: `/programs/${p.id}`,
      rank: p.status === 'CLOSING' ? 20 : 30,
    });
  }

  const setupProjects = await prisma.churchProject.findMany({
    where: { status: { in: ['PLANNED', 'CLOSING'] } },
    take: 40,
  });
  for (const p of setupProjects) {
    const involved =
      isLeadership(roles) ||
      p.leadPersonId === personId ||
      p.createdByPersonId === personId;
    if (!involved) continue;
    items.push({
      id: `proj-${p.status.toLowerCase()}-${p.id}`,
      kind: 'PROJECT',
      title: p.name,
      reason:
        p.status === 'PLANNED'
          ? 'In SETUP — start running when ready'
          : 'In CLOSING — finish stewardship close-out',
      href: `/projects/${p.id}`,
      rank: p.status === 'CLOSING' ? 22 : 32,
    });
  }

  const tasks = await prisma.workTask.findMany({
    where: {
      ownerPersonId: personId,
      status: { in: ['TODO', 'IN_PROGRESS'] },
    },
    orderBy: { dueDate: 'asc' },
    take: 50,
  });
  for (const t of tasks) {
    const due = t.dueDate?.toISOString().slice(0, 10);
    const overdue = Boolean(due && due < today);
    items.push({
      id: `task-${t.id}`,
      kind: 'TASK',
      title: t.title,
      reason: overdue
        ? `Overdue · due ${due}`
        : due
          ? `Your task · due ${due}`
          : 'Your open task',
      href: `/tasks/${t.id}`,
      rank: overdue ? 5 : 40,
      createdAt: t.startDate.toISOString(),
    });
  }

  items.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
  return items;
}
