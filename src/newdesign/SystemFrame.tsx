import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { buildMenu, buildOwnMenu } from './menu';
import { badge } from './notices';
import { churchWideLink } from './portalHome';
import { useNoticeSummary } from './useNoticeSummary';

/**
 * One frame for every system: a header, and a menu of the shared blocks the person
 * holds access to. The menu comes only from the server's capabilities answer.
 */
export function SystemFrame() {
  const t = useT();
  const { systemId = '' } = useParams();
  const { portal, capabilities, signOut } = useFrontDoor();
  const system = portal.find((s) => s.id === systemId);
  const menu = buildMenu(capabilities, systemId);
  const ownMenu = buildOwnMenu(capabilities, systemId);
  const { counts } = useNoticeSummary();
  const churchWide = churchWideLink(portal, systemId);

  if (!system) {
    return (
      <main className="door-page">
        <EmptyState
          variant="error"
          title={t('door.frame.notYours')}
          action={
            <Link className="btn" to="/portal">
              {t('door.frame.allSystems')}
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <div className="door-frame">
      <header className="door-frame-top">
        {churchWide && (
          <Link className="btn ghost sm" to={churchWide}>
            {t('door.frame.churchWide')}
          </Link>
        )}
        <div className="door-frame-title">
          <strong>{system.name}</strong>
          <span className="muted">{t('door.portal.role', { role: system.role })}</span>
        </div>
        <div className="door-top-actions">
          <Link className="btn ghost sm" to={`/portal/notifications?system=${encodeURIComponent(systemId)}`}>
            {t('door.portal.nav.notifications')}
            {counts && (counts.bySystem[systemId] ?? 0) > 0 && <span className="door-badge">{badge(counts.bySystem[systemId] ?? 0)}</span>}
          </Link>
          <ThemeToggle />
          <button type="button" className="btn secondary sm" onClick={signOut}>
            {t('shell.signOut')}
          </button>
        </div>
      </header>
      <nav className="door-menu" aria-label={t('door.frame.menu')}>
        {menu.map((item) => (
          <NavLink
            key={item.block}
            to={item.block === 'home' ? `/s/${systemId}` : `/s/${systemId}/${item.block}`}
            end={item.block === 'home'}
            className={({ isActive }) => `door-menu-link${isActive ? ' active' : ''}`}
          >
            {t(`door.block.${item.block}` as const)}
          </NavLink>
        ))}
        {ownMenu.map((item) => (
          <NavLink key={item.block} to={`/s/${systemId}/${item.block}`} className={({ isActive }) => `door-menu-link${isActive ? ' active' : ''}`}>
            {t(`door.own.${item.block}${item.variant ? `.${item.variant}` : ''}` as 'door.own.governance')}
          </NavLink>
        ))}
      </nav>
      <div className="door-frame-body">
        <Outlet />
      </div>
    </div>
  );
}
