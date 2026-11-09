/**
 * A few seconds of memory for the lookups every request repeats (is this person still active,
 * who holds which office). Any write through the API empties it at once, so a change made here
 * shows on the very next read. It is on only in production: tests and local work always read fresh.
 */
const TTL_MS = 10_000;
const on = () => process.env.NODE_ENV === 'production';

const store = new Map<string, { at: number; value: Promise<unknown> }>();

export function remember<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!on()) return load();
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>;
  const value = load();
  store.set(key, { at: Date.now(), value });
  value.catch(() => store.delete(key));
  return value;
}

export const forgetAll = () => store.clear();
