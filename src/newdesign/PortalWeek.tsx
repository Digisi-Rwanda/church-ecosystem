import { Link } from 'react-router-dom';
import { useT } from '../i18n/I18nContext';
import { useAnnouncementSummary } from './useAnnouncementSummary';
import { useNoticeSummary } from './useNoticeSummary';

/** The two counts that decide where a member goes first from the Portal: what waits for them and what is new. */
export function PortalWeek() {
  const t = useT();
  const notices = useNoticeSummary();
  const ann = useAnnouncementSummary();
  const waiting = notices.counts?.waiting.unread ?? 0;
  const tiles = [
    { key: 'waiting', value: waiting, to: '/portal/notifications?tab=waiting', warn: waiting > 0 },
    { key: 'announce', value: ann.unread, to: '/portal/announcements', warn: false },
  ];
  if (tiles.every((x) => x.value === 0)) return null;
  return (
    <section className="dx-week" aria-label={t('door.portal.week.title')}>
      <ul>
        {tiles.map((x) => (
          <li key={x.key} className={x.warn ? 'warn' : ''}>
            <Link to={x.to}>
              <strong>{x.value}</strong>
              <span>{t(`door.portal.week.${x.key}` as 'door.portal.week.waiting')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
