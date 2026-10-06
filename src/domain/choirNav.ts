import type { ChoirOffice } from './types';
import {
  type ChoirNavKey,
  choirNavKeysForOffice,
  choirOfficeMayAccess as mayAccess,
} from './choirAccess';

export type { ChoirNavKey };

export type ChoirNavItem = {
  to: string;
  label: string;
  end?: boolean;
  key: ChoirNavKey;
};

/** Full Choir nav catalog — filtered per office before render. */
export const CHOIR_NAV_CATALOG: ChoirNavItem[] = [
  { key: 'home', to: '/systems/choir', label: 'Home', end: true },
  { key: 'mission', to: '/systems/choir/mission', label: 'Mission' },
  { key: 'people', to: '/systems/choir/people', label: 'People' },
  { key: 'families', to: '/systems/choir/families', label: 'Teams' },
  { key: 'repertoire', to: '/systems/choir/repertoire', label: 'Repertoire' },
  { key: 'rehearsals', to: '/systems/choir/rehearsals', label: 'Rehearsals' },
];

export function choirNavForOffice(office: ChoirOffice | null): ChoirNavItem[] {
  const keys = new Set(choirNavKeysForOffice(office));
  return CHOIR_NAV_CATALOG.filter((item) => keys.has(item.key));
}

export function choirOfficeMayAccess(
  office: ChoirOffice | null,
  key: ChoirNavKey,
): boolean {
  return mayAccess(office, key);
}
