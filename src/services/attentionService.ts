import { loadAttentionPreferApi, type AttentionItem } from '../api/attentionApi';
import { canApproveEventLevel, canApproveScopeLevel } from '../domain/eventScope';
import type { Position, SystemRole, WorkTask } from '../domain/types';
import { isChurchLeadership, missionService } from './missionService';
export { INBOX_REFRESH_EVENT, markInboxUnread, pingInboxRefresh, notifyInboxItem } from './inboxNotify';

const READ_KEY = 'adepr.attentionRead';

function readSet(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeSet(ids: Set<string>) {
  localStorage.setItem(READ_KEY, JSON.stringify([...ids]));
}

export type AttentionViewItem = AttentionItem & { unread: boolean };

/** Local seed-backed Attention feed (API fallback / offline). */
export function buildLocalAttention(input: {
  personId: string;
  roles: SystemRole[];
  positions: Position[];
  tasks: WorkTask[];
  can: (resource: string, action: string, systemId?: string) => boolean;
}): AttentionItem[] {
  const { personId, roles, positions, tasks, can } = input;
  const viewOpts = { personId, positions, canEnterOwner: true };
  const items: AttentionItem[] = [];

  if (isChurchLeadership(roles)) {
    for (const p of missionService.listPrograms({
      viewerSystemId: 'sys-main',
      viewOpts,
    })) {
      if (p.status === 'PENDING_APPROVAL') {
        items.push({
          id: `prog-approve-${p.id}`,
          kind: 'PROGRAM',
          title: p.name,
          reason: 'Program awaiting Church Leadership approval',
          href: `/programs/${p.id}`,
          rank: 10,
        });
      }
    }
    for (const p of missionService.listProjects({
      viewerSystemId: 'sys-main',
      viewOpts,
    })) {
      if (p.status === 'PENDING_APPROVAL' && !p.beyondOwnerScope) {
        items.push({
          id: `proj-approve-${p.id}`,
          kind: 'PROJECT',
          title: p.name,
          reason: 'In-scope project awaiting Church Leadership approval',
          href: `/projects/${p.id}`,
          rank: 12,
        });
      }
    }
  }

  for (const e of missionService.listEvents({
    viewerSystemId: 'sys-main',
    viewOpts,
  })) {
    if (e.status !== 'PENDING_APPROVAL' || !e.beyondOwnerScope) continue;
    const missing = missionService.missingEventApprovals(e.id);
    if (!missing.some((level) => canApproveEventLevel(level, roles, positions))) {
      continue;
    }
    items.push({
      id: `evt-approve-${e.id}`,
      kind: 'EVENT',
      title: e.name,
      reason: `Pending: ${missing.map((m) => m.label).join(', ')}`,
      href: `/events/${e.id}`,
      rank: 14,
    });
  }

  for (const p of missionService.listProjects({
    viewerSystemId: 'sys-main',
    viewOpts,
  })) {
    if (p.status === 'PENDING_APPROVAL' && p.beyondOwnerScope) {
      const missing = missionService.missingProjectApprovals(p.id);
      if (
        missing.some((level) => canApproveScopeLevel(level, roles, positions))
      ) {
        items.push({
          id: `proj-approve-${p.id}`,
          kind: 'PROJECT',
          title: p.name,
          reason: `Pending: ${missing.map((m) => m.label).join(', ')}`,
          href: `/projects/${p.id}`,
          rank: 12,
        });
      }
    }
    if (
      p.status === 'PLANNED' &&
      (can('PROJECT', 'MANAGE') ||
        p.leadPersonId === personId ||
        p.createdByPersonId === personId)
    ) {
      items.push({
        id: `proj-planned-${p.id}`,
        kind: 'PROJECT',
        title: p.name,
        reason: 'In SETUP — start running when ready',
        href: `/projects/${p.id}`,
        rank: 32,
      });
    }
    if (
      p.status === 'CLOSING' &&
      (can('PROJECT', 'MANAGE') ||
        p.leadPersonId === personId ||
        p.createdByPersonId === personId)
    ) {
      items.push({
        id: `proj-closing-${p.id}`,
        kind: 'PROJECT',
        title: p.name,
        reason: 'In CLOSING — finish stewardship close-out',
        href: `/projects/${p.id}`,
        rank: 22,
      });
    }
  }

  for (const p of missionService.listPrograms({
    viewerSystemId: 'sys-main',
    viewOpts,
  })) {
    if (
      p.status === 'SETUP' &&
      (can('PROGRAM', 'MANAGE') ||
        (p.leaderPersonIds ?? []).includes(personId))
    ) {
      items.push({
        id: `prog-setup-${p.id}`,
        kind: 'PROGRAM',
        title: p.name,
        reason: 'In SETUP — start running when ready',
        href: `/programs/${p.id}`,
        rank: 30,
      });
    }
    if (
      p.status === 'CLOSING' &&
      (can('PROGRAM', 'MANAGE') ||
        (p.leaderPersonIds ?? []).includes(personId))
    ) {
      items.push({
        id: `prog-closing-${p.id}`,
        kind: 'PROGRAM',
        title: p.name,
        reason: 'In CLOSING — finish stewardship close-out',
        href: `/programs/${p.id}`,
        rank: 20,
      });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const t of tasks.filter(
    (x) => x.status === 'TODO' || x.status === 'IN_PROGRESS',
  )) {
    const overdue = Boolean(t.dueDate && t.dueDate < today);
    items.push({
      id: `task-${t.id}`,
      kind: 'TASK',
      title: t.title,
      reason: overdue
        ? `Overdue · due ${t.dueDate}`
        : t.dueDate
          ? `Your task · due ${t.dueDate}`
          : 'Your open task',
      href: `/tasks/${t.id}`,
      rank: overdue ? 5 : 40,
    });
  }

  items.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
  return items;
}

export const attentionService = {
  async list(input: {
    personId: string;
    roles: SystemRole[];
    positions: Position[];
    tasks: WorkTask[];
    can: (resource: string, action: string, systemId?: string) => boolean;
  }): Promise<{ items: AttentionViewItem[]; source: 'api' | 'seed' }> {
    const remote = await loadAttentionPreferApi();
    const local = buildLocalAttention(input);
    let base: AttentionItem[];
    let source: 'api' | 'seed';
    if (remote == null) {
      base = local;
      source = 'seed';
    } else {
      // Prefer API; keep seed-only items during hybrid migration.
      const byId = new Map(remote.map((i) => [i.id, i]));
      for (const i of local) {
        if (!byId.has(i.id)) byId.set(i.id, i);
      }
      base = [...byId.values()].sort(
        (a, b) => a.rank - b.rank || a.title.localeCompare(b.title),
      );
      source = 'api';
    }
    const read = readSet();
    return {
      source,
      items: base.map((i) => ({ ...i, unread: !read.has(i.id) })),
    };
  },

  unreadCount(items: AttentionViewItem[]) {
    return items.filter((i) => i.unread).length;
  },

  markRead(id: string) {
    const s = readSet();
    s.add(id);
    writeSet(s);
  },

  markAllRead(ids: string[]) {
    const s = readSet();
    for (const id of ids) s.add(id);
    writeSet(s);
  },

  markUnread(id: string) {
    const s = readSet();
    s.delete(id);
    writeSet(s);
  },
};
