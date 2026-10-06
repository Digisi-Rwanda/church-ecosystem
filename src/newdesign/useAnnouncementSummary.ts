import { fetchAnnouncementSummary } from '../api/frontDoorApi';
import { useLoad } from './useLoad';

/** The unread count and the latest few, for the Portal bar and the Portal home. Quietly empty when the server cannot be reached. */
export function useAnnouncementSummary() {
  const r = useLoad(fetchAnnouncementSummary, 'announce-summary');
  return { unread: r.data?.unread ?? 0, latest: r.data?.latest ?? [], loading: r.loading, failed: r.failed, reload: r.reload };
}
