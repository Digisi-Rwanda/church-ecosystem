/**
 * Offline reading. The schedule, the roster and "my assignments" are saved in this browser each time they load,
 * so a volunteer with no signal still sees the last version, labelled with when it was saved.
 *
 * Rules: only these read-only screens are kept; each copy belongs to the signed-in person (it carries a tag from
 * their sign-in and is ignored for anyone else); sign-out wipes everything; nothing is ever written offline.
 */
const PREFIX = 'adepr.offline.v1:';
const KEEP = /^\/api\/(schedule\/(month|church|mine|options)|protocol\/(roster|mine|months(\/[\d-]+)?)|assignments)(\?|$)/;

export const isKeptPath = (path: string): boolean => KEEP.test(path);

/** A short tag of the sign-in (the end of the token) so one person's copy is never shown to another. */
const tagOf = (token: string | null): string => (token ? token.slice(-16) : '');

interface Saved { at: number; tag: string; data: unknown }

export function saveOffline(path: string, token: string | null, data: unknown): void {
  if (!isKeptPath(path) || !token) return;
  try {
    localStorage.setItem(PREFIX + path, JSON.stringify({ at: Date.now(), tag: tagOf(token), data } satisfies Saved));
  } catch {
    /* storage full or blocked: offline reading is a bonus, never an error */
  }
}

export function readOffline<T>(path: string, token: string | null): { at: number; data: T } | null {
  if (!isKeptPath(path) || !token) return null;
  try {
    const raw = localStorage.getItem(PREFIX + path);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    return saved.tag === tagOf(token) ? { at: saved.at, data: saved.data as T } : null;
  } catch {
    return null;
  }
}

export function clearOffline(): void {
  try {
    const mine: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) mine.push(k);
    }
    mine.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
  setStaleSince(null);
}

/* What the screen is showing: live data (null) or a saved copy from this time. */
let staleSince: number | null = null;
const listeners = new Set<() => void>();
export function setStaleSince(at: number | null): void {
  if (staleSince === at) return;
  staleSince = at;
  listeners.forEach((l) => l());
}
export const getStaleSince = (): number | null => staleSince;
export function subscribeStale(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
