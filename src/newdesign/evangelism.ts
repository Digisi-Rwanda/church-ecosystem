import type { ContactStatus, PulpitSlotItem } from '../api/frontDoorApi';

const ERROR_KEYS: Record<string, string> = {
  BAD_PHONE: 'door.evang.err.phone',
  BAD_DATE: 'door.caring.err.date',
  FUTURE_DATE: 'door.caring.err.future',
  WRONG_STATE: 'door.evang.err.closed',
  ALREADY_EXISTS: 'door.evang.err.dayTaken',
  ONE_PREACHER: 'door.evang.err.onePreacher',
  BAD_INPUT: 'door.caring.err.input',
  FORBIDDEN: 'door.gov.err.notAllowed',
  NOT_FOUND: 'door.work.err.gone',
  PERSON_NOT_ACTIVE: 'door.gov.err.personNotActive',
};
export const evangErrorKey = (code: string | undefined): string => (code && ERROR_KEYS[code]) || 'door.people.actionFailed';

export const CONTACT_FILTERS: Array<'' | ContactStatus> = ['', 'NEW', 'FOLLOWING', 'JOINED', 'CLOSED'];
export const isOpenContact = (s: ContactStatus) => s === 'NEW' || s === 'FOLLOWING';

/** Services from today on come first, in date order; past ones follow, newest first. */
export function splitPlan(slots: PulpitSlotItem[], today: string): { upcoming: PulpitSlotItem[]; past: PulpitSlotItem[] } {
  const upcoming = slots.filter((s) => s.serviceOn >= today).sort((a, b) => a.serviceOn.localeCompare(b.serviceOn));
  const past = slots.filter((s) => s.serviceOn < today).sort((a, b) => b.serviceOn.localeCompare(a.serviceOn));
  return { upcoming, past };
}
