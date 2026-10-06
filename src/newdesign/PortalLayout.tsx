import { NavLink, Outlet } from 'react-router-dom';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { buildPortalNav } from './menu';
import { badge } from './notices';
import { useAnnouncementSummary } from './useAnnouncementSummary';
import { useNoticeSummary } from './useNoticeSummary';

/** The Portal frame: who is signed in, and a bar for the blocks that span all my systems. */
export function PortalLayout() {
  const t = useT();
  const { personName, capabilities, signOut } = useFrontDoor();
  const nav = buildPortalNav(capabilities);
  const { counts } = useNoticeSummary();
  const announcements = useAnnouncementSummary();

  return (
    <main className="door-page">
      <header className="door-top">
        <nav className="door-menu door-portal-nav" aria-label={t('door.portal.nav')}>
          {nav.map((item) => (
            <NavLink
              key={item.key}
              to={item.key === 'systems' ? '/portal' : `/portal/${item.key}`}
              end={item.key === 'systems'}
              className={({ isActive }) => `door-menu-link${isActive ? ' active' : ''}`}
            >
              {item.key === 'systems'
                ? t('door.portal.nav.systems')
                : item.key === 'announcements'
                  ? t('door.portal.nav.announcements')
                  : item.key === 'notifications'
                    ? t('door.portal.nav.notifications')
                    : t(`door.block.${item.key}` as const)}
              {item.key === 'notifications' && counts && counts.unread > 0 && (
                <span className="door-badge">{badge(counts.unread)}</span>
              )}
              {item.key === 'announcements' && announcements.unread > 0 && (
                <span className="door-badge">{badge(announcements.unread)}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="door-top-actions">
          {personName && <span className="muted">{t('door.portal.welcome', { name: personName })}</span>}
          <ThemeToggle />
          <button type="button" className="btn secondary sm" onClick={signOut}>
            {t('shell.signOut')}
          </button>
        </div>
      </header>
      <Outlet />
    </main>
  );
}
