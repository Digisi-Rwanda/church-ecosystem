import type { PortalSystem } from '../api/frontDoorApi';
import { useT } from '../i18n/I18nContext';
import { groupByKind } from './portalHome';
import { SystemLink } from './SystemLink';

/** The Portal's cards, one per system the person may enter, grouped by kind. */
export function SystemCards({ systems }: { systems: PortalSystem[] }) {
  const t = useT();
  return (
    <>
      {groupByKind(systems).map((g) => (
        <section key={g.kind} aria-labelledby={`door-kind-${g.kind}`} className="door-kind">
          <h2 id={`door-kind-${g.kind}`}>{t(`door.portal.kind.${g.kind}` as 'door.portal.kind.central')}</h2>
          <ul className="door-cards">
            {g.systems.map((s) => (
              <li key={s.id}>
                <SystemLink className="panel door-system-card" to={`/s/${s.id}`} aria-label={t('door.portal.open', { system: s.name })}>
                  <strong>{s.shortName}</strong>
                  <span className="muted">{s.name}</span>
                  <span className="door-role">{t('door.portal.role', { role: s.role })}</span>
                  {s.unreadCount > 0 && <span className="door-unread">{t('door.portal.unread', { count: s.unreadCount })}</span>}
                </SystemLink>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
