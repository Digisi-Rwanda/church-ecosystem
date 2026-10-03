/**
 * Memberships, positions and org units on the server (step 4, slice 2).
 * Same shape as peopleServerSync: the app keeps reading its in-memory lists,
 * this file keeps them equal to what the server lets the signed-in person see
 * and writes every change through the server first-class (with rollback).
 */
import {
  apiCreateMembership, apiCreateOrgUnit, apiCreatePosition, apiParticipationRecords,
  apiUpdateMembership, apiUpdateOrgUnit, apiUpdatePosition,
} from '../api/peopleApi';
import { getApiToken } from '../api/client';
import { isApiEnabled } from '../api/config';
import { MEMBERSHIPS, ORG_UNITS, POSITIONS } from '../data/seed';
import { persistPeopleLocalStore } from '../data/peopleLocalStore';
import type { Membership, OrgUnit, Position } from '../domain/types';
import { serverModuleEnabled } from '../lib/serverModules';
import { reportSyncError } from './peopleServerSync';

export const participationSyncEnabled = (): boolean =>
  serverModuleEnabled('participation') && isApiEnabled() && Boolean(getApiToken());

const pending = new Set<string>();

const strip = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T;

function replaceKeeping<T extends { id: string }>(target: T[], next: T[]) {
  const keep = target.filter((x) => pending.has(x.id));
  const ids = new Set(next.map((x) => x.id));
  target.splice(0, target.length, ...next, ...keep.filter((x) => !ids.has(x.id)));
}

let refreshing: Promise<boolean> | null = null;

export function refreshParticipationFromServer(): Promise<boolean> {
  if (!participationSyncEnabled()) return Promise.resolve(false);
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const r = await apiParticipationRecords();
      replaceKeeping(ORG_UNITS, r.orgUnits.map(strip) as unknown as OrgUnit[]);
      replaceKeeping(MEMBERSHIPS, r.memberships.map(strip) as unknown as Membership[]);
      replaceKeeping(POSITIONS, r.positions.map(strip) as unknown as Position[]);
      persistPeopleLocalStore();
      reportSyncError(null);
      return true;
    } catch (e) {
      reportSyncError(e instanceof Error ? e.message : 'Sync failed');
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function write(id: string, call: () => Promise<unknown>, fallback: string) {
  if (!participationSyncEnabled()) return;
  pending.add(id);
  try {
    await call();
    pending.delete(id);
    reportSyncError(null);
  } catch (e) {
    pending.delete(id);
    await refreshParticipationFromServer();
    reportSyncError(e instanceof Error ? e.message : fallback);
  }
}

const body = (o: object) => strip(o as Record<string, unknown>);

export const pushMembershipCreate = (m: Membership) =>
  write(m.id, () => apiCreateMembership(body(m)), 'Could not save membership');
export const pushMembershipUpdate = (id: string, patch: Partial<Membership>) =>
  write(id, () => apiUpdateMembership(id, body({ ...patch, id: undefined, personId: undefined })), 'Could not save membership');
export const pushPositionCreate = (p: Position) =>
  write(p.id, () => apiCreatePosition(body(p)), 'Could not save position');
export const pushPositionUpdate = (id: string, patch: Partial<Position>) =>
  write(id, () => apiUpdatePosition(id, body({ ...patch, id: undefined, personId: undefined })), 'Could not save position');
export const pushOrgUnitCreate = (u: OrgUnit) =>
  write(u.id, () => apiCreateOrgUnit(body(u)), 'Could not save org unit');
export const pushOrgUnitUpdate = (id: string, patch: Partial<OrgUnit>) =>
  write(id, () => apiUpdateOrgUnit(id, body({ ...patch, id: undefined })), 'Could not save org unit');

let timer: number | null = null;
export function startParticipationServerSync(intervalMs = 30_000) {
  if (timer != null || typeof window === 'undefined') return;
  const tick = () => {
    if (document.visibilityState === 'visible') void refreshParticipationFromServer();
  };
  timer = window.setInterval(tick, intervalMs);
  tick();
}
