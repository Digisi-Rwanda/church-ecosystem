import type { DecisionItem, DecisionStatus, MeetingItem, MeetingStatus } from '../api/frontDoorApi';
import { ApiError } from '../api/client';

export const errorCode = (e: unknown): string | undefined =>
  e instanceof ApiError ? (e.body as { code?: string } | undefined)?.code : undefined;

const ERROR_KEYS: Record<string, string> = {
  NOT_ALLOWED: 'door.gov.err.notAllowed',
  OWN_ENTRY: 'door.gov.err.ownEntry',
  NOT_DRAFT: 'door.gov.err.notDraft',
  NOT_PLANNED: 'door.gov.err.notPlanned',
  MEETING_CANCELLED: 'door.gov.err.meetingCancelled',
  WORK_NEEDS_OWNER_AND_DATE: 'door.gov.err.workNeeds',
  BAD_DATES: 'door.gov.err.badDates',
  BAD_TYPE: 'door.gov.err.badType',
  PERSON_NOT_ACTIVE: 'door.gov.err.personNotActive',
  PERSON_NOT_FOUND: 'door.gov.err.personNotFound',
  UNKNOWN_ATTENDEE: 'door.gov.err.unknownAttendee',
  UNIT_HAS_NO_SYSTEM: 'door.gov.err.noSystem',
  BAD_VALUE: 'door.settings.err.badValue',
};
export const govErrorKey = (code: string | undefined): string => (code && ERROR_KEYS[code]) || 'door.people.actionFailed';

/** Planned meetings first, soonest first; then the rest, newest first. */
export function sortMeetings(list: MeetingItem[]): MeetingItem[] {
  const t = (m: MeetingItem) => (m.scheduledAt ? new Date(m.scheduledAt).getTime() : 0);
  return [...list].sort((a, b) => {
    const pa = a.status === 'PLANNED';
    const pb = b.status === 'PLANNED';
    if (pa !== pb) return pa ? -1 : 1;
    return pa ? t(a) - t(b) : t(b) - t(a);
  });
}

export const meetingStatusKey = (s: MeetingStatus) => `door.gov.meeting.status.${s}` as const;
export const decisionStatusKey = (s: DecisionStatus) => `door.gov.decision.status.${s}` as const;

/** A `datetime-local` value ("2026-10-12T15:00") as the ISO time the server expects, or null when it is not a time. */
export function toIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Whether a planned meeting is already past, so the screen can nudge "mark it held". */
export const isOverdue = (m: Pick<MeetingItem, 'status' | 'scheduledAt'>, now = new Date()): boolean =>
  m.status === 'PLANNED' && !!m.scheduledAt && new Date(m.scheduledAt).getTime() < now.getTime();

/** What the decision form may send: no work block unless it is switched on; a work block only when complete. */
export function decisionPayload(f: { title: string; detail: string; work: boolean; ownerId: string; due: string; meetingId?: string; unitId?: string }) {
  const body: { meetingId?: string; orgUnitId?: string; title: string; detail?: string; work?: { ownerPersonId: string; dueDate: string } } = { title: f.title.trim() };
  if (f.detail.trim()) body.detail = f.detail.trim();
  if (f.meetingId) body.meetingId = f.meetingId;
  else if (f.unitId) body.orgUnitId = f.unitId;
  if (f.work) body.work = { ownerPersonId: f.ownerId, dueDate: f.due };
  return body;
}

/** Why the decision form is not ready, or null when it is. */
export function decisionProblem(f: { title: string; work: boolean; ownerId: string; due: string; meetingId?: string; unitId?: string }): 'title' | 'where' | 'work' | null {
  if (f.title.trim().length < 3) return 'title';
  if (!f.meetingId && !f.unitId) return 'where';
  if (f.work && (!f.ownerId || !f.due)) return 'work';
  return null;
}

/** Group a register by status so what waits for approval is read first. */
export function groupDecisions(list: DecisionItem[]): Array<{ status: DecisionStatus; items: DecisionItem[] }> {
  const order: DecisionStatus[] = ['DRAFT', 'APPROVED', 'REJECTED', 'WITHDRAWN'];
  return order.map((status) => ({ status, items: list.filter((d) => d.status === status) })).filter((g) => g.items.length > 0);
}
