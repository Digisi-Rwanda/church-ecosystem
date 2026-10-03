/**
 * People on the server (step 4, slice 1).
 *
 * The app keeps reading people from a synchronous in-memory list (PEOPLE), so
 * 60+ screens work unchanged. When the "people" module is switched on this
 * file keeps that list equal to what the server allows the signed-in person
 * to see, and sends every create/edit to the server.
 *
 *  - Leader  → everyone, all fields   - Catechist → everyone, basic fields
 *  - others  → only their own record
 */
import {
  apiCreatePerson,
  apiPeopleRecords,
  apiUpdatePerson,
  type ServerPerson,
} from '../api/peopleApi';
import { getApiToken } from '../api/client';
import { isApiEnabled } from '../api/config';
import { PEOPLE } from '../data/seed';
import { persistPeopleLocalStore } from '../data/peopleLocalStore';
import type { Person } from '../domain/types';
import { serverModuleEnabled } from '../lib/serverModules';

export const peopleSyncEnabled = (): boolean =>
  serverModuleEnabled('people') && isApiEnabled() && Boolean(getApiToken());

/** Ids created or edited here that the server has not confirmed yet. */
const pending = new Set<string>();
let lastError: string | null = null;
const listeners = new Set<(msg: string | null) => void>();

export function peopleSyncError(): string | null {
  return lastError;
}
export function onPeopleSyncError(fn: (msg: string | null) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function setError(msg: string | null) {
  lastError = msg;
  listeners.forEach((fn) => fn(msg));
}

const clean = <T>(v: T | null | undefined): T | undefined =>
  v === null || v === undefined ? undefined : v;

export function fromServer(s: ServerPerson): Person {
  return {
    id: s.id,
    fullName: s.fullName,
    preferredName: clean(s.preferredName),
    phone: clean(s.phone),
    email: clean(s.email),
    dateOfBirth: clean(s.dateOfBirth),
    gender: clean(s.gender) as Person['gender'],
    address: clean(s.address),
    nationalId: clean(s.nationalId),
    joinedChurchOn: clean(s.joinedChurchOn),
    pastoralNotes: clean(s.pastoralNotes),
    photoUrl: clean(s.photoUrl),
    status: s.status ?? 'ACTIVE',
    createdAt: (s.createdAt ?? new Date().toISOString()).slice(0, 10),
  };
}

const WRITABLE = [
  'fullName', 'preferredName', 'phone', 'email', 'status', 'dateOfBirth', 'gender',
  'address', 'nationalId', 'joinedChurchOn', 'pastoralNotes', 'photoUrl',
] as const;

/** Only fields the server knows; blank text clears the field. */
export function toServerBody(p: Partial<Person>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of WRITABLE) {
    const v = (p as Record<string, unknown>)[k];
    if (v === undefined) continue;
    out[k] = v === '' && k !== 'email' && k !== 'fullName' ? null : v;
  }
  return out;
}

let refreshing: Promise<boolean> | null = null;

/** Pull the server's view into PEOPLE. Returns false when nothing was changed. */
export function refreshPeopleFromServer(): Promise<boolean> {
  if (!peopleSyncEnabled()) return Promise.resolve(false);
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const rows: ServerPerson[] = [];
      let tier: 'FULL' | 'BASIC' | 'SELF' = 'SELF';
      let offset = 0;
      for (let guard = 0; guard < 100; guard++) {
        const page = await apiPeopleRecords(offset, 200);
        tier = page.tier;
        rows.push(...page.people);
        offset += page.people.length;
        if (!page.people.length || offset >= page.total) break;
      }
      const seen = new Set<string>();
      for (const s of rows) {
        seen.add(s.id);
        if (pending.has(s.id)) continue;
        const next = fromServer(s);
        const i = PEOPLE.findIndex((p) => p.id === s.id);
        if (i >= 0) PEOPLE[i] = next;
        else PEOPLE.push(next);
      }
      // A complete list is the truth: drop people the server does not have.
      if (tier !== 'SELF') {
        for (let i = PEOPLE.length - 1; i >= 0; i--) {
          const id = PEOPLE[i].id;
          if (!seen.has(id) && !pending.has(id)) PEOPLE.splice(i, 1);
        }
      }
      // Someone who may only see themself must not keep other people's
      // identity details from an earlier sign-in on this browser.
      if (tier === 'SELF') {
        for (const p of PEOPLE) {
          if (seen.has(p.id)) continue;
          p.dateOfBirth = p.nationalId = p.address = p.pastoralNotes = undefined;
          p.gender = p.joinedChurchOn = p.photoUrl = undefined;
        }
      }
      persistPeopleLocalStore();
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'People sync failed');
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function rollback(id: string, message: string) {
  pending.delete(id);
  await refreshPeopleFromServer();
  setError(message);
}

/** Send a new person to the server (already added locally). */
export async function pushPersonCreate(p: Person): Promise<void> {
  if (!peopleSyncEnabled()) return;
  pending.add(p.id);
  try {
    await apiCreatePerson({ id: p.id, ...toServerBody(p), email: p.email || undefined });
    pending.delete(p.id);
    setError(null);
  } catch (e) {
    await rollback(p.id, e instanceof Error ? e.message : 'Could not save person');
  }
}

/** Send an edit to the server (already applied locally). */
export async function pushPersonUpdate(id: string, patch: Partial<Person>): Promise<void> {
  if (!peopleSyncEnabled()) return;
  const body = toServerBody(patch);
  if (!Object.keys(body).length) return;
  pending.add(id);
  try {
    await apiUpdatePerson(id, body);
    pending.delete(id);
    setError(null);
  } catch (e) {
    await rollback(id, e instanceof Error ? e.message : 'Could not save changes');
  }
}

let timer: number | null = null;

export function startPeopleServerSync(intervalMs = 30_000) {
  if (timer != null || typeof window === 'undefined') return;
  const tick = () => {
    if (document.visibilityState === 'visible') void refreshPeopleFromServer();
  };
  timer = window.setInterval(tick, intervalMs);
  tick();
}

export function resetPeopleServerSync() {
  pending.clear();
  setError(null);
}
