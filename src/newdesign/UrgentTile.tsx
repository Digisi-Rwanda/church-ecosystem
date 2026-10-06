import { Link } from 'react-router-dom';
import { useT } from '../i18n/I18nContext';
import { safeHref } from './notices';
import { useNoticeSummary } from './useNoticeSummary';

/** The Urgent tile on a system's Home: the few things waiting for this person here, most urgent first. */
export function UrgentTile({ systemId }: { systemId: string }) {
  const t = useT();
  const { urgent, counts, loading, failed } = useNoticeSummary(systemId);
  const unread = counts?.bySystem[systemId] ?? 0;
  return (
    <div className="panel door-urgent" aria-labelledby="door-urgent-title">
      <div className="door-row">
        <h3 id="door-urgent-title">{t('door.urgent.title')}</h3>
        <Link className="btn ghost sm" to={`/portal/notifications?system=${encodeURIComponent(systemId)}`}>
          {t('door.urgent.seeAll')}
          {unread > 0 && <span className="door-badge">{unread > 99 ? '99+' : unread}</span>}
        </Link>
      </div>
      {loading ? (
        <p className="muted" role="status">
          {t('door.people.loading')}
        </p>
      ) : failed ? (
        <p className="muted">{t('door.people.error')}</p>
      ) : urgent.length === 0 ? (
        <p className="muted">{t('door.urgent.none')}</p>
      ) : (
        <ul className="door-list">
          {urgent.map((n) => {
            const href = safeHref(n.href);
            return (
              <li key={n.key}>
                {href ? <Link to={href}>{n.title}</Link> : n.title}
                {n.body && <span className="muted"> · {n.body}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
