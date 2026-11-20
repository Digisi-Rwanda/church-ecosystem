import { useEffect, useSyncExternalStore } from 'react';

/**
 * A page that sits under a menu place it cannot be told apart from by its address (a plan page is
 * `/work/plans/<id>` whether it is a program, an event or a project) says which place to light.
 */
let hint: string | null = null;
const listeners = new Set<() => void>();
const set = (next: string | null) => {
  if (hint === next) return;
  hint = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const usePlaceHint = (): string | null => useSyncExternalStore(subscribe, () => hint, () => null);

/** Call from a page: light this place of the menu while the page is open. */
export function useLightPlace(key: string | null | undefined): void {
  useEffect(() => {
    set(key ?? null);
    return () => set(null);
  }, [key]);
}

/** The menu place that holds a plan of this type. */
export const placeOfPlanType = (planType: string | null | undefined): string | null =>
  planType === 'PROGRAM' ? 'programs' : planType === 'EVENT' ? 'events' : planType === 'PROJECT' ? 'projects' : null;
