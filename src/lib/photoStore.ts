/**
 * Full-quality copies of profile pictures, kept in IndexedDB (browser storage
 * with far more room than localStorage) so they can be edited later without
 * losing detail. The small round picture stays on the person record.
 */
const DB = 'kacyiru-photos';
const STORE = 'sources';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  try {
    const db = await open();
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null; // private mode / blocked storage: fall back to the small picture
  }
}

export async function saveSource(personId: string, dataUrl: string) {
  await run('readwrite', (s) => s.put(dataUrl, personId));
}

export async function loadSource(personId: string): Promise<string | null> {
  const v = await run<unknown>('readonly', (s) => s.get(personId));
  return typeof v === 'string' ? v : null;
}

export async function deleteSource(personId: string) {
  await run('readwrite', (s) => s.delete(personId));
}
