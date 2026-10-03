/**
 * Browser-local persistence for all in-memory domain collections.
 * Survives refresh (localStorage). Not a multi-device DB — that stays on the API.
 */

type KeyOf<T> = (item: T) => string;

type ArrayCollection<T> = {
  kind: 'array';
  name: string;
  mode: 'merge' | 'replace';
  get: () => T[];
  keyOf: KeyOf<T>;
  seedKeys: Set<string>;
  /** JSON snapshot of seed rows — used to detect in-place edits. */
  seedJson: Map<string, string>;
  overrides: Set<string>;
};

type BlobCollection = {
  kind: 'blob';
  name: string;
  get: () => unknown;
  set: (value: unknown) => void;
};

type Collection = ArrayCollection<any> | BlobCollection;

const STORAGE_KEY = 'adepr.kacyiru.domain.local.v1';
const LEGACY_PEOPLE_KEY = 'adepr.kacyiru.people.local.v1';

const collections: Collection[] = [];
let hydrated = false;
let persistTimer: number | null = null;
let autoInstalled = false;

type StoredBundle = {
  version: 1;
  arrays: Record<string, unknown[]>;
  blobs: Record<string, unknown>;
};

function defaultKeyOf(item: Record<string, unknown>): string {
  if (typeof item.id === 'string' && item.id) {
    if (typeof item.systemId === 'string' && item.systemId) {
      return `${item.systemId}::${item.id}`;
    }
    return item.id;
  }
  if (typeof item.personId === 'string' && item.personId) {
    return `person:${item.personId}`;
  }
  return JSON.stringify(item);
}

export function registerLocalArray<T>(opts: {
  name: string;
  mode: 'merge' | 'replace';
  get: () => T[];
  keyOf?: KeyOf<T>;
}) {
  const keyOf = opts.keyOf ?? ((item: T) => defaultKeyOf(item as Record<string, unknown>));
  const seedKeys = new Set<string>();
  const seedJson = new Map<string, string>();
  for (const item of opts.get()) {
    const key = keyOf(item);
    seedKeys.add(key);
    seedJson.set(key, JSON.stringify(item));
  }
  collections.push({
    kind: 'array',
    name: opts.name,
    mode: opts.mode,
    get: opts.get,
    keyOf,
    seedKeys,
    seedJson,
    overrides: new Set(),
  });
}

export function registerLocalBlob(opts: {
  name: string;
  get: () => unknown;
  set: (value: unknown) => void;
}) {
  collections.push({
    kind: 'blob',
    name: opts.name,
    get: opts.get,
    set: opts.set,
  });
}

/** Mark a seed-backed row as edited so merge mode keeps the override. */
export function markLocalOverride(collectionName: string, key: string) {
  const col = collections.find(
    (c): c is ArrayCollection<any> => c.kind === 'array' && c.name === collectionName,
  );
  if (col) col.overrides.add(key);
}

function replaceInPlace<T>(arr: T[], items: T[]) {
  arr.splice(0, arr.length, ...items);
}

function mergeInto<T>(col: ArrayCollection<T>, stored: T[]) {
  const live = col.get();
  for (const item of stored) {
    const key = col.keyOf(item);
    const i = live.findIndex((x) => col.keyOf(x) === key);
    if (i >= 0) {
      live[i] = item;
      if (col.seedKeys.has(key)) col.overrides.add(key);
    } else {
      live.push(item);
    }
  }
}

function readBundle(): StoredBundle | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredBundle;
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

function stripHeavyFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const copy = { ...(row as Record<string, unknown>) };
      if (typeof copy.fileDataUrl === 'string' && copy.fileDataUrl.length > 8_000) {
        delete copy.fileDataUrl;
      }
      if (typeof copy.bodyHtml === 'string' && copy.bodyHtml.length > 50_000) {
        copy.bodyHtml = String(copy.bodyHtml).slice(0, 50_000);
      }
      return copy;
    });
  }
  return value;
}

function writeBundle(bundle: StoredBundle) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bundle));
    return;
  } catch {
    // Quota — strip bulky fields and retry.
  }
  const stripped: StoredBundle = {
    version: 1,
    arrays: {},
    blobs: bundle.blobs,
  };
  for (const [k, v] of Object.entries(bundle.arrays)) {
    stripped.arrays[k] = stripHeavyFields(v) as unknown[];
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped));
    console.warn('[localDomainStore] Saved with bulky fields trimmed (quota).');
  } catch (err) {
    console.warn('[localDomainStore] Could not persist domain state.', err);
  }
}

function migrateLegacyPeopleBundle() {
  try {
    const raw = localStorage.getItem(LEGACY_PEOPLE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as {
      people?: unknown[];
      memberships?: unknown[];
      familyLinks?: unknown[];
      baptisms?: unknown[];
      marriages?: unknown[];
      timeline?: unknown[];
      documents?: unknown[];
      employment?: unknown[];
      education?: unknown[];
      talents?: unknown[];
      spiritualGifts?: unknown[];
    };
    const existing = readBundle();
    if (existing?.arrays?.people?.length) {
      localStorage.removeItem(LEGACY_PEOPLE_KEY);
      return;
    }
    const arrays: Record<string, unknown[]> = { ...(existing?.arrays ?? {}) };
    const map: Record<string, unknown[] | undefined> = {
      people: data.people,
      memberships: data.memberships,
      personFamilyLinks: data.familyLinks,
      personBaptisms: data.baptisms,
      personMarriages: data.marriages,
      personTimeline: data.timeline,
      personDocuments: data.documents,
      personEmployment: data.employment,
      personEducation: data.education,
      personTalents: data.talents,
      personSpiritualGifts: data.spiritualGifts,
    };
    for (const [name, rows] of Object.entries(map)) {
      if (rows?.length) arrays[name] = rows;
    }
    writeBundle({
      version: 1,
      arrays,
      blobs: existing?.blobs ?? {},
    });
    localStorage.removeItem(LEGACY_PEOPLE_KEY);
  } catch {
    /* ignore legacy migrate errors */
  }
}

export function hydrateLocalDomain() {
  if (hydrated) return;
  hydrated = true;
  migrateLegacyPeopleBundle();

  const data = readBundle();
  if (!data) return;

  for (const col of collections) {
    if (col.kind === 'blob') {
      if (Object.prototype.hasOwnProperty.call(data.blobs, col.name)) {
        try {
          col.set(data.blobs[col.name]);
        } catch (err) {
          console.warn(`[localDomainStore] Failed blob hydrate: ${col.name}`, err);
        }
      }
      continue;
    }
    const stored = data.arrays[col.name];
    if (!stored) continue;
    try {
      if (col.mode === 'replace') {
        replaceInPlace(col.get(), stored);
      } else {
        mergeInto(col, stored);
      }
    } catch (err) {
      console.warn(`[localDomainStore] Failed array hydrate: ${col.name}`, err);
    }
  }
}

function snapshotArrays(): Record<string, unknown[]> {
  const arrays: Record<string, unknown[]> = {};
  for (const col of collections) {
    if (col.kind !== 'array') continue;
    const live = col.get();
    if (col.mode === 'replace') {
      if (live.length === 0) continue;
      arrays[col.name] = live.map((x) => ({ ...x }));
      continue;
    }
    const rows = live.filter((item) => {
      const key = col.keyOf(item);
      if (!col.seedKeys.has(key)) return true;
      if (col.overrides.has(key)) return true;
      const seed = col.seedJson.get(key);
      return seed !== JSON.stringify(item);
    });
    if (rows.length === 0) continue;
    arrays[col.name] = rows.map((x) => ({ ...x }));
  }
  return arrays;
}

function snapshotBlobs(): Record<string, unknown> {
  const blobs: Record<string, unknown> = {};
  for (const col of collections) {
    if (col.kind !== 'blob') continue;
    const value = col.get();
    if (value == null) continue;
    blobs[col.name] = value;
  }
  return blobs;
}

/** Immediate flush of all registered domain collections. */
export function persistLocalDomain() {
  if (!hydrated && collections.length === 0) return;
  writeBundle({
    version: 1,
    arrays: snapshotArrays(),
    blobs: snapshotBlobs(),
  });
}

/** Debounced persist — safe to call after every mutation. */
export function scheduleLocalDomainPersist() {
  if (persistTimer != null) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    persistLocalDomain();
  }, 120);
}

/** Flush now (e.g. pagehide). */
export function flushLocalDomainPersist() {
  if (persistTimer != null) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  persistLocalDomain();
}

/**
 * Catch-all so create/update survives refresh even when a service forgets to
 * call scheduleLocalDomainPersist.
 */
export function installLocalDomainAutoPersist() {
  if (autoInstalled || typeof window === 'undefined') return;
  autoInstalled = true;

  const flush = () => flushLocalDomainPersist();
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.setInterval(() => {
    if (document.visibilityState === 'visible') persistLocalDomain();
  }, 2000);
}

// ---- Shared (server) documents ------------------------------------------
// A document is a named group of registered collections that is also kept on
// the server so every browser sees the same data.

/** Current value of the named collections, as plain JSON-able data. */
export function exportCollections(
  names: string[],
  opts: { omit?: Record<string, string[]> } = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of collections) {
    if (!names.includes(col.name)) continue;
    if (col.kind === 'blob') {
      const value = col.get();
      if (value == null) continue;
      const omit = opts.omit?.[col.name];
      if (omit && typeof value === 'object') {
        const copy = { ...(value as Record<string, unknown>) };
        for (const k of omit) delete copy[k];
        out[col.name] = copy;
      } else {
        out[col.name] = value;
      }
    } else {
      // Include empty arrays: an emptied collection is a real state.
      out[col.name] = col.get().map((x) => ({ ...x }));
    }
  }
  return out;
}

/** Replace the named collections with a document received from the server. */
export function importCollections(
  names: string[],
  data: Record<string, unknown>,
) {
  for (const col of collections) {
    if (!names.includes(col.name)) continue;
    if (!Object.prototype.hasOwnProperty.call(data, col.name)) continue;
    try {
      if (col.kind === 'blob') col.set(data[col.name]);
      else if (Array.isArray(data[col.name])) {
        replaceInPlace(col.get(), data[col.name] as unknown[]);
      }
    } catch (err) {
      console.warn(`[localDomainStore] Failed import: ${col.name}`, err);
    }
  }
  persistLocalDomain();
}

// ---- Backup of everything this browser holds ---------------------------

/** Names of every registered browser-local collection. */
export function registeredCollectionNames(): string[] {
  return collections.map((c) => c.name);
}

/** Whole browser-local dataset as one JSON-able object (for "download my data"). */
export function exportAllLocalData(): {
  format: 'church-ecosystem-local-backup';
  version: 1;
  exportedAt: string;
  collections: Record<string, unknown>;
} {
  return {
    format: 'church-ecosystem-local-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    collections: exportCollections(registeredCollectionNames()),
  };
}
