/**
 * Work a person needs to do, grouped by system — not access/permissions.
 */
import { isChurchLeader } from '../domain/churchLeadership';
import type {
  Position,
  SystemId,
  SystemRole,
  WorkTask,
} from '../domain/types';
import { missionService } from './missionService';
import { systemsService } from './orgService';

export type ParticipationWorkKind =
  | 'TASK'
  | 'APPROVAL'
  | 'REMINDER'
  | 'DEADLINE'
  | 'CARE'
  | 'PULPIT'
  | 'BOARD';

/** Office trays — how work is filed on the Participation desk. */
export type ParticipationWorkCategory =
  | 'decisions'
  | 'care'
  | 'board'
  | 'pulpit'
  | 'tasks'
  | 'upcoming';

export type ParticipationWorkItem = {
  id: string;
  kind: ParticipationWorkKind;
  title: string;
  detail?: string;
  dueDate?: string;
  href: string;
  urgent?: boolean;
};

export type ParticipationWorkTray = {
  category: ParticipationWorkCategory;
  label: string;
  items: ParticipationWorkItem[];
};

export type ParticipationSystemWork = {
  systemId: SystemId;
  shortName: string;
  basePath: string;
  items: ParticipationWorkItem[];
  trays: ParticipationWorkTray[];
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isOpenTask(t: WorkTask) {
  return t.status === 'TODO' || t.status === 'IN_PROGRESS';
}

function mine(t: WorkTask, personId: string) {
  return (
    t.ownerPersonId === personId ||
    (t.helperPersonIds ?? []).includes(personId)
  );
}

function systemHref(systemId: SystemId, path: string) {
  const sys = systemsService.getById(systemId);
  const base = sys?.basePath ?? '/';
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (base === '/') return clean;
  return `${base.replace(/\/$/, '')}${clean}`;
}

function push(
  map: Map<SystemId, ParticipationWorkItem[]>,
  systemId: SystemId,
  item: ParticipationWorkItem,
) {
  const list = map.get(systemId) ?? [];
  if (list.some((x) => x.id === item.id)) return;
  list.push(item);
  map.set(systemId, list);
}

function hasConcreteTieToSystem(
  systemId: SystemId,
  positions: Position[],
) {
  return positions.some(
    (p) =>
      p.systemId === systemId ||
      (p.grantsAllSystems && systemId === 'sys-main'),
  );
}

/**
 * Build actionable work for the signed-in person across systems they touch.
 */
export function buildParticipationWork(input: {
  personId: string;
  roles: SystemRole[];
  positions: Position[];
  tasks: WorkTask[];
  entitlementSystemIds: SystemId[];
}): ParticipationSystemWork[] {
  const { personId, roles, positions, tasks, entitlementSystemIds } = input;
  const today = todayIso();
  const map = new Map<SystemId, ParticipationWorkItem[]>();
  const viewOpts = { personId, positions, canEnterOwner: true };
  const systemIds = new Set<SystemId>(['sys-main', ...entitlementSystemIds]);

  for (const t of tasks.filter((x) => isOpenTask(x) && mine(x, personId))) {
    const systemId = (t.systemId ?? 'sys-main') as SystemId;
    systemIds.add(systemId);
    const overdue = Boolean(t.dueDate && t.dueDate < today);
    const dueSoon =
      Boolean(t.dueDate) &&
      !overdue &&
      t.dueDate! <=
        new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    push(map, systemId, {
      id: `task-${t.id}`,
      kind: overdue || dueSoon ? 'DEADLINE' : 'TASK',
      title: t.title,
      detail: overdue
        ? `Overdue · due ${t.dueDate}`
        : t.dueDate
          ? `Due ${t.dueDate}`
          : t.contextLabel ?? 'Open task',
      dueDate: t.dueDate,
      href: `/tasks/${t.id}`,
      urgent: overdue,
    });
  }

  // Upcoming events (next 14 days) the person is tied to — not every ministry calendar
  const horizon = Date.now() + 14 * 864e5;
  for (const systemId of systemIds) {
    const events = missionService.listEvents({
      ownerSystemId: systemId,
      viewerSystemId: systemId,
      viewOpts,
    });
    let added = 0;
    for (const e of events) {
      if (added >= 4) break;
      if (e.status === 'CANCELLED' || e.status === 'COMPLETED') continue;
      const t = new Date(e.startsAt).getTime();
      if (!Number.isFinite(t) || t < Date.now() - 864e5 || t > horizon) {
        continue;
      }
      const tied =
        e.createdByPersonId === personId ||
        (e.collaboratorPersonIds ?? []).includes(personId) ||
        hasConcreteTieToSystem(systemId, positions) ||
        (systemId === 'sys-main' && isChurchLeader(roles));
      if (!tied) continue;
      const day = e.startsAt.slice(0, 10);
      push(map, systemId, {
        id: `evt-${e.id}`,
        kind: 'REMINDER',
        title: e.name,
        detail: `Coming up · ${day}${e.location ? ` · ${e.location}` : ''}`,
        dueDate: day,
        href: systemHref(systemId, `/events/${e.id}`),
      });
      added += 1;
    }
  }

  if (isChurchLeader(roles) || roles.includes('CATECHIST')) {
    for (const p of missionService.listPrograms({
      viewerSystemId: 'sys-main',
      viewOpts,
    })) {
      if (p.status === 'PENDING_APPROVAL' && isChurchLeader(roles)) {
        push(map, 'sys-main', {
          id: `prog-ap-${p.id}`,
          kind: 'APPROVAL',
          title: p.name,
          detail: 'Program awaiting your approval',
          href: `/programs/${p.id}`,
          urgent: true,
        });
      }
    }
    for (const p of missionService.listProjects({
      viewerSystemId: 'sys-main',
      viewOpts,
    })) {
      if (p.status === 'PENDING_APPROVAL' && isChurchLeader(roles)) {
        push(map, (p.ownerSystemId ?? 'sys-main') as SystemId, {
          id: `proj-ap-${p.id}`,
          kind: 'APPROVAL',
          title: p.name,
          detail: 'Project awaiting your approval',
          href: `/projects/${p.id}`,
          urgent: true,
        });
      }
    }
  }

  const kindOrder: Record<ParticipationWorkKind, number> = {
    APPROVAL: 0,
    DEADLINE: 1,
    CARE: 2,
    PULPIT: 3,
    BOARD: 4,
    TASK: 5,
    REMINDER: 6,
  };

  const rows: ParticipationSystemWork[] = [];
  for (const systemId of [...map.keys()]) {
    const items = (map.get(systemId) ?? []).sort((a, b) => {
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
      const ko = kindOrder[a.kind] - kindOrder[b.kind];
      if (ko !== 0) return ko;
      return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
    });
    if (items.length === 0) continue;
    const sys = systemsService.getById(systemId);
    rows.push({
      systemId,
      shortName: sys?.shortName ?? sys?.name ?? systemId,
      basePath: sys?.basePath ?? '/',
      items,
      trays: groupWorkIntoTrays(items),
    });
  }

  rows.sort((a, b) => {
    if (a.systemId === 'sys-main') return -1;
    if (b.systemId === 'sys-main') return 1;
    return b.items.length - a.items.length;
  });

  return rows;
}

const TRAY_ORDER: ParticipationWorkCategory[] = [
  'decisions',
  'care',
  'board',
  'pulpit',
  'tasks',
  'upcoming',
];

export function workCategory(
  kind: ParticipationWorkKind,
): ParticipationWorkCategory {
  switch (kind) {
    case 'APPROVAL':
      return 'decisions';
    case 'CARE':
      return 'care';
    case 'BOARD':
      return 'board';
    case 'PULPIT':
      return 'pulpit';
    case 'TASK':
    case 'DEADLINE':
      return 'tasks';
    case 'REMINDER':
      return 'upcoming';
  }
}

export function workCategoryLabel(category: ParticipationWorkCategory): string {
  switch (category) {
    case 'decisions':
      return 'Awaiting your decision';
    case 'care':
      return 'Care & people';
    case 'board':
      return 'Board & governance';
    case 'pulpit':
      return 'Pulpit & worship';
    case 'tasks':
      return 'Your tasks';
    case 'upcoming':
      return 'Coming up';
  }
}

export function groupWorkIntoTrays(
  items: ParticipationWorkItem[],
): ParticipationWorkTray[] {
  const buckets = new Map<ParticipationWorkCategory, ParticipationWorkItem[]>();
  for (const item of items) {
    const cat = workCategory(item.kind);
    const list = buckets.get(cat) ?? [];
    list.push(item);
    buckets.set(cat, list);
  }
  return TRAY_ORDER.filter((c) => (buckets.get(c)?.length ?? 0) > 0).map(
    (category) => ({
      category,
      label: workCategoryLabel(category),
      items: buckets.get(category)!,
    }),
  );
}

export function kindLabel(kind: ParticipationWorkKind): string {
  switch (kind) {
    case 'APPROVAL':
      return 'Decision';
    case 'DEADLINE':
      return 'Deadline';
    case 'REMINDER':
      return 'Reminder';
    case 'CARE':
      return 'Care';
    case 'PULPIT':
      return 'Pulpit';
    case 'BOARD':
      return 'Board';
    default:
      return 'Task';
  }
}
