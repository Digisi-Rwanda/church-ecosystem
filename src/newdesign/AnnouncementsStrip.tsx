import { Link } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';
import { useI18n, useT } from '../i18n/I18nContext';
import { AudienceLine } from './AnnouncementsPage';
import { useAnnouncementSummary } from './useAnnouncementSummary';

/** The latest few announcements. Opens the list inside the system it is shown in. Says nothing if the server cannot be reached. */
export function AnnouncementsStrip({ systemId }: { systemId?: string }) {
  const t = useT();
  const { locale } = useI18n();
  const { latest, unread, loading, failed } = useAnnouncementSummary();
  if (failed) return null;
  const to = systemId ? `/s/${systemId}/announcements` : '/portal/announcements';
  const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : '');
  return (
    <section className="panel feed feed-notes" aria-labelledby="door-strip-title">
      <header className="feed-head">
        <span className="feed-chip" aria-hidden="true"><Icon name="megaphone" size={20} /></span>
        <h3 id="door-strip-title">{t('door.announce.strip.title')}</h3>
        <Link className="feed-link" to={to}>
          {t('door.announce.strip.seeAll')}
          {unread > 0 && <span className="door-badge">{unread > 99 ? '99+' : unread}</span>}
          <Icon name="chevron-right" size={14} />
        </Link>
      </header>
      {loading ? (
        <p className="muted" role="status">{t('door.people.loading')}</p>
      ) : latest.length === 0 ? (
        <p className="muted">{t('door.announce.strip.none')}</p>
      ) : (
        <ul className="feed-list">
          {latest.slice(0, 3).map((a) => (
            <li key={a.id}>
              <Link className="feed-row" to={to}>
                <span className={`feed-dot${a.read ? '' : ' unread'}`} aria-hidden="true" />
                <span className="feed-main">
                  <span><strong>{a.title}</strong><span className="feed-aud"> · <AudienceLine item={a} /></span></span>
                  <small>{when(a.publishedAt)}</small>
                </span>
                <Icon name="chevron-right" size={16} className="feed-go" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
