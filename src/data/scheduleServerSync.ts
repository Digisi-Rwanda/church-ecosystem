/**
 * Keeps the Music and Protocol documents in step with the server, so the
 * Music team, the Protocol coordinator and the President/VP see the same
 * data from any browser.
 *
 *  - after sign-in (an API token exists) each document is pulled;
 *  - local changes are pushed with the version they started from;
 *  - a push based on an older version is refused by the server (409): the
 *    two versions are merged row by row (changes to different rows/fields from
 *    both people are kept); only when both edited the very same value does the
 *    server version win, and the person is told;
 *  - while the page is visible, the server version is polled every few
 *    seconds so other people's changes arrive without a manual refresh.
 *
 * Without an API (no VITE_API_URL) or without a token (seed-only demo login)
 * nothing happens and the modules stay browser-local, as before.
 */
import {
  ApiError,
  apiGetProtocolOffices,
  apiGetScheduleDoc,
  apiGetScheduleDocVersion,
  apiPutScheduleDoc,
  getScheduleSyncToken,
  isApiEnabled,
} from '../api';
import type { ScheduleDocKey } from '../api/scheduleStateApi';
import { exportCollections, importCollections } from './localDomainStore';
import { merge3 } from './mergeDoc';
import { applyProtocolOffices } from './protocolOffices';

const PROTOCOL_COLLECTIONS = [
  'protocolRoster',
  'protocolServices',
  'protocolMonthPlans',
  'protocolTeamSlots',
  'protocolHistory',
  'protocolAttendance',
  'protocolAbsenceRequests',
  'protocolFillInOffers',
  'protocolSwapProposals',
  'protocolServiceReports',
  'protocolContributions',
  'protocolNotifications',
  'protocolActivity',
];

const DOCS: Record<
  ScheduleDocKey,
  { names: string[]; omit?: Record<string, string[]> }
> = {
  // The Music workspace canvas is one person's work in progress: not shared.
  music: { names: ['musicSchedule'], omit: { musicSchedule: ['canvas'] } },
  protocol: { names: PROTOCOL_COLLECTIONS },
};

export const SCHEDULE_SYNCED_EVENT = 'adepr:schedule-synced';
export type ScheduleSyncDetail = {
  key: ScheduleDocKey;
  /**
   * 'remote'   = newer shared data was loaded;
   * 'merged'   = our change and a newer shared version were combined, nothing lost;
   * 'conflict' = both edited the same value, the shared one won.
   */
  reason: 'remote' | 'merged' | 'conflict';
  /** How many values were lost to the shared version (conflict only). */
  conflicts?: number;
};

type DocState = {
  version: number;
  /** JSON of what the server has (or we last sent). */
  synced: string;
  /** Parsed copy of `synced`: the common ancestor for merging. */
  base: Record<string, unknown>;
  busy: boolean;
  ready: boolean;
};

const state: Record<ScheduleDocKey, DocState> = {
  music: { version: 0, synced: '', base: {}, busy: false, ready: false },
  protocol: { version: 0, synced: '', base: {}, busy: false, ready: false },
};

function snapshot(key: ScheduleDocKey) {
  const d = DOCS[key];
  return exportCollections(d.names, { omit: d.omit });
}

function announce(detail: ScheduleSyncDetail) {
  window.dispatchEvent(new CustomEvent(SCHEDULE_SYNCED_EVENT, { detail }));
}

async function pull(key: ScheduleDocKey, reason: ScheduleSyncDetail['reason']) {
  const doc = await apiGetScheduleDoc(key);
  const st = state[key];
  if (doc.version === 0 || !doc.data) {
    // Nothing shared yet: this browser's data becomes the shared start.
    st.version = 0;
    st.synced = '';
    st.base = {};
    st.ready = true;
    return;
  }
  importCollections(DOCS[key].names, doc.data);
  st.version = doc.version;
  st.base = snapshot(key);
  st.synced = JSON.stringify(st.base);
  st.ready = true;
  announce({ key, reason });
}

async function push(key: ScheduleDocKey) {
  const st = state[key];
  for (let attempt = 0; attempt < 3; attempt++) {
    const data = snapshot(key);
    const json = JSON.stringify(data);
    if (json === st.synced) return;
    try {
      const r = await apiPutScheduleDoc(key, st.version, data);
      st.version = r.version;
      st.base = data;
      st.synced = json;
      return;
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 409) throw e;
      // Someone saved first: combine their version with ours, then retry.
      const remote = await apiGetScheduleDoc(key);
      if (remote.version === 0 || !remote.data) {
        st.version = 0;
        continue;
      }
      const merged = merge3(st.base, data, remote.data);
      importCollections(DOCS[key].names, merged.value as Record<string, unknown>);
      st.version = remote.version;
      st.base = remote.data as Record<string, unknown>;
      st.synced = JSON.stringify(remote.data);
      announce(
        merged.conflicts > 0
          ? { key, reason: 'conflict', conflicts: merged.conflicts }
          : { key, reason: 'merged' },
      );
      // loop: our merged state now differs from `synced`, so it is pushed.
    }
  }
}

let lastOffices = 0;
/** Protocol offices come from the server's positions; refresh them now and then. */
async function syncOffices(force = false) {
  const now = Date.now();
  if (!force && now - lastOffices < 30_000) return;
  lastOffices = now;
  try {
    const r = await apiGetProtocolOffices();
    if (applyProtocolOffices(r.offices)) announce({ key: 'protocol', reason: 'remote' });
  } catch {
    // Offline or an older server without the route: keep what we have.
  }
}

async function syncOne(key: ScheduleDocKey) {
  const st = state[key];
  if (st.busy) return;
  st.busy = true;
  try {
    if (key === 'protocol') await syncOffices(!st.ready);
    if (!st.ready) {
      await pull(key, 'remote');
      return;
    }
    if (JSON.stringify(snapshot(key)) !== st.synced) {
      await push(key);
      return;
    }
    const v = await apiGetScheduleDocVersion(key);
    if (v.version !== st.version) await pull(key, 'remote');
  } catch (e) {
    // Offline / server down: stay local, try again on the next tick.
    if (!(e instanceof ApiError) || e.status !== 0) {
      console.warn(`[scheduleServerSync] ${key}:`, e);
    }
  } finally {
    st.busy = false;
  }
}

let timer: number | null = null;

/** Forget what we know (sign-out), so the next sign-in pulls afresh. */
export function resetScheduleServerSync() {
  lastOffices = 0;
  for (const k of Object.keys(state) as ScheduleDocKey[]) {
    state[k] = { version: 0, synced: '', base: {}, busy: false, ready: false };
  }
}

export function startScheduleServerSync(intervalMs = 4000) {
  if (timer != null || typeof window === 'undefined' || !isApiEnabled()) return;
  let hadToken = false;
  const tick = () => {
    if (document.visibilityState !== 'visible') return;
    const has = Boolean(getScheduleSyncToken());
    if (!has) {
      if (hadToken) resetScheduleServerSync();
      hadToken = false;
      return;
    }
    hadToken = true;
    void syncOne('music');
    void syncOne('protocol');
  };
  timer = window.setInterval(tick, intervalMs);
  tick();
}
