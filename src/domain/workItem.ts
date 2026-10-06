/**
 * Shared list projection for Program / Event / Task / Project.
 * List|Board|Calendar views consume this shape.
 */
import type {
  ChurchEvent,
  ChurchProject,
  Program,
  SystemId,
  WorkTask,
} from './types';
import {
  requiredDeliveryOpen,
  type MissionStewardship,
} from './stewardship';
import { computeMissionHealth, type HealthResult } from './missionHealth';

export type WorkItemKind = 'PROGRAM' | 'EVENT' | 'TASK' | 'PROJECT';

export type WorkItem = {
  id: string;
  kind: WorkItemKind;
  title: string;
  status: string;
  ownerSystemId?: SystemId;
  href: string;
  visibility?: string;
  startsAt?: string;
  dueDate?: string;
  health?: HealthResult;
  openRequiredDelivery?: number;
  nextSessionAt?: string;
};

export function programToWorkItem(
  p: Program,
  extras?: { nextSessionAt?: string },
): WorkItem {
  const steward: MissionStewardship = p;
  return {
    id: p.id,
    kind: 'PROGRAM',
    title: p.name,
    status: p.status,
    ownerSystemId: p.ownerSystemId,
    href: `/programs/${p.id}`,
    visibility: p.visibility,
    health: computeMissionHealth(steward, { status: p.status }),
    openRequiredDelivery: requiredDeliveryOpen(steward).length,
    nextSessionAt: extras?.nextSessionAt,
  };
}

export function projectToWorkItem(p: ChurchProject): WorkItem {
  const steward: MissionStewardship = p;
  return {
    id: p.id,
    kind: 'PROJECT',
    title: p.name,
    status: p.status,
    ownerSystemId: p.ownerSystemId,
    href: `/projects/${p.id}`,
    visibility: p.visibility,
    startsAt: p.startDate,
    health: computeMissionHealth(steward, { status: p.status }),
    openRequiredDelivery: requiredDeliveryOpen(steward).length,
  };
}

export function eventToWorkItem(e: ChurchEvent): WorkItem {
  return {
    id: e.id,
    kind: 'EVENT',
    title: e.name,
    status: e.status,
    ownerSystemId: e.ownerSystemId,
    href: `/events/${e.id}`,
    visibility: e.visibility,
    startsAt: e.startsAt,
  };
}

export function taskToWorkItem(t: WorkTask): WorkItem {
  return {
    id: t.id,
    kind: 'TASK',
    title: t.title,
    status: t.status,
    ownerSystemId: t.systemId,
    href: `/tasks/${t.id}`,
    visibility: t.visibility,
    dueDate: t.dueDate,
    startsAt: t.startDate,
  };
}
