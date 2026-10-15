import type { ReactNode } from 'react';
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
  const rowIcon = (key: string | null, href: string | null): 'org' | 'clock' | 'document' | 'calendar' => {
    if (key === 'plans') return 'org';
    if (key === 'reportsLate' || key === 'overdue') return 'clock';
    if (href?.includes('/work/plans/') || href?.includes('/schedule')) return 'calendar';
    return 'document';
  };
  const LIMIT = 3;
  const total = waiting.length + urgent.length;
  const more = Math.max(0, total - LIMIT);
  const rows: Array<{ key: string; icon: ReturnType<typeof rowIcon>; href: string | null; node: ReactNode }> = [
    ...waiting.map((a, n) => ({ key: `${a.key}:${n}`, icon: rowIcon(a.key, a.href), href: a.href as string | null, node: <>{t(`door.dash.att.${a.key}` as 'door.dash.att.approvals', { title: a.title })}</> })),
    ...urgent.map((n) => ({ key: n.key, icon: rowIcon(null, safeHref(n.href)), href: safeHref(n.href), node: <><span>{n.title}</span>{n.body && <small className="feed-sub"> · {n.body}</small>}</> })),
  ].slice(0, LIMIT);
  return (
    <div className="panel feed feed-urgent" aria-labelledby="door-urgent-title">
      <header className="feed-head">
        <span className="feed-chip" aria-hidden="true"><Icon name="exclaim" size={20} /></span>
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
        <>
          <ul className="feed-list">
            {rows.map((r) => {
              const inner = (
                <>
                  <Icon name={r.icon} size={17} className="feed-ico" />
                  <span className="feed-main">{r.node}</span>
                  {r.href && <Icon name="chevron-right" size={16} className="feed-go" />}
                </>
              );
              return <li key={r.key}>{r.href ? <Link className="feed-row" to={r.href}>{inner}</Link> : <span className="feed-row">{inner}</span>}</li>;
            })}
          </ul>
          {more > 0 && (
            <Link className="feed-more" to={`/s/${systemId}/notifications?system=${encodeURIComponent(systemId)}`}>{t('door.urgent.more', { count: String(more) })}</Link>
          )}
        </>
      )}
    </div>
  );
}
