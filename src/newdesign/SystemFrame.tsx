import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useT } from '../i18n/I18nContext';
import { useFrontDoor } from './FrontDoorContext';
import { buildMenu } from './menu';

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
        <Link className="btn ghost sm" to="/portal">
          {t('door.frame.allSystems')}
        </Link>
        <div className="door-frame-title">
          <strong>{system.name}</strong>
          <span className="muted">{t('door.portal.role', { role: system.role })}</span>
        </div>
        <div className="door-top-actions">
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
      </nav>
      <div className="door-frame-body">
        <Outlet />
      </div>
    </div>
  );
}
