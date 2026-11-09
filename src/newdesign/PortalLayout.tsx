import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Icon, type IconName } from '../components/ui/Icon';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { LanguageSwitch } from './LanguageSwitch';
import { buildPortalModules } from './menu';
import { badge } from './notices';
import { OfflineBanner } from './OfflineBanner';
import { useAnnouncementSummary } from './useAnnouncementSummary';
import { useNoticeSummary } from './useNoticeSummary';
import { RouteSuspense } from './kit/RouteSuspense';

const ICON: Record<string, IconName> = { home: 'home', notifications: 'inbox', announcements: 'pulse' };

/**
 * The Portal: the screen before the systems. It has a top bar, not a sidebar: the church name on the left,
 * Home, Notifications and Announcements as tabs in the middle, and language, theme and the person on the right.
 */
export function PortalLayout() {
  const t = useT();
  const { capabilities, portal, signOut, personName } = useFrontDoor();
  const { counts } = useNoticeSummary();
  const announcements = useAnnouncementSummary();
  const roleLabel = portal.find((s) => s.role !== 'Member')?.role ?? portal[0]?.role;
  const modules = buildPortalModules(capabilities, portal);
  const badges: Record<string, number> = { notifications: counts?.unread ?? 0, announcements: announcements.unread };
  useEffect(() => {
    document.title = `${t('door.frame.portal')} · ADEPR Kacyiru`;
  }, [t]);
  return (
    <div className="ptop-shell">
      <a className="door-skip" href="#door-main">{t('door.frame.skip')}</a>
      <header className="ptop">
        <div className="ptop-inner">
          <div className="ptop-brand">
            <img className="brand-logo" src="/brand/adepr-logo.png" alt="ADEPR" width={36} height={36} />
            <div className="ptop-brand-text">
              <strong>ADEPR Kacyiru</strong>
              <small>{t('door.frame.portal')}</small>
            </div>
          </div>
          <nav className="ptop-nav" aria-label={t('door.frame.modules')}>
            {modules.map((m) => {
              const count = badges[m.id] ?? 0;
              return (
                <NavLink key={m.id} to={m.to} end={m.places[0]?.end} className={({ isActive }) => `ptop-link${isActive ? ' active' : ''}`}>
                  <Icon name={ICON[m.id] ?? 'layers'} size={16} />
                  <span>{t(m.labelKey as 'door.block.home')}</span>
                  {count > 0 && <span className="nav-badge">{badge(count)}</span>}
                </NavLink>
              );
            })}
          </nav>
          <div className="ptop-actions">
            <LanguageSwitch />
            <ThemeToggle />
            <div className="ptop-user">
              <span className="ptop-user-name">{personName}</span>
              <span className="ptop-user-role muted">{roleLabel || t('shell.memberFallback')}</span>
            </div>
            <button type="button" className="btn sm btn-signout" onClick={signOut}>{t('shell.signOut')}</button>
          </div>
        </div>
      </header>
      <OfflineBanner />
      <main id="door-main" className="ptop-content door-content" tabIndex={-1}>
        <RouteSuspense>
          <Outlet />
        </RouteSuspense>
      </main>
    </div>
  );
}
