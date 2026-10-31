import { useSyncExternalStore } from 'react';
import { getStaleSince, subscribeStale } from '../api/offlineStore';
import { useFormat, useT } from '../i18n/I18nContext';

/** Shown while the screen is a saved copy: says so plainly and when it was saved. */
export function OfflineBanner() {
  const t = useT();
  const fmt = useFormat();
  const at = useSyncExternalStore(subscribeStale, getStaleSince, () => null);
  if (at === null) return null;
  return (
    <div className="offline-banner no-print" role="status">
      {t('door.offline.banner', { date: fmt.date(at, 'short'), time: fmt.time(at) })}
    </div>
  );
}
