import type { ChoirRole, MusicServiceKind } from '../api/frontDoorApi';

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
};
export const musicErrorKey = (code: string | undefined): string => (code && ERROR_KEYS[code]) || 'door.people.actionFailed';

export const ROLES: ChoirRole[] = ['PRIMARY', 'SECONDARY', 'CHILDREN', 'WORSHIP'];
export const SERVICE_KINDS: MusicServiceKind[] = ['SS1', 'SS2', 'TUESDAY', 'FRIDAY', 'IGABURO'];
const ALLOWED: Record<MusicServiceKind, ChoirRole[]> = {
  SS1: ['PRIMARY', 'SECONDARY', 'CHILDREN'], SS2: ['PRIMARY', 'SECONDARY'], TUESDAY: ['PRIMARY', 'SECONDARY', 'WORSHIP'], FRIDAY: ['PRIMARY', 'SECONDARY'], IGABURO: ['PRIMARY', 'SECONDARY'],
};
/** The same rule the server enforces, used to offer only choirs that may serve at a service. */
export const mayServe = (role: ChoirRole, kind: MusicServiceKind) => ALLOWED[kind].includes(role);

export const thisMonth = (now = new Date()) => now.toISOString().slice(0, 7);
/** The month before or after a YYYY-MM key. */
export function shiftMonth(key: string, by: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}
