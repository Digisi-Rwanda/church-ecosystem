import { fetchNoticeSummary } from '../api/frontDoorApi';
import { useLoad } from './useLoad';

/** The unread count and the most urgent things, optionally for one system. Quietly empty when the server cannot be reached. */
export function useNoticeSummary(system?: string) {
  const r = useLoad(() => fetchNoticeSummary(system), `notice-summary|${system ?? ''}`);
  return { counts: r.data?.counts, urgent: r.data?.urgent ?? [], loading: r.loading, failed: r.failed, reload: r.reload };
}
