import { useEffect } from 'react';
import { fetchAnnouncementSummary } from '../api/frontDoorApi';
import { useLoad } from './useLoad';

const CHANGED = 'door-announcements-changed';
/** Tell the counts on the screen that announcements were read, posted, changed or taken down. */
export const announcementsChanged = () => window.dispatchEvent(new Event(CHANGED));

/** The unread count and the latest few, for the Portal bar and the Portal home. Quietly empty when the server cannot be reached. */
export function useAnnouncementSummary() {
  const r = useLoad(fetchAnnouncementSummary, 'announce-summary');
  const { reload } = r;
  useEffect(() => {
    window.addEventListener(CHANGED, reload);
    return () => window.removeEventListener(CHANGED, reload);
  }, [reload]);
  return { unread: r.data?.unread ?? 0, latest: r.data?.latest ?? [], loading: r.loading, failed: r.failed, reload };
}
