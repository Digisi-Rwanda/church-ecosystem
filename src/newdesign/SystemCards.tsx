import { useMemo, useState } from 'react';
import { fetchWork, type PortalSystem } from '../api/frontDoorApi';
import { useT } from '../i18n/I18nContext';
import { filterSystems, groupByKind, pinnedFirst, readPins, waitingBySystem, writePins } from './portalHome';
import { SystemLink } from './SystemLink';
import { useLoad } from './useLoad';

/**
 * The Portal's cards, one per system the person may enter: pinned systems first, a quick search
 * across systems, and what waits for the person in each one. Systems open in their own tab.
 */
export function SystemCards({ systems }: { systems: PortalSystem[] }) {
  const t = useT();
  const [text, setText] = useState('');
  const [pins, setPins] = useState<string[]>(readPins);
  const tasks = useLoad(() => fetchWork({ view: 'mine', status: 'open' }), 'portal-cards-work');
  const waiting = useMemo(() => waitingBySystem(tasks.data ?? []), [tasks.data]);

  const toggle = (id: string) => {
    const next = pins.includes(id) ? pins.filter((p) => p !== id) : [...pins, id];
    setPins(next);
    writePins(next);
  };

  const card = (s: PortalSystem) => {
    const w = waiting.get(s.id);
    const pinned = pins.includes(s.id);
    return (
      <li key={s.id} className="door-card-wrap">
        <SystemLink className="panel door-system-card" to={`/s/${s.id}`} aria-label={t('door.portal.open', { system: s.name })}>
          <strong>{s.shortName}</strong>
          <span className="muted">{s.name}</span>
          <span className="door-role">{t('door.portal.role', { role: s.role })}</span>
          <span className="door-waiting">
            {s.unreadCount > 0 && <span className="door-unread">{t('door.portal.unread', { count: s.unreadCount })}</span>}
            {w && w.open > 0 && <span className="door-unread">{t('door.portal.waiting.tasks', { count: w.open })}</span>}
            {w && w.overdue > 0 && <span className="door-chip warn">{t('door.portal.waiting.overdue', { count: w.overdue })}</span>}
          </span>
        </SystemLink>
        <button
          type="button"
          className={`door-pin${pinned ? ' on' : ''}`}
          aria-pressed={pinned}
          aria-label={t(pinned ? 'door.portal.unpin' : 'door.portal.pin', { system: s.name })}
          title={t(pinned ? 'door.portal.unpin' : 'door.portal.pin', { system: s.name })}
          onClick={() => toggle(s.id)}
        >
          {pinned ? '★' : '☆'}
        </button>
      </li>
    );
  };

  const visible = filterSystems(systems, text);
  const { pinned, rest } = pinnedFirst(visible, pins);
  return (
    <>
      {systems.length > 3 && (
        <div className="door-search">
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('door.portal.search')}
            aria-label={t('door.portal.search')}
          />
        </div>
      )}
      {visible.length === 0 && <p className="muted">{t('door.portal.search.none')}</p>}
      {pinned.length > 0 && (
        <section aria-labelledby="door-kind-pinned" className="door-kind">
          <h2 id="door-kind-pinned">{t('door.portal.pinned')}</h2>
          <ul className="door-cards">{pinned.map(card)}</ul>
        </section>
      )}
      {groupByKind(rest).map((g) => (
        <section key={g.kind} aria-labelledby={`door-kind-${g.kind}`} className="door-kind">
          <h2 id={`door-kind-${g.kind}`}>{t(`door.portal.kind.${g.kind}` as 'door.portal.kind.central')}</h2>
          <ul className="door-cards">{g.systems.map(card)}</ul>
        </section>
      ))}
    </>
  );
}
