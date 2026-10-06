import { Link } from 'react-router-dom';
import { useT } from '../i18n/I18nContext';
import { AudienceLine } from './AnnouncementsPage';
import { useAnnouncementSummary } from './useAnnouncementSummary';

/** The latest few announcements on the Portal home. Says nothing at all if the server cannot be reached. */
export function AnnouncementsStrip() {
  const t = useT();
  const { latest, unread, loading, failed } = useAnnouncementSummary();
  if (failed) return null;
  return (
    <section className="panel door-strip" aria-labelledby="door-strip-title">
      <div className="door-row">
        <h3 id="door-strip-title">{t('door.announce.strip.title')}</h3>
        <Link className="btn ghost sm" to="/portal/announcements">
          {t('door.announce.strip.seeAll')}
          {unread > 0 && <span className="door-badge">{unread > 99 ? '99+' : unread}</span>}
        </Link>
      </div>
      {loading ? (
        <p className="muted" role="status">
          {t('door.people.loading')}
        </p>
      ) : latest.length === 0 ? (
        <p className="muted">{t('door.announce.strip.none')}</p>
      ) : (
        <ul className="door-list">
          {latest.map((a) => (
            <li key={a.id}>
              <Link to="/portal/announcements">{a.title}</Link>
              <span className="muted">
                {' '}
                · <AudienceLine item={a} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
