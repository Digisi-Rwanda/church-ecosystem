/**
 * Sign-out housekeeping: removes anything an earlier release (or the old app) saved in this browser for the
 * signed-in person. Interface preferences ("moriah.*") are kept. Safe to run when nothing is stored.
 */
export function clearBrowserData(): void {
  for (const store of [globalThis.localStorage, globalThis.sessionStorage]) {
    try {
      const doomed: string[] = [];
      for (let i = 0; i < store.length; i += 1) {
        const k = store.key(i);
        if (k && (k.startsWith('adepr.') || k === 'church-ecosystem-local-backup')) doomed.push(k);
      }
      doomed.forEach((k) => store.removeItem(k));
    } catch {
      /* storage blocked: nothing to clear */
    }
  }
}
