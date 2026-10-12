import { Link } from 'react-router-dom';
import { fetchDashboard } from '../api/frontDoorApi';
import { Icon } from '../components/ui/Icon';
import { useT } from '../i18n/I18nContext';
import { safeHref } from './notices';
import { useLoad } from './useLoad';
import { useNoticeSummary } from './useNoticeSummary';

/** The Urgent tile on a system's Home: the few things waiting for this person here, most urgent first. */
export function UrgentTile({ systemId }: { systemId: string }) {
  const t = useT();
  const { urgent, counts, loading, failed } = useNoticeSummary(systemId);
  const unread = counts?.bySystem[systemId] ?? 0;
  const dash = useLoad(() => fetchDashboard(systemId, 6), `dash|${systemId}|6`);
  const waiting = dash.data?.attention ?? [];
  const rowIcon = (href: string | null): 'task' | 'folder' | 'wallet' | 'alert' => (href?.includes('/reports') ? 'folder' : href?.includes('/money') ? 'wallet' : href?.includes('/work') ? 'task' : 'alert');
  return (
    <div className="panel feed feed-urgent" aria-labelledby="door-urgent-title">
      <header className="feed-head">
        <span className="feed-chip" aria-hidden="true"><Icon name="alert" size={18} /></span>
        <h3 id="door-urgent-title">{t('door.urgent.title')}</h3>
        <Link className="feed-link" to={`/s/${systemId}/notifications?system=${encodeURIComponent(systemId)}`}>
          {t('door.urgent.seeAll')}
          {unread > 0 && <span className="door-badge">{unread > 99 ? '99+' : unread}</span>}
          <Icon name="chevron-right" size={14} />
        </Link>
      </header>
      {loading ? (
        <p className="muted" role="status">{t('door.people.loading')}</p>
      ) : failed ? (
        <p className="muted">{t('door.people.error')}</p>
      ) : urgent.length === 0 && waiting.length === 0 ? (
        <p className="muted">{t('door.urgent.none')}</p>
      ) : (
        <ul className="feed-list">
          {waiting.map((a) => (
            <li key={a.key}>
              <Link className="feed-row" to={a.href}>
                <Icon name={rowIcon(a.href)} size={16} className="feed-ico" />
                <span className="feed-main"><strong>{a.count}</strong> {t(`door.dash.att.${a.key}` as 'door.dash.att.approvals', { count: String(a.count) }).replace(/^\d+\s*/, '')}</span>
                <Icon name="chevron-right" size={16} className="feed-go" />
              </Link>
            </li>
          ))}
          {urgent.map((n) => {
            const href = safeHref(n.href);
            const inner = (
              <>
                <Icon name={rowIcon(href)} size={16} className="feed-ico" />
                <span className="feed-main"><strong>{n.title}</strong>{n.body && <small>{n.body}</small>}</span>
                {href && <Icon name="chevron-right" size={16} className="feed-go" />}
              </>
            );
            return <li key={n.key}>{href ? <Link className="feed-row" to={href}>{inner}</Link> : <span className="feed-row">{inner}</span>}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
