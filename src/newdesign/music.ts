import { ApiError } from '../api/client';
import type { ChoirRole, MusicServiceKind, ScheduleService } from '../api/frontDoorApi';

const ERROR_KEYS: Record<string, string> = {
  ALREADY_EXISTS: 'door.music.err.exists',
  CHOIR_NOT_ALLOWED: 'door.music.err.notAllowed',
  OUTSIDE_MONTH: 'door.music.err.outsideMonth',
  EMPTY_PLAN: 'door.music.err.empty',
  WRONG_STATE: 'door.music.err.retired',
  BAD_DATE: 'door.caring.err.date',
  BAD_INPUT: 'door.caring.err.input',
  FORBIDDEN: 'door.gov.err.notAllowed',
  NOT_FOUND: 'door.work.err.gone',
  PERSON_NOT_ACTIVE: 'door.gov.err.personNotActive',
  PAST: 'door.music.err.past',
  DUPLICATE: 'door.music.err.duplicate',
  NOT_CONFIRMED: 'door.music.err.notConfirmed',
};
/** Codes where the server's own sentence says exactly which rule or choir is meant, so it is shown as it is. */
const SERVER_TEXT = new Set(['ENGINE', 'RULE', 'PUBLISHED', 'EMPTY']);
export const scheduleErrorText = (err: unknown): string | null => {
  const body = err instanceof ApiError ? (err.body as { code?: string; error?: string } | undefined) : undefined;
  return body?.code && SERVER_TEXT.has(body.code) && body.error ? body.error : null;
};
export const musicErrorKey = (code: string | undefined): string => (code && ERROR_KEYS[code]) || 'door.people.actionFailed';

export const ROLES: ChoirRole[] = ['PRIMARY', 'SECONDARY', 'CHILDREN', 'WORSHIP'];
export const SERVICE_KINDS: MusicServiceKind[] = ['SS1', 'SS2', 'TUESDAY', 'FRIDAY', 'IGABURO'];
/**
 * The hard rules of the old engine: children's choirs only at the first Sunday service, the worship
 * team only on Tuesday. Anything else may be tried, and the engine only warns (for example when a
 * Friday has more than one primary choir).
 */
export const mayServe = (role: ChoirRole, kind: MusicServiceKind) => (role === 'CHILDREN' ? kind === 'SS1' : role === 'WORSHIP' ? kind === 'TUESDAY' : true);

export const thisMonth = (now = new Date()) => now.toISOString().slice(0, 7);
/** The month before or after a YYYY-MM key. */
export function shiftMonth(key: string, by: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** The services of one month, for a month-by-month view of a draft. */
export const servicesOfMonth = (services: ScheduleService[], month: string): ScheduleService[] => services.filter((x) => x.periodKey === month);

/** Choirs that may be added to a service: not already on it, and whose kind the service allows. */
export function addableUnits<T extends { id: string; kind: ChoirRole }>(units: T[], service: ScheduleService): T[] {
  return units.filter((u) => !service.units.some((x) => x.unitId === u.id) && mayServe(u.kind, service.kind));
}
