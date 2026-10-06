import { useCallback, useEffect, useState } from 'react';

type Done<T> = { key: string; ok: boolean; data?: T };

/**
 * Load something from the server for a screen. `key` names what is being loaded: when it
 * changes the screen shows "loading" again. Keep `load` free of anything but the key's inputs.
 */
export function useLoad<T>(load: () => Promise<T>, key: string) {
  const [done, setDone] = useState<Done<T> | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    load().then(
      (data) => live && setDone({ key: `${key}#${tick}`, ok: true, data }),
      () => live && setDone({ key: `${key}#${tick}`, ok: false }),
    );
    return () => {
      live = false;
    };
    // `load` is rebuilt every render; `key` and `tick` say when to load again.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
  const current = done && done.key === `${key}#${tick}` ? done : null;
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { loading: !current, failed: !!current && !current.ok, data: current?.ok ? current.data : undefined, reload };
}
