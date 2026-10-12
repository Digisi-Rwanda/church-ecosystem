import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  fetchNotices,
  markNoticesRead,
  markNoticesUnread,
  type NoticeItem,
} from '../api/frontDoorApi';
import { EmptyState } from '../components/ui/EmptyState';
import { SearchSelect } from '../components/ui/SearchSelect';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { LoadState } from './LoadState';
import { dayLabel, safeHref, unreadKeys, withRead } from './notices';
import { useLoad } from './useLoad';
import { noticesChanged } from './useNoticeSummary';
import { PageHeader, SearchBox, Tabs, matchesText } from './kit';

type Tab = 'waiting' | 'info';

/** Notifications: the two tabs, Waiting for me and For information, with read state kept on the server. */
export function NotificationsPage() {
  const t = useT();
  const { portal } = useFrontDoor();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'info' ? 'info' : 'waiting';
  const system = params.get('system') ?? '';
  const { loading, failed, data, reload } = useLoad(() => fetchNotices({ system: system || undefined }), `notices|${system}`);
  // What the person has just marked, shown at once; the server keeps the real state.
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [showRead, setShowRead] = useState(false);
  const [text, setText] = useState('');
  const items: NoticeItem[] = (data?.items ?? []).map((i) => (i.key in marked ? { ...i, read: marked[i.key] } : i));
  const countOf = (k: 'waiting' | 'info') => items.filter((i) => i.kind === (k === 'waiting' ? 'WAITING_FOR_ME' : 'FOR_INFORMATION') && !i.read).length;
  const remember = (list: NoticeItem[], keys: string[], read: boolean) => {
    const next = withRead(list, keys, read);
    setMarked((m) => ({ ...m, ...Object.fromEntries(next.filter((i) => keys.includes(i.key)).map((i) => [i.key, read])) }));
  };
  const forget = (keys: string[]) => setMarked((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !keys.includes(k))));

  const systemName = (id: string) => portal.find((s) => s.id === id)?.shortName ?? id;
  const kind = tab === 'waiting' ? 'WAITING_FOR_ME' : 'FOR_INFORMATION';
  const ofKind = items.filter((i) => i.kind === kind);
  const unread = ofKind.filter((i) => !i.read).length;
  const shown = (showRead ? ofKind : ofKind.filter((i) => !i.read)).filter((i) => matchesText(text, i.title, i.body, systemName(i.systemId)));
  const readCount = ofKind.length - unread;

  const setTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p, { replace: true });
  };

  const toggle = async (n: NoticeItem) => {
    setError('');
    remember(items, [n.key], !n.read);
    try {
      if (n.read) await markNoticesUnread([n.key]);
      else await markNoticesRead({ keys: [n.key] });
      noticesChanged();
    } catch {
      forget([n.key]);
      setError(t('door.people.actionFailed'));
    }
  };
  const readAll = async () => {
    setError('');
    const keys = unreadKeys(ofKind);
    remember(items, keys, true);
    try {
      await markNoticesRead({ all: true, tab, system: system || undefined });
      noticesChanged();
    } catch {
      forget(keys);
      setError(t('door.people.actionFailed'));
    }
  };

  return (
    <section className="door-block" aria-labelledby="door-notices-title">
      <div className="door-row">
        <PageHeader id="door-notices-title" title={t('door.notices.title')} purpose={t('door.purpose.notices')} />
        <Link className="btn ghost sm" to="/portal/notifications/preferences">
          {t('door.notices.preferences')}
        </Link>
      </div>
      <Tabs
        label={t('door.notices.tabs')}
        value={tab}
        onChange={setTab}
        items={[
          { key: 'waiting', label: t('door.notices.tab.waiting'), count: countOf('waiting') },
          { key: 'info', label: t('door.notices.tab.info'), count: countOf('info') },
        ]}
      />
      <div className="door-filters">
        <SearchBox value={text} onChange={setText} label={t('door.search.notices')} clearLabel={t('door.search.clear')} />
        <SearchSelect
          label={t('door.notices.system')}
          name="system"
          value={system}
          empty={t('door.notices.allSystems')}
          placeholder={t('door.notices.systemSearch')}
          none={t('door.portal.search.none')}
          options={portal.map((s) => ({ value: s.id, label: s.shortName, hint: s.name }))}
          onChange={(v) => {
            const p = new URLSearchParams(params);
            if (v) p.set('system', v);
            else p.delete('system');
            setParams(p, { replace: true });
          }}
        />
        <label className="door-check">
          <input type="checkbox" checked={showRead} onChange={(e) => setShowRead(e.target.checked)} />
          {t('door.notices.showRead', { count: String(readCount) })}
        </label>
        <button type="button" className="btn secondary" disabled={unread === 0} onClick={() => void readAll()}>
          {t('door.notices.markAll')}
        </button>
      </div>
      {error && (
        <p className="door-error" role="alert">
          {error}
        </p>
      )}
      <LoadState loading={loading} failed={failed} retry={reload}>
        {shown.length === 0 ? (
          <EmptyState
            title={t(tab === 'waiting' ? 'door.notices.emptyWaiting' : 'door.notices.emptyInfo')}
            detail={t(tab === 'waiting' ? 'door.notices.emptyWaitingDetail' : 'door.notices.emptyInfoDetail')}
          />
        ) : (
          <ul className="door-notices">
            {shown.map((n) => {
              const when = dayLabel(n.createdAt);
              const href = safeHref(n.href);
              return (
                <li key={n.key} className={`panel door-notice${n.read ? '' : ' unread'}`}>
                  <div className="door-notice-main">
                    <div className="door-notice-title">
                      {!n.read && <span className="door-dot" role="img" aria-label={t('door.notices.unread')} />}
                      <strong>{href ? <Link to={href}>{n.title}</Link> : n.title}</strong>
                    </div>
                    {n.body && <p className="muted">{n.body}</p>}
                    <p className="muted door-notice-meta">
                      <span className="door-chip">{systemName(n.systemId)}</span>{' '}
                      {when.kind === 'date' ? when.date : t(when.kind === 'today' ? 'door.notices.today' : 'door.notices.yesterday')}
                    </p>
                  </div>
                  <button type="button" className="btn ghost sm" onClick={() => void toggle(n)}>
                    {t(n.read ? 'door.notices.markUnread' : 'door.notices.markRead')}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </LoadState>
    </section>
  );
}
