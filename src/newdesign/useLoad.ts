import { useCallback, useEffect, useState } from 'react';
import { errorKind, type ApiErrorKind } from '../api/client';

type Done<T> = { key: string; ok: boolean; data?: T; kind?: ApiErrorKind };

/**
 * What was last loaded under each key. A screen opened again shows this at once and refreshes it
 * quietly, so moving around the system does not keep showing "loading". It is emptied on sign-in
 * and sign-out, so one person's answers are never shown to the next.
 */
const seen = new Map<string, unknown>();
export const clearLoadCache = () => seen.clear();

/**
 * Load something from the server for a screen. `key` names what is being loaded: when it
 * changes the screen loads again, showing the last answer for that key meanwhile if there is one.
 * Keep `load` free of anything but the key's inputs.
 * `failed` is false, or the kind of failure (see `ApiErrorKind`), so a screen can say what actually happened.
 */
export function useLoad<T>(load: () => Promise<T>, key: string) {
  const [done, setDone] = useState<Done<T> | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    load().then(
      (data) => {
        seen.set(key, data);
        if (live) setDone({ key, ok: true, data });
      },
      (e) => live && setDone({ key, ok: false, kind: errorKind(e) }),
    );
    return () => {
      live = false;
    };
    // `load` is rebuilt every render; `key` and `tick` say when to load again.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
  const current = done && done.key === key ? done : null;
  const reload = useCallback(() => setTick((n) => n + 1), []);
  if (current) return { loading: false, failed: current.ok ? (false as const) : (current.kind ?? 'server'), data: current.ok ? current.data : undefined, reload };
  if (seen.has(key)) return { loading: false, failed: false as const, data: seen.get(key) as T, reload };
  return { loading: true, failed: false as const, data: undefined, reload };
}
