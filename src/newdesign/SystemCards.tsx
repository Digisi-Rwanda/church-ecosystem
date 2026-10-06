import { Link } from 'react-router-dom';
import type { PortalSystem } from '../api/frontDoorApi';
import { useT } from '../i18n/I18nContext';

/** One card per system, each leading into that system. Shared by the card page and My units. */
export function SystemCards({ systems }: { systems: PortalSystem[] }) {
  const t = useT();
  return (
    <ul className="door-cards">
      {systems.map((s) => (
        <li key={s.id}>
          <Link className="panel door-system-card" to={`/s/${s.id}`} aria-label={t('door.portal.open', { system: s.name })}>
            <strong>{s.shortName}</strong>
            <span className="muted">{s.name}</span>
            <span className="door-role">{t('door.portal.role', { role: s.role })}</span>
            {s.unreadCount > 0 && <span className="door-unread">{t('door.portal.unread', { count: s.unreadCount })}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
