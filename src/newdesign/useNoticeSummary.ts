import { useEffect } from 'react';
import { fetchNoticeSummary } from '../api/frontDoorApi';
import { useLoad } from './useLoad';

const CHANGED = 'door-notices-changed';
/** Tell every count on the screen (the nav bar, the Portal) that notifications were marked read or unread. */
export const noticesChanged = () => window.dispatchEvent(new Event(CHANGED));

/** The unread count and the most urgent things, optionally for one system. Quietly empty when the server cannot be reached. */
export function useNoticeSummary(system?: string) {
  const r = useLoad(() => fetchNoticeSummary(system), `notice-summary|${system ?? ''}`);
  const { reload } = r;
  useEffect(() => {
    window.addEventListener(CHANGED, reload);
    return () => window.removeEventListener(CHANGED, reload);
  }, [reload]);
  return { counts: r.data?.counts, urgent: r.data?.urgent ?? [], loading: r.loading, failed: r.failed, reload };
}
