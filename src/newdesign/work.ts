import type { WorkItem, WorkStatus } from '../api/frontDoorApi';

export const workStatusKey = (s: WorkStatus) => `door.work.status.${s}` as const;

/** The step buttons a person is offered on one item. */
export function workActions(w: Pick<WorkItem, 'status' | 'canMove' | 'canManage'>): Array<'start' | 'done' | 'cancel' | 'reopen' | 'back'> {
  if (w.status === 'TODO') return w.canMove ? ['start', 'done', 'cancel'] : [];
  if (w.status === 'IN_PROGRESS') return w.canMove ? ['done', 'back', 'cancel'] : [];
  return w.canManage ? ['reopen'] : [];
}

/** Open work first, soonest due first; undated last; closed work after. */
export function sortWork(list: WorkItem[]): WorkItem[] {
  const open = (w: WorkItem) => (w.status === 'TODO' || w.status === 'IN_PROGRESS' ? 0 : 1);
  const due = (w: WorkItem) => (w.dueDate ? new Date(w.dueDate).getTime() : Infinity);
  return [...list].sort((a, b) => open(a) - open(b) || due(a) - due(b) || a.title.localeCompare(b.title));
}

/** The day of a due date in church time (UTC+2) as a `date` input value, and back. */
export const dueToInput = (iso: string | null): string => (iso ? new Date(new Date(iso).getTime() + 2 * 3600 * 1000).toISOString().slice(0, 10) : '');
export const inputToDue = (v: string): string | null => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T21:59:00Z`).toISOString() : null);

const ERROR_KEYS: Record<string, string> = {
  DONE_LOCKED: 'door.work.err.doneLocked',
  NOTE_REQUIRED: 'door.work.err.noteRequired',
  WRONG_STATE: 'door.work.err.wrongState',
  PERSON_NOT_ACTIVE: 'door.gov.err.personNotActive',
  UNIT_HAS_NO_SYSTEM: 'door.gov.err.noSystem',
  FORBIDDEN: 'door.gov.err.notAllowed',
  NOT_FOUND: 'door.work.err.gone',
};
export const workErrorKey = (code: string | undefined): string => (code && ERROR_KEYS[code]) || 'door.people.actionFailed';
