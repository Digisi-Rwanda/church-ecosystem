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
import { boardService } from './boardService';
import { correspondenceService } from './correspondenceService';
import { deaconService } from './deaconService';
import { missionService } from './missionService';
import { systemsService } from './orgService';
import { pastoralOpsService } from './pastoralOpsService';

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

  for (const path of pastoralOpsService.listPathways({
    kind: 'BAPTISM_TRACK',
  })) {
    if (path.status === 'COMPLETED' || path.status === 'WITHDRAWN') continue;
    if (!path.leaderConfirmedByPersonId && isChurchLeader(roles)) {
      push(map, 'sys-main', {
        id: `bap-${path.id}`,
        kind: 'APPROVAL',
        title: `Confirm baptism name · ${path.label}`,
        detail: 'Leader must confirm every name before the rite',
        href: '/pastoral',
        urgent: true,
      });
    }
  }

  for (const slot of pastoralOpsService.listPulpit()) {
    if (slot.status === 'AWAITING_LEADER' && isChurchLeader(roles)) {
      push(map, 'sys-main', {
        id: `pulpit-${slot.id}`,
        kind: 'PULPIT',
        title: `Approve pulpit · ${slot.serviceLabel}`,
        detail: `Service ${slot.serviceDate}`,
        dueDate: slot.serviceDate,
        href: '/pastoral',
        urgent: true,
      });
    }
    if (slot.status === 'CATECHIST_REVIEW' && roles.includes('CATECHIST')) {
      push(map, 'sys-main', {
        id: `pulpit-rev-${slot.id}`,
        kind: 'PULPIT',
        title: `Review pulpit · ${slot.serviceLabel}`,
        detail: `Service ${slot.serviceDate}`,
        dueDate: slot.serviceDate,
        href: '/pastoral',
      });
    }
  }

  for (const letter of pastoralOpsService.listTransferLettersOut({
    status: 'AWAITING_LEADER',
  })) {
    if (isChurchLeader(roles)) {
      push(map, 'sys-main', {
        id: `tlo-${letter.id}`,
        kind: 'APPROVAL',
        title: `Review transfer letter · ${letter.destinationChurch}`,
        detail: 'Open the letter, review it, then sign',
        href: letter.documentId
          ? `/correspondence/${letter.documentId}`
          : '/pastoral',
        urgent: true,
      });
    }
  }

  for (const doc of correspondenceService.listDocuments({
    awaitingSignature: true,
  })) {
    if (!isChurchLeader(roles)) continue;
    if (doc.letterType === 'TRANSFER_OUT') continue; // already queued via transfer row
    push(map, 'sys-main', {
      id: `cdoc-sign-${doc.id}`,
      kind: 'APPROVAL',
      title: `Review letter · ${correspondenceService.LETTER_TYPE_LABELS[doc.letterType]}`,
      detail: `${doc.title} — open, review, then sign`,
      href: `/correspondence/${doc.id}`,
      urgent: true,
    });
  }

  const canPrepareLetters =
    roles.includes('CHURCH_SECRETARY') ||
    roles.includes('CATECHIST') ||
    isChurchLeader(roles);
  if (canPrepareLetters) {
    for (const doc of correspondenceService.listDocuments({
      status: 'SUBMITTED',
    })) {
      push(map, 'sys-main', {
        id: `cdoc-prep-${doc.id}`,
        kind: 'REMINDER',
        title: `Prepare letter · ${correspondenceService.LETTER_TYPE_LABELS[doc.letterType]}`,
        detail: doc.origin === 'MEMBER_REQUESTED' ? 'Member request' : doc.title,
        href: `/correspondence/${doc.id}`,
        urgent: true,
      });
    }
    for (const doc of correspondenceService.listDocuments({
      status: 'NEEDS_INFORMATION',
    })) {
      push(map, 'sys-main', {
        id: `cdoc-info-${doc.id}`,
        kind: 'REMINDER',
        title: `Needs information · ${correspondenceService.LETTER_TYPE_LABELS[doc.letterType]}`,
        detail: doc.infoRequestNote ?? doc.title,
        href: `/correspondence/${doc.id}`,
        urgent: true,
      });
    }
    for (const doc of correspondenceService.listDocuments({
      letterType: 'INCOMING',
      status: ['IN_PREPARATION', 'SUBMITTED', 'NEEDS_INFORMATION'],
    })) {
      push(map, 'sys-main', {
        id: `cdoc-in-${doc.id}`,
        kind: 'REMINDER',
        title: `Incoming · ${doc.title}`,
        detail: doc.senderOrg
          ? `${doc.senderName ?? ''} · ${doc.senderOrg}`
          : doc.senderName,
        href: `/correspondence/${doc.id}`,
      });
    }
  }

  // Member sees their own letters waiting for their reply (always —
  // even if they also have office prepare rights on other letters).
  for (const doc of correspondenceService.listDocuments({
    status: 'NEEDS_INFORMATION',
    personId,
  })) {
    push(map, 'sys-main', {
      id: `cdoc-info-self-${doc.id}`,
      kind: 'REMINDER',
      title: `Letter needs your information`,
      detail:
        doc.infoRequestNote?.trim() ||
        'Open the letter to see what the office asked for',
      href: `/correspondence/${doc.id}`,
      urgent: true,
    });
  }

  for (const d of pastoralOpsService.listDiscipline({
    status: 'AWAITING_LEADER',
  })) {
    if (isChurchLeader(roles)) {
      push(map, 'sys-main', {
        id: `disc-${d.id}`,
        kind: 'CARE',
        title: d.title,
        detail: 'Discipline — final standing needs you',
        href: '/pastoral',
        urgent: true,
      });
    }
  }

  for (const { meeting, decision } of boardService.openFollowUps()) {
    const mineBoard = decision.ownerPersonId === personId;
    const unownedLeader =
      !decision.ownerPersonId && isChurchLeader(roles);
    if (!mineBoard && !unownedLeader) continue;
    push(map, 'sys-main', {
      id: `board-${decision.id}`,
      kind: 'BOARD',
      title: decision.summary,
      detail: decision.dueDate
        ? `${meeting.title} · due ${decision.dueDate}`
        : meeting.title,
      dueDate: decision.dueDate,
      href: `/board/follow-ups/${decision.id}`,
      urgent: Boolean(decision.dueDate && decision.dueDate < today),
    });
  }

  if (isChurchLeader(roles)) {
    for (const e of deaconService
      .listExpenses()
      .filter((x) => x.status === 'PENDING')) {
      push(map, 'sys-deacon', {
        id: `dexp-${e.id}`,
        kind: 'APPROVAL',
        title: `Approve care spend · ${e.description}`,
        detail: `${e.amount.toLocaleString()} RWF · wait for Leader yes`,
        dueDate: e.occurredOn,
        href: '/systems/deacon/finance',
        urgent: true,
      });
    }
    for (const c of deaconService.listCasesForOversight('CHURCH_LEADER')) {
      if (c.status === 'CLOSED') continue;
      push(map, 'sys-deacon', {
        id: `dcase-${c.id}`,
        kind: 'CARE',
        title: c.summary || c.title,
        detail: `Care case · ${c.status}`,
        href: '/systems/deacon/cases',
      });
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
